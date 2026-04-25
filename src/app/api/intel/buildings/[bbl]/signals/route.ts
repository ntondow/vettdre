/**
 * GET /api/intel/buildings/[bbl]/signals — Lightweight signals-only endpoint.
 * Auth: Supabase session + condo_intel feature gate.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireIntelReadAuth } from "@/lib/condo-ingest/read-auth";
import { serializeSignal } from "@/lib/intel-api-serializers";
import type { IntelBuildingSignalsResponse } from "@/lib/intel-api-types";

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

  const signals = await prisma.coBuildingSignal.findMany({
    where: { orgId: auth.orgId, buildingId: building.id },
    orderBy: { computedAt: "desc" },
  });

  // Deduplicate: most recent per signal_type
  const signalMap = new Map<string, typeof signals[0]>();
  for (const s of signals) {
    if (!signalMap.has(s.signalType)) signalMap.set(s.signalType, s);
  }

  const latestComputed = signals[0]?.computedAt;

  const response: IntelBuildingSignalsResponse = {
    signals: [...signalMap.values()].map(serializeSignal),
    computedAt: latestComputed?.toISOString() || null,
  };

  return NextResponse.json(response);
}
