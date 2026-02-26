"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { CommissionPlanType as PrismaCommissionPlanType } from "@prisma/client";
import type { CommissionPlanInput, CommissionPlanRecord } from "@/lib/bms-types";
import { logAction } from "@/lib/bms-audit";

// ── Auth Helper ───────────────────────────────────────────────

async function getCurrentOrg() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");
  return { userId: user.id, orgId: user.orgId };
}

// ── Commission Plans ──────────────────────────────────────────

export async function getCommissionPlans(filters?: {
  status?: string;
  search?: string;
}): Promise<{ plans: CommissionPlanRecord[]; total: number }> {
  try {
    const { orgId } = await getCurrentOrg();
    const status = filters?.status || "all";
    const search = filters?.search?.trim() || "";

    const where: Record<string, unknown> = { orgId };

    if (status !== "all") {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const [plans, total] = await Promise.all([
      prisma.commissionPlan.findMany({
        where,
        include: {
          tiers: { orderBy: { tierOrder: "asc" } },
          _count: { select: { agents: true } },
        },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      }),
      prisma.commissionPlan.count({ where }),
    ]);

    const mapped = plans.map((p) => ({
      id: p.id,
      orgId: p.orgId,
      name: p.name,
      description: p.description,
      planType: p.planType as string,
      isDefault: p.isDefault,
      status: p.status as string,
      tiers: p.tiers.map((t) => ({
        id: t.id,
        planId: t.planId,
        tierOrder: t.tierOrder,
        minThreshold: Number(t.minThreshold),
        maxThreshold: t.maxThreshold ? Number(t.maxThreshold) : undefined,
        agentSplitPct: Number(t.agentSplitPct),
        houseSplitPct: Number(t.houseSplitPct),
        label: t.label,
      })),
      agentCount: p._count.agents,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));

    return JSON.parse(JSON.stringify({ plans: mapped, total }));
  } catch (error) {
    console.error("getCommissionPlans error:", error);
    return { plans: [], total: 0 };
  }
}

export async function getCommissionPlanById(planId: string) {
  try {
    const { orgId } = await getCurrentOrg();

    const plan = await prisma.commissionPlan.findFirst({
      where: { id: planId, orgId },
      include: {
        tiers: { orderBy: { tierOrder: "asc" } },
        agents: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            defaultSplitPct: true,
          },
        },
      },
    });

    if (!plan) return null;

    return JSON.parse(JSON.stringify({
      id: plan.id,
      orgId: plan.orgId,
      name: plan.name,
      description: plan.description,
      planType: plan.planType as string,
      isDefault: plan.isDefault,
      status: plan.status as string,
      tiers: plan.tiers.map((t) => ({
        id: t.id,
        planId: t.planId,
        tierOrder: t.tierOrder,
        minThreshold: Number(t.minThreshold),
        maxThreshold: t.maxThreshold ? Number(t.maxThreshold) : undefined,
        agentSplitPct: Number(t.agentSplitPct),
        houseSplitPct: Number(t.houseSplitPct),
        label: t.label,
      })),
      agents: plan.agents.map((a) => ({
        id: a.id,
        firstName: a.firstName,
        lastName: a.lastName,
        email: a.email,
        defaultSplitPct: Number(a.defaultSplitPct),
      })),
      agentCount: plan.agents.length,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
    }));
  } catch (error) {
    console.error("getCommissionPlanById error:", error);
    return null;
  }
}

