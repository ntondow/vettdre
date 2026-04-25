/**
 * Condo Units Refresh Cron Endpoint
 *
 * Populates condo_ownership.buildings + units from eguu-7ie3 (Digital Tax Map).
 * Schedule: weekly Sunday 03:00 ET (08:00 UTC)
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { refreshCondoUnits } from "@/lib/condo-ingest/units";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional borough filter via query param: ?boroughs=1,3
  const boroughsParam = request.nextUrl.searchParams.get("boroughs");
  const boroughs = boroughsParam
    ? boroughsParam.split(",").map(Number).filter((b) => b >= 1 && b <= 5)
    : [1, 2, 3, 4, 5];

  try {
    // Use first org (MVP single-tenant pattern — matches terminal ingest)
    const org = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!org) {
      return NextResponse.json({ error: "No organization found" }, { status: 500 });
    }

    const result = await refreshCondoUnits(org.id, boroughs);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[Condo Units Refresh] Fatal error:", error);
    return NextResponse.json({
      error: "Condo units refresh failed",
      message: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
