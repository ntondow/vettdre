/**
 * Mortgage Sync Cron Endpoint
 *
 * Daily sync of ACRIS mortgage documents → Co_mortgages.
 * Triggers distress signal recomputation for affected BBLs.
 * Schedule: daily 05:00 UTC (after acris-sync at 04:00)
 */

import { NextRequest, NextResponse } from "next/server";
import { authAndResolveOrg } from "@/lib/condo-ingest/cron-helpers";
import { syncMortgages } from "@/lib/condo-ingest/mortgages";
import { recomputeDistressSignals } from "@/lib/condo-ingest/distress-signals";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = await authAndResolveOrg(request);
  if (auth instanceof NextResponse) return auth;

  try {
    // Phase 1: Sync mortgages
    const syncResult = await syncMortgages(auth.orgId);

    // Phase 2: Recompute distress for touched BBLs
    let distressResult = { computed: 0, errors: 0, durationMs: 0 };
    if (syncResult.bblsTouched.size > 0) {
      // Resolve BBLs to building IDs
      const buildingIds = await prisma.coBuilding.findMany({
        where: { orgId: auth.orgId, bbl: { in: [...syncResult.bblsTouched].slice(0, 200) } },
        select: { id: true },
      }).then(r => r.map(b => b.id));

      if (buildingIds.length > 0) {
        distressResult = await recomputeDistressSignals(auth.orgId, buildingIds);
      }
    }

    return NextResponse.json({
      success: true,
      mortgages: {
        documentsProcessed: syncResult.documentsProcessed,
        mortgagesUpserted: syncResult.mortgagesUpserted,
        chainsLinked: syncResult.chainsLinked,
        bblsTouched: syncResult.bblsTouched.size,
        errors: syncResult.errors,
        durationMs: syncResult.durationMs,
      },
      distress: distressResult,
    });
  } catch (error) {
    return NextResponse.json({
      error: "Mortgage sync failed",
      message: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
