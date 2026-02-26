"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// ── Auth Helper ───────────────────────────────────────────────

async function getCurrentUserAndAgent() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    include: { brokerAgent: true },
  });
  if (!user) throw new Error("User not found");

  return { userId: user.id, orgId: user.orgId, agent: user.brokerAgent };
}

// ── Get My Agent ──────────────────────────────────────────────

export async function getMyAgent() {
  try {
    const { agent } = await getCurrentUserAndAgent();
    if (!agent) return null;
    return JSON.parse(JSON.stringify(agent));
  } catch (error) {
    console.error("getMyAgent error:", error);
    return null;
  }
}

// ── My Submissions ────────────────────────────────────────────

export async function getMySubmissions(filters?: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  try {
    const { orgId, agent } = await getCurrentUserAndAgent();
    if (!agent) return { submissions: [], total: 0, counts: {}, page: 1, totalPages: 0 };

    const status = filters?.status || "all";
    const search = filters?.search?.trim() || "";
    const page = filters?.page || 1;
    const limit = filters?.limit || 25;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { orgId, agentId: agent.id };

    if (status !== "all") {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { propertyAddress: { contains: search, mode: "insensitive" } },
        { clientName: { contains: search, mode: "insensitive" } },
      ];
    }

    const [submissions, total, statusCounts] = await Promise.all([
      prisma.dealSubmission.findMany({
        where,
        include: {
          invoice: { select: { id: true, invoiceNumber: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.dealSubmission.count({ where }),
      prisma.dealSubmission.groupBy({
        by: ["status"],
        where: { orgId, agentId: agent.id },
        _count: { status: true },
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const row of statusCounts) {
      counts[row.status] = row._count.status;
    }

    return JSON.parse(JSON.stringify({
      submissions,
      total,
      counts,
      page,
      totalPages: Math.ceil(total / limit),
    }));
  } catch (error) {
    console.error("getMySubmissions error:", error);
    return { submissions: [], total: 0, counts: {}, page: 1, totalPages: 0 };
  }
}

// ── My Invoices ───────────────────────────────────────────────

export async function getMyInvoices(filters?: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  try {
    const { orgId, agent } = await getCurrentUserAndAgent();
    if (!agent) return { invoices: [], total: 0, counts: {}, page: 1, totalPages: 0 };

    const status = filters?.status || "all";
    const search = filters?.search?.trim() || "";
    const page = filters?.page || 1;
    const limit = filters?.limit || 25;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { orgId, agentId: agent.id };

    if (status !== "all") {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: "insensitive" } },
        { propertyAddress: { contains: search, mode: "insensitive" } },
      ];
    }

    const [invoices, total, statusCounts] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          dealSubmission: { select: { id: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.invoice.count({ where }),
      prisma.invoice.groupBy({
        by: ["status"],
        where: { orgId, agentId: agent.id },
        _count: { status: true },
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const row of statusCounts) {
      counts[row.status] = row._count.status;
    }

    return JSON.parse(JSON.stringify({
      invoices,
      total,
      counts,
      page,
      totalPages: Math.ceil(total / limit),
    }));
  } catch (error) {
    console.error("getMyInvoices error:", error);
    return { invoices: [], total: 0, counts: {}, page: 1, totalPages: 0 };
  }
}

// ── My Stats ──────────────────────────────────────────────────

export async function getMyStats() {
  try {
    const { orgId, agent } = await getCurrentUserAndAgent();
    if (!agent) return { totalDeals: 0, totalVolume: 0, totalPaidEarnings: 0, unpaidEarnings: 0 };

    const agentId = agent.id;

    const [dealAgg, paidAgg, unpaidAgg] = await Promise.all([
      prisma.dealSubmission.aggregate({
        where: { agentId, orgId },
        _count: { id: true },
        _sum: { transactionValue: true },
      }),
      prisma.invoice.aggregate({
        where: { agentId, orgId, status: "paid" },
        _sum: { agentPayout: true },
      }),
      prisma.invoice.aggregate({
        where: { agentId, orgId, status: { in: ["draft", "sent"] } },
        _sum: { agentPayout: true },
      }),
    ]);

    return {
      totalDeals: dealAgg._count.id || 0,
      totalVolume: Number(dealAgg._sum.transactionValue || 0),
      totalPaidEarnings: Number(paidAgg._sum.agentPayout || 0),
      unpaidEarnings: Number(unpaidAgg._sum.agentPayout || 0),
    };
  } catch (error) {
    console.error("getMyStats error:", error);
    return { totalDeals: 0, totalVolume: 0, totalPaidEarnings: 0, unpaidEarnings: 0 };
  }
}
