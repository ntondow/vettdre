"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// ── Auth helper ─────────────────────────────────────────────

async function getCurrentOrg(): Promise<{ userId: string; orgId: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const dbUser = await prisma.user.findFirst({
    where: { OR: [{ authProviderId: user.id }, ...(user.email ? [{ email: user.email }] : [])] },
    select: { id: true, orgId: true },
  });
  if (!dbUser) return null;
  return { userId: dbUser.id, orgId: dbUser.orgId };
}

// ── Types ───────────────────────────────────────────────────

interface DealFilters {
  status?: string;
  structure?: string;
  borough?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface DealStats {
  activeDeals: number;
  screenedThisMonth: number;
  avgCapRate: number;
  totalDealVolume: number;
}

// ── Actions ─────────────────────────────────────────────────

export async function getDeals(filters?: DealFilters) {
  const org = await getCurrentOrg();
  if (!org) return [];

  const where: any = { orgId: org.orgId };

  if (filters?.status) {
    where.status = filters.status;
  }
  if (filters?.structure) {
    where.structure = filters.structure;
  }
  if (filters?.borough) {
    where.borough = filters.borough;
  }
  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { address: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  if (filters?.dateFrom || filters?.dateTo) {
    where.updatedAt = {};
    if (filters.dateFrom) where.updatedAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.updatedAt.lte = new Date(filters.dateTo);
  }

  const deals = await prisma.dealAnalysis.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      address: true,
      borough: true,
      bbl: true,
      status: true,
      dealType: true,
      dealSource: true,
      structure: true,
      inputs: true,
      outputs: true,
      loiSent: true,
      loiSentDate: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return deals.map((d) => ({
    ...d,
    loiSentDate: d.loiSentDate?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }));
}

export async function getDealStats(): Promise<DealStats> {
  const org = await getCurrentOrg();
  if (!org) return { activeDeals: 0, screenedThisMonth: 0, avgCapRate: 0, totalDealVolume: 0 };

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [allDeals, screenedThisMonth] = await Promise.all([
    prisma.dealAnalysis.findMany({
      where: { orgId: org.orgId },
      select: { status: true, inputs: true, outputs: true },
    }),
    prisma.dealAnalysis.count({
      where: {
        orgId: org.orgId,
        createdAt: { gte: monthStart },
      },
    }),
  ]);

  const active = allDeals.filter((d) => d.status !== "closed" && d.status !== "dead");

  let capRateSum = 0;
  let capRateCount = 0;
  let totalVolume = 0;

  for (const d of allDeals) {
    const outputs = d.outputs as any;
    const inputs = d.inputs as any;
    if (outputs?.capRate && outputs.capRate > 0 && isFinite(outputs.capRate)) {
      capRateSum += outputs.capRate;
      capRateCount++;
    }
    if (inputs?.purchasePrice > 0) {
      totalVolume += inputs.purchasePrice;
    }
  }

  return {
    activeDeals: active.length,
    screenedThisMonth,
    avgCapRate: capRateCount > 0 ? capRateSum / capRateCount : 0,
    totalDealVolume: totalVolume,
  };
}

export async function updateDealStatus(dealId: string, status: string) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("Unauthorized");

  await prisma.dealAnalysis.update({
    where: { id: dealId, orgId: org.orgId },
    data: {
      status: status as any,
      ...(status === "loi_sent" ? { loiSent: true, loiSentDate: new Date() } : {}),
    },
  });
}

export async function duplicateDeal(dealId: string): Promise<string> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("Unauthorized");

  const source = await prisma.dealAnalysis.findUnique({
    where: { id: dealId, orgId: org.orgId },
  });
  if (!source) throw new Error("Deal not found");

  const copy = await prisma.dealAnalysis.create({
    data: {
      orgId: org.orgId,
      userId: org.userId,
      name: source.name ? `${source.name} (Copy)` : "Untitled (Copy)",
      address: source.address,
      borough: source.borough,
      block: source.block,
      lot: source.lot,
      bbl: source.bbl,
      status: "analyzing",
      dealType: source.dealType,
      dealSource: source.dealSource,
      structure: source.structure,
      inputs: source.inputs ?? {},
      outputs: source.outputs ?? {},
      notes: source.notes,
    },
  });

  return copy.id;
}

export async function deleteDeal(dealId: string) {
  const org = await getCurrentOrg();
  if (!org) throw new Error("Unauthorized");

  await prisma.dealAnalysis.delete({
    where: { id: dealId, orgId: org.orgId },
  });
}
