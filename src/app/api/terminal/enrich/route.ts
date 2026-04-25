/**
 * Terminal Enrichment Cron Endpoint
 *
 * Called by Google Cloud Scheduler offset from ingestion
 * (e.g., ingestion at :00/:15/:30/:45, enrichment at :05/:20/:35/:50).
 *
 * Queries unenriched TerminalEvent records and assembles data packages
 * via BBL-keyed NYC Open Data lookups. Max 50 events per invocation.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { enrichTerminalEvent } from "@/lib/terminal-enrichment";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_EVENTS_PER_RUN = 50;
const MAX_RETRIES = 3;

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
  let enriched = 0;
  let errored = 0;

  try {
    // Find unenriched events (Tier 1 and 2 only, Tier 3 gets no enrichment)
    // Use raw SQL to filter out retried-out events at the DB level
    // (Prisma doesn't support JSON path filtering in where clauses)
    const rawEvents = await prisma.$queryRaw<any[]>`
      SELECT
        id,
        org_id AS "orgId",
        event_type AS "eventType",
        bbl,
        borough,
        nta_code AS "ntaCode",
        detected_at AS "detectedAt",
        source_dataset AS "sourceDataset",
        source_record_id AS "sourceRecordId",
        enrichment_package AS "enrichmentPackage",
        ai_brief AS "aiBrief",
        tier,
        metadata
      FROM terminal_events
      WHERE enrichment_package IS NULL
        AND tier IN (1, 2)
        AND (
          metadata IS NULL
          OR COALESCE((metadata->>'_enrichmentRetries')::int, 0) < ${MAX_RETRIES}
        )
      ORDER BY detected_at DESC
      LIMIT ${MAX_EVENTS_PER_RUN}
    `;

    const events = rawEvents;

    if (events.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No events to enrich",
        duration: Date.now() - start,
      });
    }

    // Process events with Promise.allSettled — one failure doesn't stop others
    // Process in batches of 5 to avoid overwhelming NYC Open Data
    const BATCH_SIZE = 5;

    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const batch = events.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (event) => {
          try {
            const { enrichmentPackage, ntaCode } = await enrichTerminalEvent({
              id: event.id,
              eventType: event.eventType,
              bbl: event.bbl,
              borough: event.borough,
              tier: event.tier,
              detectedAt: event.detectedAt,
              metadata: event.metadata,
            });

            // Update the event with enrichment data
            await prisma.terminalEvent.update({
              where: { id: event.id },
              data: {
                enrichmentPackage: enrichmentPackage as any,
                ...(ntaCode && !event.ntaCode ? { ntaCode } : {}),
              },
            });

            return "enriched";
          } catch (err) {
            console.error(`[Terminal Enrich] Event ${event.id} failed:`, err);

            // Track retry count in metadata
            const currentRetries = (event.metadata as any)?._enrichmentRetries || 0;
            await prisma.terminalEvent.update({
              where: { id: event.id },
              data: {
                metadata: {
                  ...(typeof event.metadata === "object" && event.metadata !== null ? event.metadata : {}),
                  _enrichmentRetries: currentRetries + 1,
                  _enrichmentError: err instanceof Error ? err.message : String(err),
                } as any,
              },
            }).catch(() => {}); // Don't throw on metadata update failure

            return "error";
          }
        }),
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          if (r.value === "enriched") enriched++;
          else errored++;
        } else {
          errored++;
        }
      }

      // Stagger batches to respect API rate limits
      if (i + BATCH_SIZE < events.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    console.log(
      `[Terminal Enrich] Complete: ${enriched} enriched, ${errored} errors in ${Date.now() - start}ms`,
    );

    return NextResponse.json({
      success: true,
      eventsFound: events.length,
      enriched,
      errored,
      duration: Date.now() - start,
    });
  } catch (error) {
    console.error("[Terminal Enrich] Fatal error:", error);
    return NextResponse.json({
      error: "Enrichment failed",
      message: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    }, { status: 500 });
  }
}
