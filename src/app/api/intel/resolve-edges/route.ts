/**
 * Entity Resolution Edge Builder Cron Endpoint
 *
 * Rebuilds resolution edges incrementally — only entities touched in last 36 hours.
 * Schedule: nightly 02:00 UTC (after all Phase 3 syncs complete)
 */

import { NextRequest, NextResponse } from "next/server";
import { authAndResolveOrg } from "@/lib/condo-ingest/cron-helpers";
import { buildResolutionEdges } from "@/lib/condo-ingest/edge-builder";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = await authAndResolveOrg(request);
  if (auth instanceof NextResponse) return auth;

  const windowHours = parseInt(request.nextUrl.searchParams.get("window") || "36");

  try {
    const result = await buildResolutionEdges(auth.orgId, windowHours);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({
      error: "Edge resolution failed",
      message: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
