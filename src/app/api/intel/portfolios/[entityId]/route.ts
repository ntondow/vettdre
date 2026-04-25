/**
 * GET /api/intel/portfolios/[entityId] — Full portfolio of an entity.
 * Auth: Supabase session + condo_intel feature gate.
 * Query: ?include_related=true|false (default true, confidence >= 0.85)
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireIntelReadAuth } from "@/lib/condo-ingest/read-auth";
import { serializeEntity, serializeRelatedEntity, serializePortfolioBuilding } from "@/lib/intel-api-serializers";
import type { IntelPortfolioResponse, IntelPortfolioSummary } from "@/lib/intel-api-types";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> },
) {
  const auth = await requireIntelReadAuth();
  if (auth instanceof NextResponse) return auth;

  const { entityId } = await params;
  if (!entityId) return NextResponse.json({ error: "entityId required" }, { status: 400 });

  const entity = await prisma.coEntity.findFirst({
    where: { id: entityId, orgId: auth.orgId },
  });
  if (!entity) return NextResponse.json({ error: "Entity not found" }, { status: 404 });

  const includeRelated = request.nextUrl.searchParams.get("include_related") !== "false";

  // Collect entity IDs: primary + related (confidence >= 0.85)
  const entityIds = [entityId];
  const relatedEntities: Array<{ entityId: string; name: string; edgeType: string; confidence: number }> = [];

  if (includeRelated) {
    const edges = await prisma.coEntityResolutionEdge.findMany({
      where: {
        OR: [{ sourceEntityId: entityId }, { targetEntityId: entityId }],
        confidence: { gte: 0.85 },
      },
      include: {
        sourceEntity: { select: { id: true, canonicalName: true } },
        targetEntity: { select: { id: true, canonicalName: true } },
      },
      take: 50,
    });

    for (const e of edges) {
      const otherId = e.sourceEntityId === entityId ? e.targetEntityId : e.sourceEntityId;
      const otherName = e.sourceEntityId === entityId ? e.targetEntity.canonicalName : e.sourceEntity.canonicalName;
      if (!entityIds.includes(otherId)) {
        entityIds.push(otherId);
        relatedEntities.push({
          entityId: otherId,
          name: otherName,
          edgeType: e.edgeType,
          confidence: Number(e.confidence),
        });
      }
    }
  }

  // Fetch all buildings owned by any of these entities
  const ownerships = await prisma.coUnitOwnershipCurrent.findMany({
    where: { orgId: auth.orgId, currentOwnerEntityId: { in: entityIds } },
    include: {
      building: { select: { id: true, bbl: true, address: true, totalUnits: true } },
    },
  });

  // Deduplicate by building
  const buildingMap = new Map<string, { building: any; role: "direct" | "via_related_llc"; mortgageAmt: number }>();
  for (const o of ownerships) {
    if (!o.building) continue;
    const bid = o.building.id;
    const role = o.currentOwnerEntityId === entityId ? "direct" as const : "via_related_llc" as const;
    if (!buildingMap.has(bid) || role === "direct") {
      buildingMap.set(bid, { building: o.building, role, mortgageAmt: 0 });
    }
  }

  // Fetch signal counts and distress flags per building
  const buildingIds = [...buildingMap.keys()];
  const signalCounts = await prisma.coBuildingSignal.groupBy({
    by: ["buildingId"],
    where: { orgId: auth.orgId, buildingId: { in: buildingIds } },
    _count: { id: true },
  });
  const signalCountMap = new Map(signalCounts.map(s => [s.buildingId, s._count.id]));

  const distressFlags = await prisma.coBuildingSignal.findMany({
    where: {
      orgId: auth.orgId,
      buildingId: { in: buildingIds },
      signalType: "pre_foreclosure_risk",
      score: { gte: 60 },
    },
    select: { buildingId: true },
  });
  const distressSet = new Set(distressFlags.map(d => d.buildingId));

  // Fetch mortgage totals
  const mortgageTotals = await prisma.$queryRaw<Array<{ building_id: string; total: number }>>`
    SELECT building_id, COALESCE(SUM(amount), 0)::numeric as total
    FROM condo_ownership.mortgages
    WHERE org_id = ${auth.orgId} AND building_id = ANY(${buildingIds}) AND status = 'active'
    GROUP BY building_id
  `.catch(() => []);
  const mortgageMap = new Map(mortgageTotals.map(m => [m.building_id, Number(m.total)]));

  const buildings = [...buildingMap.entries()].map(([bid, data]) =>
    serializePortfolioBuilding(
      data.building,
      signalCountMap.get(bid) || 0,
      distressSet.has(bid),
      data.role,
    ),
  );

  const directCount = buildings.filter(b => b.ownershipRole === "direct").length;
  const relatedCount = buildings.filter(b => b.ownershipRole === "via_related_llc").length;
  const totalMortgage = [...mortgageMap.values()].reduce((s, v) => s + v, 0);

  const summary: IntelPortfolioSummary = {
    directBuildings: directCount,
    relatedBuildings: relatedCount,
    totalUnits: buildings.reduce((s, b) => s + (b.totalUnits || 0), 0),
    distressCount: distressFlags.length,
    totalOutstandingMortgage: totalMortgage,
  };

  const response: IntelPortfolioResponse = {
    primaryEntity: serializeEntity(entity),
    relatedEntities: relatedEntities.map(serializeRelatedEntity),
    buildings,
    summary,
  };

  return NextResponse.json(response);
}
