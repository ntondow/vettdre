/**
 * Distress Signal Full Recompute Cron Endpoint
 *
 * Weekly full recompute of pre-foreclosure risk for all buildings
 * that have mortgages or active tax liens.
 * Schedule: weekly Sunday 06:00 UTC
 */

import { NextRequest, NextResponse } from "next/server";
import { authAndResolveOrg } from "@/lib/condo-ingest/cron-helpers";
import { recomputeDistressSignals } from "@/lib/condo-ingest/distress-signals";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = await authAndResolveOrg(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await recomputeDistressSignals(auth.orgId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({
      error: "Distress recompute failed",
      message: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
