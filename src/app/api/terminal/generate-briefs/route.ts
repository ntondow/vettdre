/**
 * Terminal AI Brief Generation Cron Endpoint
 *
 * Called by Cloud Scheduler after enrichment completes.
 * Processes enriched events sequentially to avoid Anthropic rate limits.
 * Max 30 events per invocation (~90 seconds at ~3s per brief).
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateBrief } from "@/lib/terminal-ai";
import type { EnrichmentPackage } from "@/lib/terminal-enrichment";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_EVENTS_PER_RUN = 30;
const DELAY_BETWEEN_CALLS_MS = 200;
const MAX_BRIEF_RETRIES = 3;

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
      take: MAX_EVENTS_PER_RUN * 2, // Over-fetch for client-side retry filtering
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

    // Process sequentially to respect Anthropic rate limits
    for (const event of events) {
      if (rateLimited) break;

      try {
        const enrichmentPackage = event.enrichmentPackage as unknown as EnrichmentPackage;
        if (!enrichmentPackage) {
          errored++;
          continue;
        }

        const result = await generateBrief({
          id: event.id,
          eventType: event.eventType,
          bbl: event.bbl,
          tier: event.tier,
          enrichmentPackage,
        });

        if (result) {
          // Store brief text in aiBrief, colorTags + headline in metadata
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

          generated++;
          totalInputTokens += result.tokensUsed.input;
          totalOutputTokens += result.tokensUsed.output;
        } else {
          // Generation failed — increment retry counter
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
          errored++;
        }
      } catch (err: any) {
        if (err?.rateLimited) {
          console.warn("[Terminal Briefs] Rate limited by Anthropic — stopping batch");
          rateLimited = true;
          break;
        }

        // Record error on event
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
        errored++;
      }

      // Delay between calls
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_CALLS_MS));
    }

    console.log(
      `[Terminal Briefs] Complete: ${generated} generated, ${errored} errors, ` +
      `${totalInputTokens + totalOutputTokens} tokens used in ${Date.now() - start}ms` +
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
