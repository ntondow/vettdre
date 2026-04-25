/**
 * Building Signals Recompute Cron Endpoint
 *
 * Recomputes all 4 signal types (forcedSaleProbability, assemblageOpportunity,
 * exemptionCliff, sponsorOverhang) for buildings touched in last 36 hours.
 *
 * Query params:
 *   ?full=true — weekly full recompute (all buildings, not just recently touched)
 *   ?window=48 — custom window hours (default 36)
 *
 * Schedule: daily 07:00 UTC (after distress-recompute at 06:00)
 */

import { NextRequest, NextResponse } from "next/server";
import { authAndResolveOrg } from "@/lib/condo-ingest/cron-helpers";
import { recomputeBuildingSignals } from "@/lib/condo-ingest/building-signals";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = await authAndResolveOrg(request);
  if (auth instanceof NextResponse) return auth;

  const full = request.nextUrl.searchParams.get("full") === "true";
  const windowHours = parseInt(request.nextUrl.searchParams.get("window") || "36");

  try {
    let buildingIds: string[] | undefined;

    if (full) {
      // Full recompute: all buildings
      buildingIds = await prisma.coBuilding.findMany({
        where: { orgId: auth.orgId },
        select: { id: true },
        take: 1000,
      }).then(r => r.map(b => b.id));
    }

    const result = await recomputeBuildingSignals(auth.orgId, buildingIds, windowHours);
    return NextResponse.json({ success: true, mode: full ? "full" : "incremental", ...result });
  } catch (error) {
    return NextResponse.json({
      error: "Building signals recompute failed",
      message: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
