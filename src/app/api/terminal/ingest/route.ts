/**
 * Terminal Ingestion Cron Endpoint
 *
 * Called by Google Cloud Scheduler every 15 minutes.
 * Polls NYC Open Data for new property events and writes TerminalEvent records.
 *
 * Auth: Bearer CRON_SECRET (same pattern as /api/automations/cron)
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { runIngestion, seedDatasetRegistry } from "@/lib/terminal-ingestion";
import { matchNewEventsToWatchlists } from "@/lib/terminal-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Cloud Run 5-minute timeout

export async function GET(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[Terminal Ingest] CRON_SECRET not configured");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();

  try {
    // Ensure DatasetRegistry is seeded (idempotent)
    await seedDatasetRegistry();

    // Resolve orgId — for MVP, use the first org in the database
    // In multi-tenant future, this would iterate over all orgs or use a system org
    const org = await prisma.organization.findFirst({
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    if (!org) {
      return NextResponse.json({
        error: "No organization found — cannot ingest events",
        duration: Date.now() - start,
      }, { status: 500 });
    }

    // Run ingestion
    const summary = await runIngestion(org.id);

    console.log(
      `[Terminal Ingest] Complete: ${summary.datasetsPolled} polled, ` +
      `${summary.datasetsSkipped} skipped, ${summary.datasetsErrored} errors, ` +
      `${summary.totalEventsCreated} events created in ${summary.totalDurationMs}ms`,
    );

    // Match new events against active watchlists
    let alertResult = null;
    if (summary.totalEventsCreated > 0) {
      try {
        alertResult = await matchNewEventsToWatchlists(org.id);
        if (alertResult.alertsCreated > 0) {
          console.log(
            `[Terminal Ingest] Alerts: ${alertResult.alertsCreated} created ` +
            `(${alertResult.eventsChecked} events × ${alertResult.watchlistsChecked} watchlists, ${alertResult.durationMs}ms)`,
          );
        }
      } catch (err) {
        console.error("[Terminal Ingest] Alert matching failed (non-fatal):", err);
      }
    }

    return NextResponse.json({
      success: true,
      ...summary,
      alerts: alertResult,
    });
  } catch (error) {
    console.error("[Terminal Ingest] Fatal error:", error);
    return NextResponse.json({
      error: "Ingestion failed",
      message: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    }, { status: 500 });
  }
}
