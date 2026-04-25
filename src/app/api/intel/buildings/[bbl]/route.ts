/**
 * GET /api/intel/buildings/[bbl] — Full building intelligence dossier.
 * Auth: Supabase session + condo_intel feature gate (pro+ plan).
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireIntelReadAuth } from "@/lib/condo-ingest/read-auth";
import { serializeBuilding, serializeSignal, serializeExemption } from "@/lib/intel-api-serializers";
import type { IntelBuildingResponse, IntelOwnershipSummary, IntelMortgageSummary, IntelLastSale } from "@/lib/intel-api-types";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bbl: string }> },
) {
  const auth = await requireIntelReadAuth();
  if (auth instanceof NextResponse) return auth;

  const { bbl } = await params;
  if (!bbl || bbl.length !== 10 || !/^\d{10}$/.test(bbl)) {
    return NextResponse.json({ error: "Invalid BBL format (expected 10 digits)" }, { status: 400 });
  }

  const building = await prisma.coBuilding.findFirst({
    where: { orgId: auth.orgId, bbl },
  });
  if (!building) {
    return NextResponse.json({ error: "Building not found" }, { status: 404 });
  }

  // Fetch ownership summary
  const ownershipStats = await prisma.$queryRaw<[{
    unique_owners: bigint;
    primary_pct: number;
    investor_pct: number;
    sponsor_count: bigint;
  }]>`
    SELECT
      COUNT(DISTINCT current_owner_entity)::bigint as unique_owners,
      COALESCE(AVG(CASE WHEN primary_residence_flag = true THEN 1.0 ELSE 0.0 END) * 100, 0) as primary_pct,
      COALESCE(AVG(CASE WHEN mailing_differs_from_unit = true AND (primary_residence_flag IS NULL OR primary_residence_flag = false) THEN 1.0 ELSE 0.0 END) * 100, 0) as investor_pct,
      0::bigint as sponsor_count
    FROM condo_ownership.unit_ownership_current
    WHERE org_id = ${auth.orgId} AND building_id = ${building.id}
  `.then(r => r[0]).catch(() => ({ unique_owners: 0n, primary_pct: 0, investor_pct: 0, sponsor_count: 0n }));

  const ownershipSummary: IntelOwnershipSummary = {
    uniqueOwners: Number(ownershipStats.unique_owners),
    primaryResidencePct: Math.round(ownershipStats.primary_pct),
    investorPct: Math.round(ownershipStats.investor_pct),
    sponsorOwnedCount: Number(ownershipStats.sponsor_count),
  };

  // Fetch mortgage summary
  const mortgages = await prisma.coMortgage.findMany({
    where: { orgId: auth.orgId, buildingId: building.id, status: "active" },
    include: { lenderEntity: { select: { canonicalName: true, isBank: true } } },
  });

  const lenderMap = new Map<string, { amount: number; isBank: boolean }>();
  let totalAmount = 0;
  let distressCount = 0;
  for (const m of mortgages) {
    const amt = m.amount ? Number(m.amount) : 0;
    totalAmount += amt;
    const lName = m.lenderEntity?.canonicalName || "Unknown";
    const existing = lenderMap.get(lName) || { amount: 0, isBank: m.lenderEntity?.isBank || false };
    existing.amount += amt;
    lenderMap.set(lName, existing);
    if (m.lenderEntity && !m.lenderEntity.isBank) distressCount++;
  }

  const mortgageSummary: IntelMortgageSummary = {
    activeMortgages: mortgages.length,
    totalMortgageAmount: totalAmount,
    lenderBreakdown: [...lenderMap.entries()].map(([name, d]) => ({ lenderName: name, amount: d.amount, isBank: d.isBank })),
    distressLenderCount: distressCount,
    weightedAvgMaturityYears: null, // computed when maturity dates are populated
  };

  // Fetch signals
  const signals = await prisma.coBuildingSignal.findMany({
    where: { orgId: auth.orgId, buildingId: building.id },
    orderBy: { computedAt: "desc" },
  });
  // Deduplicate: keep most recent per signal_type
  const signalMap = new Map<string, typeof signals[0]>();
  for (const s of signals) {
    if (!signalMap.has(s.signalType)) signalMap.set(s.signalType, s);
  }

  // Fetch last sale
  const lastOwnership = await prisma.$queryRaw<Array<{
    last_sale_date: Date | null;
    last_sale_price: number | null;
    last_deed_doc_id: string | null;
    grantor_name: string | null;
    current_owner_name: string | null;
  }>>`
    SELECT last_sale_date, last_sale_price, last_deed_doc_id, grantor_name, current_owner_name
    FROM condo_ownership.unit_ownership_current
    WHERE org_id = ${auth.orgId} AND building_id = ${building.id}
    ORDER BY last_sale_date DESC NULLS LAST
    LIMIT 1
  `.then(r => r[0] || null).catch(() => null);

  const lastSale: IntelLastSale | null = lastOwnership ? {
    date: lastOwnership.last_sale_date?.toISOString().split("T")[0] || "",
    price: lastOwnership.last_sale_price ? Number(lastOwnership.last_sale_price) : null,
    docId: lastOwnership.last_deed_doc_id,
    grantor: lastOwnership.grantor_name,
    grantee: lastOwnership.current_owner_name,
  } : null;

  // Fetch exemptions
  const exemptions = await prisma.coPropertyExemption.findMany({
    where: { orgId: auth.orgId, OR: [{ buildingId: building.id }, { bbl }] },
    orderBy: { expirationDate: "asc" },
    take: 50,
  });

  const response: IntelBuildingResponse = {
    building: serializeBuilding(building),
    ownershipSummary,
    mortgageSummary,
    signals: [...signalMap.values()].map(serializeSignal),
    lastSale,
    exemptions: exemptions.map(serializeExemption),
  };

  return NextResponse.json(response);
}
