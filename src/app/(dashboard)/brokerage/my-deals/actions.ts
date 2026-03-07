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

// ── My Transactions ──────────────────────────────────────────

export async function getMyTransactions() {
  try {
    const { orgId, agent } = await getCurrentUserAndAgent();
    if (!agent) return [];

    // Get transactions where agent is primary OR has a TransactionAgent record
    const [primaryTransactions, agentSplits] = await Promise.all([
      prisma.transaction.findMany({
        where: { orgId, agentId: agent.id },
        include: {
          tasks: { select: { id: true, isCompleted: true } },
          agents: {
            where: { agentId: agent.id },
            select: {
              role: true,
              splitPct: true,
              payoutAmount: true,
              payoutStatus: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      // Also find transactions where this agent is a co-agent but NOT the primary
      prisma.transactionAgent.findMany({
        where: {
          agentId: agent.id,
          transaction: { orgId, agentId: { not: agent.id } },
        },
        include: {
          transaction: {
            include: {
              tasks: { select: { id: true, isCompleted: true } },
            },
          },
        },
      }),
    ]);

    // Build combined list, adding agent-specific split info
    const primaryTxIds = new Set(primaryTransactions.map((t) => t.id));
    const coAgentTransactions = agentSplits
      .filter((s) => !primaryTxIds.has(s.transactionId))
      .map((s) => ({
        ...s.transaction,
        agents: [{
          role: s.role,
          splitPct: s.splitPct,
          payoutAmount: s.payoutAmount,
          payoutStatus: s.payoutStatus,
        }],
      }));

    const allTransactions = [...primaryTransactions, ...coAgentTransactions];
    allTransactions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return JSON.parse(JSON.stringify(allTransactions));
  } catch (error) {
    console.error("getMyTransactions error:", error);
    return [];
  }
}

// ── My Stats ──────────────────────────────────────────────────

export async function getMyStats() {
  try {
    const { orgId, agent } = await getCurrentUserAndAgent();
    if (!agent) return { totalDeals: 0, totalVolume: 0, totalPaidEarnings: 0, unpaidEarnings: 0, activeTransactions: 0 };

    const agentId = agent.id;

    const [dealAgg, paidAgg, unpaidAgg, txCount, splitPaidAgg, splitPendingAgg, coAgentTxCount] = await Promise.all([
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
      prisma.transaction.count({
        where: { agentId, orgId, stage: { notIn: ["closed", "cancelled"] } },
      }),
      // TransactionAgent-level paid earnings
      prisma.transactionAgent.aggregate({
        where: { agentId, payoutStatus: "paid", transaction: { orgId } },
        _sum: { payoutAmount: true },
      }),
      // TransactionAgent-level pending earnings
      prisma.transactionAgent.aggregate({
        where: { agentId, payoutStatus: "pending", payoutAmount: { not: null }, transaction: { orgId } },
        _sum: { payoutAmount: true },
      }),
      // Active transactions where agent is co-agent (not primary)
      prisma.transactionAgent.count({
        where: {
          agentId,
          transaction: { orgId, agentId: { not: agentId }, stage: { notIn: ["closed", "cancelled"] } },
        },
      }),
    ]);

    // Use TransactionAgent totals if they exist, otherwise fall back to invoice totals
    const splitPaid = Number(splitPaidAgg._sum.payoutAmount || 0);
    const splitPending = Number(splitPendingAgg._sum.payoutAmount || 0);
    const invoicePaid = Number(paidAgg._sum.agentPayout || 0);
    const invoiceUnpaid = Number(unpaidAgg._sum.agentPayout || 0);

    return {
      totalDeals: dealAgg._count.id || 0,
      totalVolume: Number(dealAgg._sum.transactionValue || 0),
      totalPaidEarnings: splitPaid > 0 ? splitPaid : invoicePaid,
      unpaidEarnings: splitPending > 0 ? splitPending : invoiceUnpaid,
      activeTransactions: txCount + coAgentTxCount,
    };
  } catch (error) {
    console.error("getMyStats error:", error);
    return { totalDeals: 0, totalVolume: 0, totalPaidEarnings: 0, unpaidEarnings: 0, activeTransactions: 0 };
  }
}
