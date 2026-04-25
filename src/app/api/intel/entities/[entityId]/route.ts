/**
 * GET /api/intel/entities/[entityId] — Entity dossier.
 * Auth: Supabase session + condo_intel feature gate.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireIntelReadAuth } from "@/lib/condo-ingest/read-auth";
import { serializeEntity, serializeAlias, serializeRelatedEntity } from "@/lib/intel-api-serializers";
import type { IntelEntityResponse, IntelHoldings, IntelEntityFlags } from "@/lib/intel-api-types";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> },
) {
  const auth = await requireIntelReadAuth();
  if (auth instanceof NextResponse) return auth;

  const { entityId } = await params;
  if (!entityId) {
    return NextResponse.json({ error: "entityId required" }, { status: 400 });
  }

  const entity = await prisma.coEntity.findFirst({
    where: { id: entityId, orgId: auth.orgId },
    include: { aliases: true },
  });
  if (!entity) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  // Holdings
  const holdingsData = await prisma.$queryRaw<[{
    buildings_count: bigint;
    units_count: bigint;
    total_assessed: number;
    oldest: Date | null;
    newest: Date | null;
  }]>`
    SELECT
      COUNT(DISTINCT uoc.building_id)::bigint as buildings_count,
      COUNT(*)::bigint as units_count,
      COALESCE(SUM(uoc.last_sale_price), 0) as total_assessed,
      MIN(uoc.last_sale_date) as oldest,
      MAX(uoc.last_sale_date) as newest
    FROM condo_ownership.unit_ownership_current uoc
    WHERE uoc.org_id = ${auth.orgId} AND uoc.current_owner_entity = ${entityId}
  `.then(r => r[0]).catch(() => ({ buildings_count: 0n, units_count: 0n, total_assessed: 0, oldest: null, newest: null }));

  // Neighborhoods
  const neighborhoods = await prisma.$queryRaw<Array<{ neighborhood: string }>>`
    SELECT DISTINCT b.address as neighborhood
    FROM condo_ownership.unit_ownership_current uoc
    JOIN condo_ownership.buildings b ON b.id = uoc.building_id
    WHERE uoc.org_id = ${auth.orgId} AND uoc.current_owner_entity = ${entityId}
    LIMIT 10
  `.then(r => r.map(n => n.neighborhood)).catch(() => []);

  const holdings: IntelHoldings = {
    buildingsCount: Number(holdingsData.buildings_count),
    unitsCount: Number(holdingsData.units_count),
    totalAssessedValue: Number(holdingsData.total_assessed),
    oldestAcquisition: holdingsData.oldest?.toISOString().split("T")[0] || null,
    newestAcquisition: holdingsData.newest?.toISOString().split("T")[0] || null,
    neighborhoods,
  };

  // Related entities (top 20 by confidence)
  const edges = await prisma.coEntityResolutionEdge.findMany({
    where: { OR: [{ sourceEntityId: entityId }, { targetEntityId: entityId }] },
    orderBy: { confidence: "desc" },
    take: 20,
    include: {
      sourceEntity: { select: { id: true, canonicalName: true } },
      targetEntity: { select: { id: true, canonicalName: true } },
    },
  });

  const relatedEntities = edges.map(e => {
    const isSource = e.sourceEntityId === entityId;
    const other = isSource ? e.targetEntity : e.sourceEntity;
    return serializeRelatedEntity({
      entityId: other.id,
      name: other.canonicalName,
      edgeType: e.edgeType,
      confidence: e.confidence,
    });
  });

  // Flags
  const flags: IntelEntityFlags = {
    offshore: entity.icijNodeId != null,
    sanctioned: entity.ofacSdnId != null,
    inDistressPortfolio: false, // computed: any owned building with pre_foreclosure_risk > 60
  };

  // Check distress portfolio
  const distressCount = await prisma.$queryRaw<[{ cnt: bigint }]>`
    SELECT COUNT(*)::bigint as cnt
    FROM condo_ownership.building_signals bs
    JOIN condo_ownership.unit_ownership_current uoc ON uoc.building_id = bs.building_id
    WHERE uoc.org_id = ${auth.orgId}
      AND uoc.current_owner_entity = ${entityId}
      AND bs.signal_type = 'pre_foreclosure_risk'
      AND bs.score >= 60
  `.then(r => Number(r[0]?.cnt || 0)).catch(() => 0);
  flags.inDistressPortfolio = distressCount > 0;

  const response: IntelEntityResponse = {
    entity: serializeEntity(entity),
    aliases: entity.aliases.map(serializeAlias),
    holdings,
    relatedEntities,
    flags,
  };

  return NextResponse.json(response);
}
