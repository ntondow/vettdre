/**
 * Terminal Historical Backfill Endpoint
 *
 * One-time manual operation to populate the Terminal with historical events.
 * NOT scheduled — run manually via curl after deployment.
 *
 * Auth: Bearer CRON_SECRET (same pattern as other Terminal endpoints)
 *
 * Usage:
 *   curl -X POST 'https://YOUR_DOMAIN/api/terminal/backfill' \
 *     -H 'Authorization: Bearer YOUR_CRON_SECRET' \
 *     -H 'Content-Type: application/json' \
 *     -d '{"orgId": "org_abc123", "daysBack": 30}'
 */

import { NextRequest, NextResponse } from "next/server";
import { runBackfill } from "@/lib/terminal-backfill";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5-minute timeout

export async function POST(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[Terminal Backfill] CRON_SECRET not configured");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ──────────────────────────────────────────
  let body: { orgId?: string; daysBack?: number; datasets?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { orgId, daysBack = 30, datasets } = body;

  if (!orgId || typeof orgId !== "string") {
    return NextResponse.json({ error: "orgId is required" }, { status: 400 });
  }

  if (typeof daysBack !== "number" || daysBack < 1 || daysBack > 90) {
    return NextResponse.json(
      { error: "daysBack must be between 1 and 90" },
      { status: 400 },
    );
  }

  if (datasets && (!Array.isArray(datasets) || datasets.some((d) => typeof d !== "string"))) {
    return NextResponse.json(
      { error: "datasets must be an array of dataset ID strings" },
      { status: 400 },
    );
  }

  // ── Run backfill ────────────────────────────────────────
  console.log(
    `[Terminal Backfill] Starting: orgId=${orgId}, daysBack=${daysBack}, datasets=${datasets?.join(",") || "all"}`,
  );

  try {
    const summary = await runBackfill(orgId, daysBack, datasets);

    return NextResponse.json({
      ok: true,
      ...summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Terminal Backfill] Unhandled error:", err);
    return NextResponse.json(
      { error: "Backfill failed", message },
      { status: 500 },
    );
  }
}
