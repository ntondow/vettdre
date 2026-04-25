/**
 * ACRIS Incremental Sync Cron Endpoint
 *
 * Mirrors ACRIS Master + Legals + Parties into condo_ownership tables.
 * Recomputes ownership for touched BBLs.
 * Schedule: daily 04:00 ET (09:00 UTC)
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { runAcrisSync } from "@/lib/condo-ingest/acris";
import { recomputeOwnership } from "@/lib/condo-ingest/recompute";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_RECOMPUTE_BBLS = 200; // cap ownership recomputation per run

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const org = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!org) {
      return NextResponse.json({ error: "No organization found" }, { status: 500 });
    }

    // Phase 1: Sync ACRIS Master + Legals + Parties
    const syncResult = await runAcrisSync(org.id);

    // Phase 2: Recompute ownership for touched BBLs
    let ownershipRecomputed = 0;
    let ownershipErrors = 0;
    const bblsToRecompute = [...syncResult.bblsTouched].slice(0, MAX_RECOMPUTE_BBLS);

    for (const bbl of bblsToRecompute) {
      try {
        await recomputeOwnership(org.id, bbl);
        ownershipRecomputed++;
      } catch (err) {
        ownershipErrors++;
        console.error(`[AcrisSync] Ownership recompute error bbl=${bbl}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      sync: {
        masterRecords: syncResult.masterRecords,
        legalsRecords: syncResult.legalsRecords,
        partiesRecords: syncResult.partiesRecords,
        bblsTouched: syncResult.bblsTouched.size,
        errors: syncResult.errors,
        durationMs: syncResult.durationMs,
      },
      ownership: {
        recomputed: ownershipRecomputed,
        errors: ownershipErrors,
        capped: syncResult.bblsTouched.size > MAX_RECOMPUTE_BBLS,
      },
    });
  } catch (error) {
    console.error("[ACRIS Sync] Fatal error:", error);
    return NextResponse.json({
      error: "ACRIS sync failed",
      message: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
