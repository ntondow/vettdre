"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { logGoalAction } from "@/lib/bms-audit";
import {
  BADGE_DEFINITIONS,
  LIFETIME_BADGE_THRESHOLDS,
  STREAK_BADGE_THRESHOLDS,
} from "@/lib/agent-badges";
import type { AgentLifetimeStats } from "@/lib/agent-badges";
import type {
  LeaderboardEntry,
  AgentGoalInput,
  AgentGoalRecord,
  AgentDashboardData,
} from "@/lib/bms-types";

// ── Auth Helper ───────────────────────────────────────────────

async function getCurrentOrg() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    include: { brokerAgent: { select: { id: true, firstName: true, lastName: true, brokerageRole: true } } },
  });
  if (!user) throw new Error("User not found");
  return {
    userId: user.id,
    orgId: user.orgId,
    userName: user.fullName,
    agentId: user.brokerAgent?.id,
    role: user.brokerAgent?.brokerageRole || (user.role === "owner" || user.role === "admin" || user.role === "super_admin" ? "brokerage_admin" : null),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(data: any): any {
  return JSON.parse(JSON.stringify(data));
}

function actor(ctx: { userId: string; userName: string }) {
  return { id: ctx.userId, name: ctx.userName };
}

// ── Goal Management ──────────────────────────────────────────

export async function setAgentGoals(
  agentId: string,
  year: number,
  month: number,
  targets: AgentGoalInput,
): Promise<AgentGoalRecord> {
  const ctx = await getCurrentOrg();

  // Permission check: only brokerage_admin and broker can set goals
  if (ctx.role !== "brokerage_admin" && ctx.role !== "broker") {
    throw new Error("Only admins and brokers can set agent goals");
  }

  // Verify the agent belongs to this org
  const agent = await prisma.brokerAgent.findFirst({
    where: { id: agentId, orgId: ctx.orgId },
  });
  if (!agent) throw new Error("Agent not found");

  const goal = await prisma.agentGoal.upsert({
    where: {
      orgId_agentId_year_month: {
        orgId: ctx.orgId,
        agentId,
        year,
        month,
      },
    },
    create: {
      orgId: ctx.orgId,
      agentId,
      year,
      month,
      dealsClosedTarget: targets.dealsClosedTarget ?? null,
      revenueTarget: targets.revenueTarget ?? null,
      listingsLeasedTarget: targets.listingsLeasedTarget ?? null,
      listingsAddedTarget: targets.listingsAddedTarget ?? null,
    },
    update: {
      dealsClosedTarget: targets.dealsClosedTarget ?? null,
      revenueTarget: targets.revenueTarget ?? null,
      listingsLeasedTarget: targets.listingsLeasedTarget ?? null,
      listingsAddedTarget: targets.listingsAddedTarget ?? null,
    },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  logGoalAction(ctx.orgId, actor(ctx), "goals_set", goal.id, {
    agentId,
    year,
    month,
    targets,
  });

  return serialize(goal) as AgentGoalRecord;
}

export async function setBulkGoals(
  year: number,
  month: number,
  targets: AgentGoalInput,
): Promise<AgentGoalRecord[]> {
  const ctx = await getCurrentOrg();

  if (ctx.role !== "brokerage_admin" && ctx.role !== "broker") {
    throw new Error("Only admins and brokers can set goals");
  }

  // Get all active agents
  const agents = await prisma.brokerAgent.findMany({
    where: { orgId: ctx.orgId, status: "active" },
    select: { id: true },
  });

  const results: AgentGoalRecord[] = [];

  for (const agent of agents) {
    const goal = await prisma.agentGoal.upsert({
      where: {
        orgId_agentId_year_month: {
          orgId: ctx.orgId,
          agentId: agent.id,
          year,
          month,
        },
      },
      create: {
        orgId: ctx.orgId,
        agentId: agent.id,
        year,
        month,
        dealsClosedTarget: targets.dealsClosedTarget ?? null,
        revenueTarget: targets.revenueTarget ?? null,
        listingsLeasedTarget: targets.listingsLeasedTarget ?? null,
        listingsAddedTarget: targets.listingsAddedTarget ?? null,
      },
      update: {
        dealsClosedTarget: targets.dealsClosedTarget ?? null,
        revenueTarget: targets.revenueTarget ?? null,
        listingsLeasedTarget: targets.listingsLeasedTarget ?? null,
        listingsAddedTarget: targets.listingsAddedTarget ?? null,
      },
      include: {
        agent: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    results.push(serialize(goal) as AgentGoalRecord);
  }

  logGoalAction(ctx.orgId, actor(ctx), "bulk_goals_set", "", {
    year,
    month,
    agentCount: agents.length,
    targets,
  });

  return results;
}

export async function getAgentGoals(
  agentId: string,
  year: number,
  month: number,
): Promise<AgentGoalRecord | null> {
  const ctx = await getCurrentOrg();

  const goal = await prisma.agentGoal.findUnique({
    where: {
      orgId_agentId_year_month: {
        orgId: ctx.orgId,
        agentId,
        year,
        month,
      },
    },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  return goal ? (serialize(goal) as AgentGoalRecord) : null;
}

export async function getGoalsByMonth(
  year: number,
  month: number,
): Promise<AgentGoalRecord[]> {
  const ctx = await getCurrentOrg();

  const goals = await prisma.agentGoal.findMany({
    where: { orgId: ctx.orgId, year, month },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { agent: { firstName: "asc" } },
  });

  return serialize(goals) as AgentGoalRecord[];
}

// ── Actuals Calculation ──────────────────────────────────────

export async function calculateAgentActuals(
  agentId: string,
  year: number,
  month: number,
): Promise<{
  dealsClosed: number;
  revenue: number;
  listingsLeased: number;
  listingsAdded: number;
}> {
  const ctx = await getCurrentOrg();

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  // 1. Transactions closed this month where this agent is the primary agent
  const transactions = await prisma.transaction.findMany({
    where: {
      orgId: ctx.orgId,
      agentId,
      stage: "closed",
      closedAt: { gte: startDate, lt: endDate },
    },
    select: {
      id: true,
      commissionAmount: true,
      dealSubmissionId: true,
    },
  });

  // 1b. Also count TransactionAgent records where this agent is a co-agent/referral
  //     on transactions closed this month (but NOT the primary agent on Transaction)
  const primaryTxIds = new Set(transactions.map((t) => t.id));
  const coAgentSplits = await prisma.transactionAgent.findMany({
    where: {
      agentId,
      role: { not: "primary" },
      transaction: {
        orgId: ctx.orgId,
        stage: "closed",
        closedAt: { gte: startDate, lt: endDate },
      },
    },
    select: {
      transactionId: true,
      payoutAmount: true,
      splitPct: true,
      transaction: { select: { commissionAmount: true } },
    },
  });
  // Exclude any that overlap with primary agent transactions
  const uniqueCoSplits = coAgentSplits.filter((s) => !primaryTxIds.has(s.transactionId));

  // 2. DealSubmissions approved/invoiced/paid this month (without a linked Transaction)
  const transactionSubmissionIds = new Set(
    transactions.filter((t) => t.dealSubmissionId).map((t) => t.dealSubmissionId),
  );

  const dealSubmissions = await prisma.dealSubmission.findMany({
    where: {
      orgId: ctx.orgId,
      agentId,
      status: { in: ["approved", "invoiced", "paid"] },
      updatedAt: { gte: startDate, lt: endDate },
    },
    select: {
      id: true,
      totalCommission: true,
    },
  });

  // Deduplicate: exclude submissions already counted via Transaction
  const uniqueSubmissions = dealSubmissions.filter(
    (s) => !transactionSubmissionIds.has(s.id),
  );

  const dealsClosed = transactions.length + uniqueCoSplits.length + uniqueSubmissions.length;

  // Revenue: prefer Transaction.commissionAmount, fallback to DealSubmission.totalCommission
  // For co-agent splits, use their payoutAmount or calculate from splitPct
  let revenue = 0;
  for (const t of transactions) {
    revenue += Number(t.commissionAmount || 0);
  }
  for (const s of uniqueCoSplits) {
    if (s.payoutAmount) {
      revenue += Number(s.payoutAmount);
    } else if (s.splitPct && s.transaction.commissionAmount) {
      revenue += Number(s.transaction.commissionAmount) * Number(s.splitPct) / 100;
    }
  }
  for (const s of uniqueSubmissions) {
    revenue += Number(s.totalCommission || 0);
  }

  // 3. Listings leased this month
  const listingsLeased = await prisma.bmsListing.count({
    where: {
      orgId: ctx.orgId,
      agentId,
      status: "leased",
      leasedAt: { gte: startDate, lt: endDate },
    },
  });

  // 4. Listings added this month
  const listingsAdded = await prisma.bmsListing.count({
    where: {
      orgId: ctx.orgId,
      agentId,
      createdAt: { gte: startDate, lt: endDate },
    },
  });

  // Update the AgentGoal record if it exists
  const existingGoal = await prisma.agentGoal.findUnique({
    where: {
      orgId_agentId_year_month: {
        orgId: ctx.orgId,
        agentId,
        year,
        month,
      },
    },
  });

  if (existingGoal) {
    await prisma.agentGoal.update({
      where: { id: existingGoal.id },
      data: {
        dealsClosedActual: dealsClosed,
        revenueActual: revenue,
        listingsLeasedActual: listingsLeased,
        listingsAddedActual: listingsAdded,
        lastCalculatedAt: new Date(),
      },
    });
  }

  return { dealsClosed, revenue, listingsLeased, listingsAdded };
}

// ── Scoring ──────────────────────────────────────────────────

function calculateOverallScore(goal: {
  dealsClosedActual: number;
  dealsClosedTarget: number | null;
  revenueActual: number | string;
  revenueTarget: number | string | null;
  listingsLeasedActual: number;
  listingsLeasedTarget: number | null;
  listingsAddedActual: number;
  listingsAddedTarget: number | null;
}): number {
  const metrics: { actual: number; target: number; weight: number }[] = [];

  if (goal.dealsClosedTarget && goal.dealsClosedTarget > 0) {
    metrics.push({ actual: goal.dealsClosedActual, target: goal.dealsClosedTarget, weight: 3 });
  }
  if (goal.revenueTarget && Number(goal.revenueTarget) > 0) {
    metrics.push({ actual: Number(goal.revenueActual), target: Number(goal.revenueTarget), weight: 2 });
  }
  if (goal.listingsLeasedTarget && goal.listingsLeasedTarget > 0) {
    metrics.push({ actual: goal.listingsLeasedActual, target: goal.listingsLeasedTarget, weight: 2 });
  }
  if (goal.listingsAddedTarget && goal.listingsAddedTarget > 0) {
    metrics.push({ actual: goal.listingsAddedActual, target: goal.listingsAddedTarget, weight: 1 });
  }

  if (metrics.length === 0) return 0;

  const totalWeight = metrics.reduce((sum, m) => sum + m.weight, 0);
  const weightedScore = metrics.reduce((sum, m) => {
    const pct = Math.min(m.actual / m.target, 1.5); // cap at 150%
    return sum + pct * m.weight;
  }, 0);

  return Math.round((weightedScore / totalWeight) * 100);
}

// ── Streak Calculation ──────────────────────────────────────

export async function calculateStreak(agentId: string): Promise<number> {
  const ctx = await getCurrentOrg();

  const now = new Date();
  let currentYear = now.getFullYear();
  let currentMonth = now.getMonth() + 1; // 1-indexed

  // Start checking from the previous month (current month is in progress)
  currentMonth--;
  if (currentMonth === 0) {
    currentMonth = 12;
    currentYear--;
  }

  let streak = 0;

  // Look back up to 24 months
  for (let i = 0; i < 24; i++) {
    const goal = await prisma.agentGoal.findUnique({
      where: {
        orgId_agentId_year_month: {
          orgId: ctx.orgId,
          agentId,
          year: currentYear,
          month: currentMonth,
        },
      },
    });

    // No goal set for this month — streak broken (no targets to hit)
    if (!goal) break;

    // Check if all set targets were met
    const hitTargets = checkGoalHit(goal);
    if (!hitTargets) break;

    streak++;

    // Move to previous month
    currentMonth--;
    if (currentMonth === 0) {
      currentMonth = 12;
      currentYear--;
    }
  }

  return streak;
}

function checkGoalHit(goal: {
  dealsClosedTarget: number | null;
  dealsClosedActual: number;
  revenueTarget: unknown;
  revenueActual: unknown;
  listingsLeasedTarget: number | null;
  listingsLeasedActual: number;
  listingsAddedTarget: number | null;
  listingsAddedActual: number;
}): boolean {
  let hasAnyTarget = false;

  if (goal.dealsClosedTarget !== null && goal.dealsClosedTarget > 0) {
    hasAnyTarget = true;
    if (goal.dealsClosedActual < goal.dealsClosedTarget) return false;
  }
  if (goal.revenueTarget !== null && Number(goal.revenueTarget) > 0) {
    hasAnyTarget = true;
    if (Number(goal.revenueActual) < Number(goal.revenueTarget)) return false;
  }
  if (goal.listingsLeasedTarget !== null && goal.listingsLeasedTarget > 0) {
    hasAnyTarget = true;
    if (goal.listingsLeasedActual < goal.listingsLeasedTarget) return false;
  }
  if (goal.listingsAddedTarget !== null && goal.listingsAddedTarget > 0) {
    hasAnyTarget = true;
    if (goal.listingsAddedActual < goal.listingsAddedTarget) return false;
  }

  // If no targets were set, the month doesn't count as a hit
  return hasAnyTarget;
}

// ── Badge Engine ─────────────────────────────────────────────

export async function checkAndAwardBadges(agentId: string): Promise<Array<{ type: string; name: string; icon: string }>> {
  const ctx = await getCurrentOrg();
  const newBadges: Array<{ type: string; name: string; icon: string }> = [];

  // Get existing badges for this agent
  const existingBadges = await prisma.agentBadge.findMany({
    where: { orgId: ctx.orgId, agentId },
    select: { type: true },
  });
  const earnedTypes = new Set(existingBadges.map((b) => b.type));

  // Calculate lifetime stats
  const lifetimeStats = await getLifetimeStats(ctx.orgId, agentId);

  // Check lifetime badges
  for (const badge of LIFETIME_BADGE_THRESHOLDS) {
    if (earnedTypes.has(badge.type)) continue;
    if (lifetimeStats[badge.field] >= badge.threshold) {
      const def = BADGE_DEFINITIONS[badge.type];
      await prisma.agentBadge.create({
        data: {
          orgId: ctx.orgId,
          agentId,
          type: badge.type,
          name: def.name,
          description: def.description,
        },
      });
      newBadges.push({ type: badge.type, name: def.name, icon: def.icon });
    }
  }

  // Check streak badges
  const streak = await calculateStreak(agentId);
  for (const badge of STREAK_BADGE_THRESHOLDS) {
    if (earnedTypes.has(badge.type)) continue;
    if (streak >= badge.threshold) {
      const def = BADGE_DEFINITIONS[badge.type];
      const now = new Date();
      await prisma.agentBadge.create({
        data: {
          orgId: ctx.orgId,
          agentId,
          type: badge.type,
          name: def.name,
          description: def.description,
          period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
        },
      });
      newBadges.push({ type: badge.type, name: def.name, icon: def.icon });
    }
  }

  return newBadges;
}

async function getLifetimeStats(
  orgId: string,
  agentId: string,
): Promise<AgentLifetimeStats> {
  // Count all closed transactions
  const [transactionCount, transactionRevenue, submissionCount, submissionRevenue, listingsLeased, monthsActive] =
    await Promise.all([
      prisma.transaction.count({
        where: { orgId, agentId, stage: "closed" },
      }),
      prisma.transaction.aggregate({
        where: { orgId, agentId, stage: "closed" },
        _sum: { commissionAmount: true },
      }),
      // DealSubmissions without linked transactions
      prisma.dealSubmission.count({
        where: {
          orgId,
          agentId,
          status: { in: ["approved", "invoiced", "paid"] },
          transaction: null,
        },
      }),
      prisma.dealSubmission.aggregate({
        where: {
          orgId,
          agentId,
          status: { in: ["approved", "invoiced", "paid"] },
          transaction: null,
        },
        _sum: { totalCommission: true },
      }),
      prisma.bmsListing.count({
        where: { orgId, agentId, status: "leased" },
      }),
      // Months active = distinct months with goals
      prisma.agentGoal.findMany({
        where: { orgId, agentId },
        select: { year: true, month: true },
        distinct: ["year", "month"],
      }),
    ]);

  const totalDeals = transactionCount + submissionCount;
  const totalRevenue =
    Number(transactionRevenue._sum.commissionAmount || 0) +
    Number(submissionRevenue._sum.totalCommission || 0);

  return {
    totalDeals,
    totalRevenue,
    totalListingsLeased: listingsLeased,
    monthsActive: monthsActive.length,
  };
}

// ── Leaderboard Refresh ──────────────────────────────────────

export async function refreshLeaderboard(
  year: number,
  month: number,
): Promise<void> {
  const ctx = await getCurrentOrg();

  // Get all goals for this month
  const goals = await prisma.agentGoal.findMany({
    where: { orgId: ctx.orgId, year, month },
    select: { agentId: true },
  });

  // Also include active agents without goals (to calculate for them too)
  const activeAgents = await prisma.brokerAgent.findMany({
    where: { orgId: ctx.orgId, status: "active" },
    select: { id: true },
  });

  const agentIds = new Set([
    ...goals.map((g) => g.agentId),
    ...activeAgents.map((a) => a.id),
  ]);

  // Calculate actuals for each agent
  for (const agentId of agentIds) {
    await calculateAgentActuals(agentId, year, month);
  }

  // Check badges for all agents
  for (const agentId of agentIds) {
    await checkAndAwardBadges(agentId);
  }
}

// ── Get Leaderboard ──────────────────────────────────────────

export async function getLeaderboard(
  period: { year: number; month: number } | "current_month" | "current_quarter" | "current_year",
): Promise<LeaderboardEntry[]> {
  const ctx = await getCurrentOrg();

  const now = new Date();
  let months: Array<{ year: number; month: number }>;

  if (period === "current_month") {
    months = [{ year: now.getFullYear(), month: now.getMonth() + 1 }];
  } else if (period === "current_quarter") {
    const q = Math.floor(now.getMonth() / 3);
    months = [];
    for (let m = q * 3; m < q * 3 + 3; m++) {
      months.push({ year: now.getFullYear(), month: m + 1 });
    }
  } else if (period === "current_year") {
    months = [];
    for (let m = 1; m <= now.getMonth() + 1; m++) {
      months.push({ year: now.getFullYear(), month: m });
    }
  } else {
    months = [period];
  }

  // For single month, refresh actuals
  if (months.length === 1) {
    await refreshLeaderboard(months[0].year, months[0].month);
  }

  // Get all goals for the period
  const goals = await prisma.agentGoal.findMany({
    where: {
      orgId: ctx.orgId,
      OR: months.map((m) => ({ year: m.year, month: m.month })),
    },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  // Aggregate by agent
  const agentMap = new Map<
    string,
    {
      agentName: string;
      dealsClosed: number;
      dealsClosedTarget: number | null;
      revenue: number;
      revenueTarget: number | null;
      listingsLeased: number;
      listingsLeasedTarget: number | null;
      listingsAdded: number;
      listingsAddedTarget: number | null;
    }
  >();

  for (const goal of goals) {
    const existing = agentMap.get(goal.agentId);
    const agentName = goal.agent
      ? `${goal.agent.firstName} ${goal.agent.lastName}`
      : "Unknown";

    if (existing) {
      existing.dealsClosed += goal.dealsClosedActual;
      existing.revenue += Number(goal.revenueActual);
      existing.listingsLeased += goal.listingsLeasedActual;
      existing.listingsAdded += goal.listingsAddedActual;
      if (goal.dealsClosedTarget !== null) {
        existing.dealsClosedTarget = (existing.dealsClosedTarget || 0) + goal.dealsClosedTarget;
      }
      if (goal.revenueTarget !== null) {
        existing.revenueTarget = (existing.revenueTarget || 0) + Number(goal.revenueTarget);
      }
      if (goal.listingsLeasedTarget !== null) {
        existing.listingsLeasedTarget = (existing.listingsLeasedTarget || 0) + goal.listingsLeasedTarget;
      }
      if (goal.listingsAddedTarget !== null) {
        existing.listingsAddedTarget = (existing.listingsAddedTarget || 0) + goal.listingsAddedTarget;
      }
    } else {
      agentMap.set(goal.agentId, {
        agentName,
        dealsClosed: goal.dealsClosedActual,
        dealsClosedTarget: goal.dealsClosedTarget,
        revenue: Number(goal.revenueActual),
        revenueTarget: goal.revenueTarget !== null ? Number(goal.revenueTarget) : null,
        listingsLeased: goal.listingsLeasedActual,
        listingsLeasedTarget: goal.listingsLeasedTarget,
        listingsAdded: goal.listingsAddedActual,
        listingsAddedTarget: goal.listingsAddedTarget,
      });
    }
  }

  // Calculate scores and build entries
  const entries: LeaderboardEntry[] = [];

  for (const [agentId, data] of agentMap.entries()) {
    const score = calculateOverallScore({
      dealsClosedActual: data.dealsClosed,
      dealsClosedTarget: data.dealsClosedTarget,
      revenueActual: data.revenue,
      revenueTarget: data.revenueTarget,
      listingsLeasedActual: data.listingsLeased,
      listingsLeasedTarget: data.listingsLeasedTarget,
      listingsAddedActual: data.listingsAdded,
      listingsAddedTarget: data.listingsAddedTarget,
    });

    // Get streak
    const streak = await calculateStreak(agentId);

    // Get badges
    const badges = await prisma.agentBadge.findMany({
      where: { orgId: ctx.orgId, agentId },
      select: { type: true, name: true },
    });

    const badgeList = badges.map((b) => ({
      type: b.type,
      name: b.name,
      icon: BADGE_DEFINITIONS[b.type]?.icon || "",
    }));

    const pct = (actual: number, target: number | null) =>
      target && target > 0 ? Math.round((actual / target) * 100) : 0;

    entries.push({
      agentId,
      agentName: data.agentName,
      rank: 0, // will be set after sorting
      trend: "new" as const,
      dealsClosed: {
        actual: data.dealsClosed,
        target: data.dealsClosedTarget,
        pct: pct(data.dealsClosed, data.dealsClosedTarget),
      },
      revenue: {
        actual: data.revenue,
        target: data.revenueTarget,
        pct: pct(data.revenue, data.revenueTarget),
      },
      listingsLeased: {
        actual: data.listingsLeased,
        target: data.listingsLeasedTarget,
        pct: pct(data.listingsLeased, data.listingsLeasedTarget),
      },
      listingsAdded: {
        actual: data.listingsAdded,
        target: data.listingsAddedTarget,
        pct: pct(data.listingsAdded, data.listingsAddedTarget),
      },
      overallScore: score,
      streak,
      badges: badgeList,
    });
  }

  // Sort by overallScore DESC
  entries.sort((a, b) => b.overallScore - a.overallScore);

  // Assign ranks
  entries.forEach((e, i) => {
    e.rank = i + 1;
  });

  // Calculate trends (compare to previous period)
  if (months.length === 1) {
    const prevMonth = months[0].month === 1 ? 12 : months[0].month - 1;
    const prevYear = months[0].month === 1 ? months[0].year - 1 : months[0].year;

    const prevGoals = await prisma.agentGoal.findMany({
      where: { orgId: ctx.orgId, year: prevYear, month: prevMonth },
    });

    if (prevGoals.length > 0) {
      // Calculate previous scores and ranks
      const prevScores = prevGoals.map((g) => ({
        agentId: g.agentId,
        score: calculateOverallScore({
          dealsClosedActual: g.dealsClosedActual,
          dealsClosedTarget: g.dealsClosedTarget,
          revenueActual: Number(g.revenueActual),
          revenueTarget: g.revenueTarget !== null ? Number(g.revenueTarget) : null,
          listingsLeasedActual: g.listingsLeasedActual,
          listingsLeasedTarget: g.listingsLeasedTarget,
          listingsAddedActual: g.listingsAddedActual,
          listingsAddedTarget: g.listingsAddedTarget,
        }),
      }));
      prevScores.sort((a, b) => b.score - a.score);

      const prevRankMap = new Map<string, number>();
      prevScores.forEach((s, i) => prevRankMap.set(s.agentId, i + 1));

      for (const entry of entries) {
        const prevRank = prevRankMap.get(entry.agentId);
        if (prevRank === undefined) {
          entry.trend = "new";
        } else {
          entry.previousRank = prevRank;
          if (entry.rank < prevRank) entry.trend = "up";
          else if (entry.rank > prevRank) entry.trend = "down";
          else entry.trend = "same";
        }
      }
    }
  }

  return entries;
}

// ── Agent Dashboard ──────────────────────────────────────────

export async function getAgentDashboard(
  agentId: string,
): Promise<AgentDashboardData> {
  const ctx = await getCurrentOrg();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Refresh current month actuals
  await calculateAgentActuals(agentId, currentYear, currentMonth);

  // Get current goals
  const currentGoals = await prisma.agentGoal.findUnique({
    where: {
      orgId_agentId_year_month: {
        orgId: ctx.orgId,
        agentId,
        year: currentYear,
        month: currentMonth,
      },
    },
    include: {
      agent: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  // Get current leaderboard to find rank
  const leaderboard = await getLeaderboard("current_month");
  const agentEntry = leaderboard.find((e) => e.agentId === agentId);
  const currentRank = agentEntry?.rank || 0;
  const totalAgents = leaderboard.length;

  // Get streak
  const streak = await calculateStreak(agentId);

  // Get badges
  const badges = await prisma.agentBadge.findMany({
    where: { orgId: ctx.orgId, agentId },
    orderBy: { earnedAt: "desc" },
  });

  const badgeList = badges.map((b) => ({
    id: b.id,
    type: b.type,
    name: b.name,
    icon: BADGE_DEFINITIONS[b.type]?.icon || "",
    earnedAt: b.earnedAt.toISOString(),
  }));

  // Monthly history (last 12 months)
  const monthlyHistory: AgentDashboardData["monthlyHistory"] = [];
  let histYear = currentYear;
  let histMonth = currentMonth;

  for (let i = 0; i < 12; i++) {
    const goal = await prisma.agentGoal.findUnique({
      where: {
        orgId_agentId_year_month: {
          orgId: ctx.orgId,
          agentId,
          year: histYear,
          month: histMonth,
        },
      },
    });

    if (goal) {
      monthlyHistory.push({
        year: histYear,
        month: histMonth,
        dealsClosed: goal.dealsClosedActual,
        revenue: Number(goal.revenueActual),
        hitTargets: checkGoalHit(goal),
      });
    }

    histMonth--;
    if (histMonth === 0) {
      histMonth = 12;
      histYear--;
    }
  }

  // Lifetime stats
  const lifetimeStats = await getLifetimeStats(ctx.orgId, agentId);

  return serialize({
    currentGoals,
    currentRank,
    totalAgents,
    streak,
    badges: badgeList,
    monthlyHistory,
    lifetimeStats,
  }) as AgentDashboardData;
}

// ── Monthly Badge Awards ─────────────────────────────────────

export async function awardMonthlyBadges(
  year: number,
  month: number,
): Promise<void> {
  const ctx = await getCurrentOrg();

  const goals = await prisma.agentGoal.findMany({
    where: { orgId: ctx.orgId, year, month },
  });

  if (goals.length === 0) return;

  const period = `${year}-${String(month).padStart(2, "0")}`;

  // Monthly MVP: highest overall score
  let topAgent: { agentId: string; score: number } | null = null;
  for (const goal of goals) {
    const score = calculateOverallScore({
      dealsClosedActual: goal.dealsClosedActual,
      dealsClosedTarget: goal.dealsClosedTarget,
      revenueActual: Number(goal.revenueActual),
      revenueTarget: goal.revenueTarget !== null ? Number(goal.revenueTarget) : null,
      listingsLeasedActual: goal.listingsLeasedActual,
      listingsLeasedTarget: goal.listingsLeasedTarget,
      listingsAddedActual: goal.listingsAddedActual,
      listingsAddedTarget: goal.listingsAddedTarget,
    });
    if (!topAgent || score > topAgent.score) {
      topAgent = { agentId: goal.agentId, score };
    }
  }

  if (topAgent && topAgent.score > 0) {
    // Check if already awarded
    const existing = await prisma.agentBadge.findFirst({
      where: {
        orgId: ctx.orgId,
        agentId: topAgent.agentId,
        type: "monthly_mvp",
        period,
      },
    });
    if (!existing) {
      const def = BADGE_DEFINITIONS.monthly_mvp;
      await prisma.agentBadge.create({
        data: {
          orgId: ctx.orgId,
          agentId: topAgent.agentId,
          type: "monthly_mvp",
          name: def.name,
          description: def.description,
          period,
        },
      });
    }
  }

  // Top Revenue: highest revenue actual
  let topRevenue: { agentId: string; revenue: number } | null = null;
  for (const goal of goals) {
    const rev = Number(goal.revenueActual);
    if (!topRevenue || rev > topRevenue.revenue) {
      topRevenue = { agentId: goal.agentId, revenue: rev };
    }
  }

  if (topRevenue && topRevenue.revenue > 0) {
    const existing = await prisma.agentBadge.findFirst({
      where: {
        orgId: ctx.orgId,
        agentId: topRevenue.agentId,
        type: "top_revenue",
        period,
      },
    });
    if (!existing) {
      const def = BADGE_DEFINITIONS.top_revenue;
      await prisma.agentBadge.create({
        data: {
          orgId: ctx.orgId,
          agentId: topRevenue.agentId,
          type: "top_revenue",
          name: def.name,
          description: def.description,
          period,
        },
      });
    }
  }
}