export async function createCommissionPlan(input: CommissionPlanInput) {
  try {
    const { userId, orgId } = await getCurrentOrg();

    const plan = await prisma.$transaction(async (tx) => {
      // If this plan is default, unset others first
      if (input.isDefault) {
        await tx.commissionPlan.updateMany({
          where: { orgId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.commissionPlan.create({
        data: {
          orgId,
          name: input.name,
          description: input.description || null,
          planType: input.planType as PrismaCommissionPlanType,
          isDefault: input.isDefault || false,
          status: "active",
          tiers: {
            create: input.tiers.map((t, i) => ({
              tierOrder: t.tierOrder ?? i,
              minThreshold: t.minThreshold,
              maxThreshold: t.maxThreshold ?? null,
              agentSplitPct: t.agentSplitPct,
              houseSplitPct: 100 - t.agentSplitPct,
              label: t.label || null,
            })),
          },
        },
        include: {
          tiers: { orderBy: { tierOrder: "asc" } },
          _count: { select: { agents: true } },
        },
      });
    });

    logAction({
      orgId,
      actorId: userId,
      action: "created",
      entityType: "commission_plan",
      entityId: plan.id,
      details: { planName: input.name, planType: input.planType },
    });

    return JSON.parse(JSON.stringify({ success: true, plan }));
  } catch (error) {
    console.error("createCommissionPlan error:", error);
    return { success: false, error: "Failed to create commission plan" };
  }
}

export async function updateCommissionPlan(planId: string, input: CommissionPlanInput) {
  try {
    const { userId, orgId } = await getCurrentOrg();

    const plan = await prisma.$transaction(async (tx) => {
      // Verify ownership
      const existing = await tx.commissionPlan.findFirst({
        where: { id: planId, orgId },
      });
      if (!existing) throw new Error("Plan not found");

      // If this plan is default, unset others first
      if (input.isDefault) {
        await tx.commissionPlan.updateMany({
          where: { orgId, isDefault: true, id: { not: planId } },
          data: { isDefault: false },
        });
      }

      // Delete existing tiers
      await tx.commissionTier.deleteMany({ where: { planId } });

      // Update plan + create new tiers
      return tx.commissionPlan.update({
        where: { id: planId },
        data: {
          name: input.name,
          description: input.description || null,
          planType: input.planType as PrismaCommissionPlanType,
          isDefault: input.isDefault || false,
          tiers: {
            create: input.tiers.map((t, i) => ({
              tierOrder: t.tierOrder ?? i,
              minThreshold: t.minThreshold,
              maxThreshold: t.maxThreshold ?? null,
              agentSplitPct: t.agentSplitPct,
              houseSplitPct: 100 - t.agentSplitPct,
              label: t.label || null,
            })),
          },
        },
        include: {
          tiers: { orderBy: { tierOrder: "asc" } },
          _count: { select: { agents: true } },
        },
      });
    });

    logAction({
      orgId,
      actorId: userId,
      action: "updated",
      entityType: "commission_plan",
      entityId: planId,
      details: { planName: input.name, planType: input.planType },
    });

    return JSON.parse(JSON.stringify({ success: true, plan }));
  } catch (error) {
    console.error("updateCommissionPlan error:", error);
    return { success: false, error: "Failed to update commission plan" };
  }
}

export async function deleteCommissionPlan(planId: string) {
  try {
    const { userId, orgId } = await getCurrentOrg();

    await prisma.$transaction(async (tx) => {
      // Verify ownership
      const existing = await tx.commissionPlan.findFirst({
        where: { id: planId, orgId },
      });
      if (!existing) throw new Error("Plan not found");

      // Unlink agents
      await tx.brokerAgent.updateMany({
        where: { commissionPlanId: planId, orgId },
        data: { commissionPlanId: null },
      });

      // Delete plan (tiers cascade)
      await tx.commissionPlan.delete({ where: { id: planId } });
    });

    logAction({
      orgId,
      actorId: userId,
      action: "deleted",
      entityType: "commission_plan",
      entityId: planId,
    });

    return { success: true };
  } catch (error) {
    console.error("deleteCommissionPlan error:", error);
    return { success: false, error: "Failed to delete commission plan" };
  }
}

export async function archiveCommissionPlan(planId: string) {
  try {
    const { orgId } = await getCurrentOrg();

    await prisma.commissionPlan.update({
      where: { id: planId, orgId },
      data: { status: "inactive" },
    });

    return { success: true };
  } catch (error) {
    console.error("archiveCommissionPlan error:", error);
    return { success: false, error: "Failed to archive commission plan" };
  }
}

// ── Agent Assignment ──────────────────────────────────────────

export async function assignPlanToAgents(planId: string, agentIds: string[]) {
  try {
    const { userId, orgId } = await getCurrentOrg();

    // Verify plan belongs to org
    const plan = await prisma.commissionPlan.findFirst({
      where: { id: planId, orgId },
    });
    if (!plan) return { success: false, error: "Plan not found" };

    const result = await prisma.brokerAgent.updateMany({
      where: { id: { in: agentIds }, orgId },
      data: { commissionPlanId: planId },
    });

    logAction({
      orgId,
      actorId: userId,
      action: "assigned_agents",
      entityType: "commission_plan",
      entityId: planId,
      details: { agentCount: result.count, planName: plan.name },
    });

    return { success: true, count: result.count };
  } catch (error) {
    console.error("assignPlanToAgents error:", error);
    return { success: false, error: "Failed to assign plan to agents" };
  }
}

export async function unassignPlanFromAgent(agentId: string) {
  try {
    const { orgId } = await getCurrentOrg();

    await prisma.brokerAgent.updateMany({
      where: { id: agentId, orgId },
      data: { commissionPlanId: null },
    });

    return { success: true };
  } catch (error) {
    console.error("unassignPlanFromAgent error:", error);
    return { success: false, error: "Failed to unassign plan from agent" };
  }
}

// ── Effective Split Calculator ────────────────────────────────

export async function getAgentEffectiveSplit(
  agentId: string,
  transactionValue?: number,
  dealCount?: number,
): Promise<{
  agentSplitPct: number;
  houseSplitPct: number;
  tierLabel: string | null;
  planName: string | null;
}> {
  try {
    const { orgId } = await getCurrentOrg();

    const agent = await prisma.brokerAgent.findFirst({
      where: { id: agentId, orgId },
      include: {
        commissionPlan: {
          include: {
            tiers: { orderBy: { tierOrder: "asc" } },
          },
        },
      },
    });

    if (!agent) {
      return { agentSplitPct: 70, houseSplitPct: 30, tierLabel: null, planName: null };
    }

    const defaultPct = Number(agent.defaultSplitPct);

    // No plan assigned — use agent default
    if (!agent.commissionPlan || agent.commissionPlan.tiers.length === 0) {
      return {
        agentSplitPct: defaultPct,
        houseSplitPct: 100 - defaultPct,
        tierLabel: null,
        planName: null,
      };
    }

    const plan = agent.commissionPlan;
    const tiers = plan.tiers;

    let matchedTier = tiers[0]; // fallback to first tier

    if (plan.planType === "flat") {
      // Flat: always use first tier
      matchedTier = tiers[0];
    } else if (plan.planType === "volume_based") {
      // Volume-based: match on deal count
      const count = dealCount ?? 0;
      for (const tier of tiers) {
        const min = Number(tier.minThreshold);
        const max = tier.maxThreshold ? Number(tier.maxThreshold) : Infinity;
        if (count >= min && count <= max) {
          matchedTier = tier;
          break;
        }
      }
    } else if (plan.planType === "value_based") {
      // Value-based: match on transaction value
      const value = transactionValue ?? 0;
      for (const tier of tiers) {
        const min = Number(tier.minThreshold);
        const max = tier.maxThreshold ? Number(tier.maxThreshold) : Infinity;
        if (value >= min && value <= max) {
          matchedTier = tier;
          break;
        }
      }
    }

    const agentSplitPct = Number(matchedTier.agentSplitPct);

    return {
      agentSplitPct,
      houseSplitPct: 100 - agentSplitPct,
      tierLabel: matchedTier.label || null,
      planName: plan.name,
    };
  } catch (error) {
    console.error("getAgentEffectiveSplit error:", error);
    return { agentSplitPct: 70, houseSplitPct: 30, tierLabel: null, planName: null };
  }
}
