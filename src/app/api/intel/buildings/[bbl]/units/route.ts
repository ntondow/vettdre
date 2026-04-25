/**
 * GET /api/intel/buildings/[bbl]/units — Unit-level ownership directory.
 * Auth: Supabase session + condo_intel feature gate.
 * Pagination: cursor-based (created_at + id), default 50, max 200.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireIntelReadAuth } from "@/lib/condo-ingest/read-auth";
import { serializeUnit } from "@/lib/intel-api-serializers";
import type { IntelUnitsResponse } from "@/lib/intel-api-types";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bbl: string }> },
) {
  const auth = await requireIntelReadAuth();
  if (auth instanceof NextResponse) return auth;

  const { bbl } = await params;
  if (!bbl || !/^\d{10}$/.test(bbl)) {
    return NextResponse.json({ error: "Invalid BBL" }, { status: 400 });
  }

  const building = await prisma.coBuilding.findFirst({
    where: { orgId: auth.orgId, bbl },
    select: { id: true },
  });
  if (!building) {
    return NextResponse.json({ error: "Building not found" }, { status: 404 });
  }

  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "50"), 200);
  const cursor = request.nextUrl.searchParams.get("cursor");
  const filter = request.nextUrl.searchParams.get("filter") || "all";

  // Build ownership filter
  const ownershipWhere: any = { orgId: auth.orgId, buildingId: building.id };
  if (filter === "investor_only") {
    ownershipWhere.mailingDiffersFromUnit = true;
    ownershipWhere.OR = [{ primaryResidenceFlag: null }, { primaryResidenceFlag: false }];
  } else if (filter === "primary_only") {
    ownershipWhere.primaryResidenceFlag = true;
  }

  // Count total
  const totalCount = await prisma.coUnitOwnershipCurrent.count({ where: ownershipWhere });

  // Fetch units with ownership
  const ownerships = await prisma.coUnitOwnershipCurrent.findMany({
    where: ownershipWhere,
    include: { unit: { select: { unitNumber: true, unitBbl: true } } },
    orderBy: [{ lastRefreshed: "desc" }, { id: "asc" }],
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  const hasMore = ownerships.length > limit;
  const items = hasMore ? ownerships.slice(0, limit) : ownerships;
  const nextCursor = hasMore ? items[items.length - 1]?.id || null : null;

  const response: IntelUnitsResponse = {
    units: items.map(o => serializeUnit(o.unit, o)),
    nextCursor,
    totalCount,
  };

  return NextResponse.json(response);
}
