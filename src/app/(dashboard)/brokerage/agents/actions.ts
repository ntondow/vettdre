"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// ── Auth Helper ───────────────────────────────────────────────

async function getCurrentOrg() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");
  return { userId: user.id, orgId: user.orgId };
}

// ── Agent Roster ──────────────────────────────────────────────

export async function getAgents(filters?: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  try {
    const { orgId } = await getCurrentOrg();
    const status = filters?.status || "all";
    const search = filters?.search?.trim() || "";
    const page = filters?.page || 1;
    const limit = filters?.limit || 25;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { orgId };

    if (status !== "all") {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { licenseNumber: { contains: search, mode: "insensitive" } },
      ];
    }

    const [agents, total, statusCounts] = await Promise.all([
      prisma.brokerAgent.findMany({
        where,
        include: {
          commissionPlan: { select: { id: true, name: true, planType: true } },
          _count: { select: { dealSubmissions: true, invoices: true } },
        },
        orderBy: [{ status: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
        skip,
        take: limit,
      }),
      prisma.brokerAgent.count({ where }),
      prisma.brokerAgent.groupBy({
        by: ["status"],
        where: { orgId },
        _count: { status: true },
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const row of statusCounts) {
      counts[row.status] = row._count.status;
    }

    return JSON.parse(JSON.stringify({
      agents,
      total,
      counts,
      page,
      totalPages: Math.ceil(total / limit),
    }));
  } catch (error) {
    console.error("getAgents error:", error);
    return { agents: [], total: 0, counts: {}, page: 1, totalPages: 0 };
  }
}

export async function getAgentById(agentId: string) {
  try {
    const { orgId } = await getCurrentOrg();

    const agent = await prisma.brokerAgent.findFirst({
      where: { id: agentId, orgId },
      include: {
        commissionPlan: {
          include: { tiers: { orderBy: { tierOrder: "asc" } } },
        },
        dealSubmissions: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            invoice: { select: { id: true, invoiceNumber: true, status: true } },
          },
        },
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!agent) return null;

    // Compute aggregates
    const [dealAgg, paidAgg] = await Promise.all([
      prisma.dealSubmission.aggregate({
        where: { agentId, orgId },
        _count: { id: true },
        _sum: { transactionValue: true },
      }),
      prisma.invoice.aggregate({
        where: { agentId, orgId, status: "paid" },
        _sum: { agentPayout: true },
      }),
    ]);

    const totalDeals = dealAgg._count.id || 0;
    const totalVolume = Number(dealAgg._sum.transactionValue || 0);
    const totalEarnings = Number(paidAgg._sum.agentPayout || 0);
    const avgDealSize = totalDeals > 0 ? totalVolume / totalDeals : 0;

    return JSON.parse(JSON.stringify({
      ...agent,
      totalDeals,
      totalVolume,
      totalEarnings,
      avgDealSize,
    }));
  } catch (error) {
    console.error("getAgentById error:", error);
    return null;
  }
}

// ── CRUD ──────────────────────────────────────────────────────

export async function createAgent(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  defaultSplitPct?: number;
  commissionPlanId?: string;
  status?: string;
}) {
  try {
    const { orgId } = await getCurrentOrg();

    // Duplicate email check within org
    const existing = await prisma.brokerAgent.findFirst({
      where: { orgId, email: { equals: input.email, mode: "insensitive" } },
    });
    if (existing) {
      return { success: false, error: "An agent with this email already exists in your brokerage" };
    }

    const agent = await prisma.brokerAgent.create({
      data: {
        orgId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone || null,
        licenseNumber: input.licenseNumber || null,
        licenseExpiry: input.licenseExpiry ? new Date(input.licenseExpiry) : null,
        defaultSplitPct: input.defaultSplitPct ?? 70,
        commissionPlanId: input.commissionPlanId || null,
        status: input.status || "active",
      },
    });

    return JSON.parse(JSON.stringify({ success: true, agent }));
  } catch (error) {
    console.error("createAgent error:", error);
    return { success: false, error: "Failed to create agent" };
  }
}

export async function updateAgent(agentId: string, input: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  defaultSplitPct?: number;
  commissionPlanId?: string;
  status?: string;
}) {
  try {
    const { orgId } = await getCurrentOrg();

    // Verify ownership
    const current = await prisma.brokerAgent.findFirst({
      where: { id: agentId, orgId },
    });
    if (!current) return { success: false, error: "Agent not found" };

    // If email changed, check for duplicates
    if (input.email.toLowerCase() !== current.email.toLowerCase()) {
      const duplicate = await prisma.brokerAgent.findFirst({
        where: {
          orgId,
          email: { equals: input.email, mode: "insensitive" },
          id: { not: agentId },
        },
      });
      if (duplicate) {
        return { success: false, error: "An agent with this email already exists in your brokerage" };
      }
    }

    const agent = await prisma.brokerAgent.update({
      where: { id: agentId },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone || null,
        licenseNumber: input.licenseNumber || null,
        licenseExpiry: input.licenseExpiry ? new Date(input.licenseExpiry) : null,
        defaultSplitPct: input.defaultSplitPct ?? 70,
        commissionPlanId: input.commissionPlanId || null,
        status: input.status || current.status,
      },
    });

    return JSON.parse(JSON.stringify({ success: true, agent }));
  } catch (error) {
    console.error("updateAgent error:", error);
    return { success: false, error: "Failed to update agent" };
  }
}

// ── Status Management ─────────────────────────────────────────

export async function deactivateAgent(agentId: string) {
  try {
    const { orgId } = await getCurrentOrg();

    await prisma.brokerAgent.updateMany({
      where: { id: agentId, orgId },
      data: { status: "inactive" },
    });

    return { success: true };
  } catch (error) {
    console.error("deactivateAgent error:", error);
    return { success: false, error: "Failed to deactivate agent" };
  }
}

export async function reactivateAgent(agentId: string) {
  try {
    const { orgId } = await getCurrentOrg();

    await prisma.brokerAgent.updateMany({
      where: { id: agentId, orgId },
      data: { status: "active" },
    });

    return { success: true };
  } catch (error) {
    console.error("reactivateAgent error:", error);
    return { success: false, error: "Failed to reactivate agent" };
  }
}

export async function deleteAgent(agentId: string) {
  try {
    const { orgId } = await getCurrentOrg();

    const agent = await prisma.brokerAgent.findFirst({
      where: { id: agentId, orgId },
      include: {
        _count: { select: { dealSubmissions: true, invoices: true } },
      },
    });

    if (!agent) return { success: false, error: "Agent not found" };

    if (agent._count.dealSubmissions > 0 || agent._count.invoices > 0) {
      return {
        success: false,
        error: `Cannot delete agent with ${agent._count.dealSubmissions} deal submission(s) and ${agent._count.invoices} invoice(s). Deactivate instead.`,
      };
    }

    await prisma.brokerAgent.delete({ where: { id: agentId } });

    return { success: true };
  } catch (error) {
    console.error("deleteAgent error:", error);
    return { success: false, error: "Failed to delete agent" };
  }
}

// ── Bulk Operations ───────────────────────────────────────────

export async function bulkCreateAgents(agents: Array<{
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  licenseNumber?: string;
  defaultSplitPct?: number;
}>) {
  try {
    const { orgId } = await getCurrentOrg();

    // Fetch existing emails in org for dedup
    const existingAgents = await prisma.brokerAgent.findMany({
      where: { orgId },
      select: { email: true },
    });
    const existingEmails = new Set(existingAgents.map((a) => a.email.toLowerCase()));

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const input of agents) {
      try {
        if (existingEmails.has(input.email.toLowerCase())) {
          skipped++;
          continue;
        }

        await prisma.brokerAgent.create({
          data: {
            orgId,
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            phone: input.phone || null,
            licenseNumber: input.licenseNumber || null,
            defaultSplitPct: input.defaultSplitPct ?? 70,
            status: "active",
          },
        });

        existingEmails.add(input.email.toLowerCase());
        created++;
      } catch (err) {
        errors.push(`Failed to create ${input.firstName} ${input.lastName} (${input.email}): ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    return { success: true, created, skipped, errors, total: agents.length };
  } catch (error) {
    console.error("bulkCreateAgents error:", error);
    return { success: false, created: 0, skipped: 0, errors: ["Bulk operation failed"], total: 0 };
  }
}

// ── Stats ─────────────────────────────────────────────────────

export async function getAgentStats(agentId: string) {
  try {
    const { orgId } = await getCurrentOrg();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [
      totalDealAgg,
      monthDealAgg,
      yearDealAgg,
      paidAgg,
      unpaidAgg,
      commissionAgg,
    ] = await Promise.all([
      // Total deals + volume
      prisma.dealSubmission.aggregate({
        where: { agentId, orgId },
        _count: { id: true },
        _sum: { transactionValue: true },
      }),
      // Deals this month
      prisma.dealSubmission.aggregate({
        where: { agentId, orgId, createdAt: { gte: startOfMonth } },
        _count: { id: true },
      }),
      // Deals this year + volume
      prisma.dealSubmission.aggregate({
        where: { agentId, orgId, createdAt: { gte: startOfYear } },
        _count: { id: true },
        _sum: { transactionValue: true },
      }),
      // Total paid earnings
      prisma.invoice.aggregate({
        where: { agentId, orgId, status: "paid" },
        _sum: { agentPayout: true },
      }),
      // Unpaid earnings (sent invoices)
      prisma.invoice.aggregate({
        where: { agentId, orgId, status: { in: ["draft", "sent"] } },
        _sum: { agentPayout: true },
      }),
      // Average commission %
      prisma.dealSubmission.aggregate({
        where: { agentId, orgId, commissionPct: { not: null } },
        _avg: { commissionPct: true },
      }),
    ]);

    const totalDeals = totalDealAgg._count.id || 0;
    const totalVolume = Number(totalDealAgg._sum.transactionValue || 0);

    return {
      totalDeals,
      dealsThisMonth: monthDealAgg._count.id || 0,
      dealsThisYear: yearDealAgg._count.id || 0,
      totalVolume,
      volumeThisYear: Number(yearDealAgg._sum.transactionValue || 0),
      totalPaidEarnings: Number(paidAgg._sum.agentPayout || 0),
      unpaidEarnings: Number(unpaidAgg._sum.agentPayout || 0),
      avgCommissionPct: Number(commissionAgg._avg.commissionPct || 0),
      avgDealSize: totalDeals > 0 ? totalVolume / totalDeals : 0,
    };
  } catch (error) {
    console.error("getAgentStats error:", error);
    return {
      totalDeals: 0,
      dealsThisMonth: 0,
      dealsThisYear: 0,
      totalVolume: 0,
      volumeThisYear: 0,
      totalPaidEarnings: 0,
      unpaidEarnings: 0,
      avgCommissionPct: 0,
      avgDealSize: 0,
    };
  }
}

// ── User Linking ──────────────────────────────────────────────

export async function linkAgentToUser(agentId: string, userId: string) {
  try {
    const { orgId } = await getCurrentOrg();

    // Verify agent belongs to org
    const agent = await prisma.brokerAgent.findFirst({
      where: { id: agentId, orgId },
    });
    if (!agent) return { success: false, error: "Agent not found" };

    // Verify user exists and belongs to same org
    const user = await prisma.user.findFirst({
      where: { id: userId, orgId },
    });
    if (!user) return { success: false, error: "User not found in this organization" };

    // Check if user is already linked to another agent
    const existingLink = await prisma.brokerAgent.findFirst({
      where: { userId, id: { not: agentId } },
    });
    if (existingLink) {
      return { success: false, error: "This user is already linked to another agent" };
    }

    await prisma.brokerAgent.update({
      where: { id: agentId },
      data: { userId },
    });

    return { success: true };
  } catch (error) {
    console.error("linkAgentToUser error:", error);
    return { success: false, error: "Failed to link agent to user" };
  }
}
