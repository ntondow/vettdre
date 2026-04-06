/**
 * Terminal AI Brief Generation Cron Endpoint
 *
 * Called by Cloud Scheduler every 5 minutes.
 * Processes enriched events in PARALLEL BATCHES of 5 for ~5x throughput.
 * Max 50 events per invocation (~35 seconds with parallelization).
 *
 * Throughput: 50 events/run × 12 runs/hour = ~600 briefs/hour
 * (vs. prior: 30 events/run × 4 runs/hour = ~120 briefs/hour)
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateBrief } from "@/lib/terminal-ai";
import type { EnrichmentPackage } from "@/lib/terminal-enrichment";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_EVENTS_PER_RUN = 50;
const PARALLEL_BATCH_SIZE = 5;
const DELAY_BETWEEN_BATCHES_MS = 200;
const MAX_BRIEF_RETRIES = 3;

// ── Single event processor ──────────────────────────────────

interface ProcessResult {
  eventId: string;
  success: boolean;
  rateLimited?: boolean;
  tokensUsed?: { input: number; output: number };
  error?: string;
}

async function processEvent(event: any): Promise<ProcessResult> {
  const enrichmentPackage = event.enrichmentPackage as unknown as EnrichmentPackage;
  if (!enrichmentPackage) {
    return { eventId: event.id, success: false, error: "No enrichment package" };
  }

  try {
    const result = await generateBrief({
      id: event.id,
      eventType: event.eventType,
      bbl: event.bbl,
      tier: event.tier,
      enrichmentPackage,
    });

    if (result) {
      await prisma.terminalEvent.update({
        where: { id: event.id },
        data: {
          aiBrief: result.brief,
          metadata: {
            ...(typeof event.metadata === "object" && event.metadata !== null ? event.metadata : {}),
            _colorTags: result.colorTags,
            _headline: result.headline,
            _briefGeneratedAt: new Date().toISOString(),
          } as any,
        },
      });

      return {
        eventId: event.id,
        success: true,
        tokensUsed: result.tokensUsed,
      };
    } else {
      const currentRetries = (event.metadata as any)?._briefRetries || 0;
      await prisma.terminalEvent.update({
        where: { id: event.id },
        data: {
          metadata: {
            ...(typeof event.metadata === "object" && event.metadata !== null ? event.metadata : {}),
            _briefRetries: currentRetries + 1,
            _briefError: "Generation returned null",
          } as any,
        },
      }).catch(() => {});

      return { eventId: event.id, success: false, error: "Generation returned null" };
    }
  } catch (err: any) {
    // Detect rate limiting — bubble up so we can stop the whole run
    const isRateLimited = err?.status === 429 || err?.rateLimited;
    if (isRateLimited) {
      return { eventId: event.id, success: false, rateLimited: true, error: "Rate limited" };
    }

    const currentRetries = (event.metadata as any)?._briefRetries || 0;
    await prisma.terminalEvent.update({
      where: { id: event.id },
      data: {
        metadata: {
          ...(typeof event.metadata === "object" && event.metadata !== null ? event.metadata : {}),
          _briefRetries: currentRetries + 1,
          _briefError: err instanceof Error ? err.message : String(err),
        } as any,
      },
    }).catch(() => {});

    return { eventId: event.id, success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Main handler ────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  let generated = 0;
  let errored = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let rateLimited = false;

  try {
    // Find events with enrichment but no brief (Tier 1 and 2 only)
    const rawEvents = await prisma.terminalEvent.findMany({
      where: {
        enrichmentPackage: { not: { equals: null } },
        aiBrief: null,
        tier: { in: [1, 2] },
      },
      orderBy: { detectedAt: "desc" },
      take: MAX_EVENTS_PER_RUN * 2,
    });

    // Client-side filter: skip events that have exceeded brief retry limit
    const events = rawEvents.filter(e => {
      const retries = (e.metadata as any)?._briefRetries || 0;
      return retries < MAX_BRIEF_RETRIES;
    }).slice(0, MAX_EVENTS_PER_RUN);

    if (events.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No events to process",
        duration: Date.now() - start,
      });
    }

    // Process in parallel batches of PARALLEL_BATCH_SIZE
    for (let i = 0; i < events.length; i += PARALLEL_BATCH_SIZE) {
      if (rateLimited) break;

      const batch = events.slice(i, i + PARALLEL_BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(processEvent));

      for (const result of results) {
        if (result.status === "fulfilled") {
          const r = result.value;
          if (r.rateLimited) {
            console.warn("[Terminal Briefs] Rate limited by Anthropic — stopping run");
            rateLimited = true;
            break;
          }
          if (r.success) {
            generated++;
            if (r.tokensUsed) {
              totalInputTokens += r.tokensUsed.input;
              totalOutputTokens += r.tokensUsed.output;
            }
          } else {
            errored++;
          }
        } else {
          // Promise rejected (unexpected)
          errored++;
          console.error("[Terminal Briefs] Unexpected rejection:", result.reason);
        }
      }

      // Small delay between batches to be a good API citizen
      if (i + PARALLEL_BATCH_SIZE < events.length && !rateLimited) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
      }
    }

    console.log(
      `[Terminal Briefs] Complete: ${generated} generated, ${errored} errors, ` +
      `${totalInputTokens + totalOutputTokens} tokens used in ${Date.now() - start}ms` +
      ` (parallel batches of ${PARALLEL_BATCH_SIZE})` +
      (rateLimited ? " (rate limited)" : ""),
    );

    return NextResponse.json({
      success: true,
      eventsFound: events.length,
      generated,
      errored,
      rateLimited,
      tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
      duration: Date.now() - start,
    });
  } catch (error) {
    console.error("[Terminal Briefs] Fatal error:", error);
    return NextResponse.json({
      error: "Brief generation failed",
      message: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    }, { status: 500 });
  }
}
