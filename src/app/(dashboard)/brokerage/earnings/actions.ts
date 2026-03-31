"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// ── Auth ──────────────────────────────────────────────────────

async function getCurrentAgent() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    include: {
      brokerAgent: { select: { id: true, firstName: true, lastName: true, defaultSplitPct: true } },
    },
  });
  if (!user) throw new Error("User not found");
  if (!user.brokerAgent) throw new Error("Not an agent");

  return {
    userId: user.id,
    orgId: user.orgId,
    agentId: user.brokerAgent.id,
    agentName: `${user.brokerAgent.firstName} ${user.brokerAgent.lastName}`,
    defaultSplit: Number(user.brokerAgent.defaultSplitPct) || 70,
  };
}

// ── Types ─────────────────────────────────────────────────────

export type EarningsPeriod = "week" | "month" | "quarter" | "year" | "all";

export interface EarningsSummary {
  agentName: string;
  defaultSplit: number;

  // Big numbers
  totalEarned: number;       // all-time paid
  pendingPayout: number;     // approved/invoiced but not yet paid
  thisMonthEarned: number;   // paid this calendar month
  thisWeekEarned: number;    // paid this week (Mon-Sun)

  // Period-specific
  periodEarned: number;
  periodDeals: number;
  periodVolume: number;
  periodAvgDeal: number;
  periodAvgCommission: number;

  // Breakdown by status
  paidCount: number;
  pendingCount: number;
  submittedCount: number;

  // Earnings over time (for chart)
  earningsByPeriod: Array<{
    label: string;
    earned: number;
    deals: number;
  }>;

  // Recent deals
  recentDeals: Array<{
    id: string;
    address: string;
    unit?: string;
    dealType: string;
    status: string;
    totalCommission: number;
    agentPayout: number;
    closedAt?: string;
    createdAt: string;
    clientName?: string;
  }>;
}

// ── Helpers ───────────────────────────────────────────────────

function getStartOfWeek(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(now.getFullYear(), now.getMonth(), diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getPeriodStart(period: EarningsPeriod): Date | null {
  const now = new Date();
  switch (period) {
    case "week":
      return getStartOfWeek();
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3) * 3;
      return new Date(now.getFullYear(), q, 1);
    }
    case "year":
      return new Date(now.getFullYear(), 0, 1);
    case "all":
      return null;
  }
}

function getChartLabels(period: EarningsPeriod): { labels: string[]; starts: Date[] } {
  const now = new Date();
  const labels: string[] = [];
  const starts: Date[] = [];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  if (period === "week") {
    // Last 8 weeks
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const monday = new Date(d);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      starts.push(monday);
      labels.push(`${months[monday.getMonth()]} ${monday.getDate()}`);
    }
  } else if (period === "month") {
    // Last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      starts.push(d);
      labels.push(months[d.getMonth()]);
    }
  } else if (period === "quarter") {
    // Last 4 quarters
    for (let i = 3; i >= 0; i--) {
      const q = Math.floor(now.getMonth() / 3) - i;
      const year = now.getFullYear() + Math.floor(q / 4);
      const qIdx = ((q % 4) + 4) % 4;
      const d = new Date(year, qIdx * 3, 1);
      starts.push(d);
      labels.push(`Q${qIdx + 1} ${year.toString().slice(2)}`);
    }
  } else {
    // Last 12 months
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      starts.push(d);
      labels.push(`${months[d.getMonth()]} '${d.getFullYear().toString().slice(2)}`);
    }
  }

  return { labels, starts };
}

// ── Main Query ────────────────────────────────────────────────

export async function getEarningsSummary(period: EarningsPeriod = "month"): Promise<EarningsSummary> {
  const ctx = await getCurrentAgent();
  const { orgId, agentId } = ctx;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek = getStartOfWeek();
  const periodStart = getPeriodStart(period);

  const periodFilter = periodStart ? { createdAt: { gte: periodStart } } : {};

  const [
    // All-time paid
    totalPaidAgg,
    // Pending (approved/invoiced, not paid)
    pendingAgg,
    // This month paid
    monthPaidAgg,
    // This week paid
    weekPaidAgg,
    // Period deals + volume
    periodDealsAgg,
    // Period paid
    periodPaidAgg,
    // Status counts
    statusCounts,
    // Recent deals
    recentDeals,
    // All deals for chart (paid only)
    chartDeals,
  ] = await Promise.all([
    // Total paid earnings (all time)
    prisma.dealSubmission.aggregate({
      where: { orgId, agentId, status: "paid" },
      _sum: { agentPayout: true },
    }),
    // Pending payout
    prisma.dealSubmission.aggregate({
      where: { orgId, agentId, status: { in: ["approved", "invoiced"] } },
      _sum: { agentPayout: true },
    }),
    // This month paid
    prisma.dealSubmission.aggregate({
      where: { orgId, agentId, status: "paid", updatedAt: { gte: startOfMonth } },
      _sum: { agentPayout: true },
    }),
    // This week paid
    prisma.dealSubmission.aggregate({
      where: { orgId, agentId, status: "paid", updatedAt: { gte: startOfWeek } },
      _sum: { agentPayout: true },
    }),
    // Period deals (all statuses - for counting pipeline volume/deals)
    prisma.dealSubmission.aggregate({
      where: { orgId, agentId, ...periodFilter },
      _count: { id: true },
      _sum: { transactionValue: true, totalCommission: true },
    }),
    // Period paid (only paid deals for earnings calculation)
    prisma.dealSubmission.aggregate({
      where: { orgId, agentId, status: "paid", ...periodFilter },
      _sum: { agentPayout: true },
    }),
    // Status counts
    prisma.dealSubmission.groupBy({
      by: ["status"],
      where: { orgId, agentId },
      _count: { id: true },
    }),
    // Recent deals (last 20)
    prisma.dealSubmission.findMany({
      where: { orgId, agentId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        propertyAddress: true,
        unit: true,
        dealType: true,
        status: true,
        totalCommission: true,
        agentPayout: true,
        closingDate: true,
        createdAt: true,
        clientName: true,
      },
    }),
    // Chart data — paid deals with dates
    prisma.dealSubmission.findMany({
      where: { orgId, agentId, status: "paid" },
      select: {
        agentPayout: true,
        updatedAt: true,
      },
    }),
  ]);

  // ── Process status counts ───────────────────────────────────
  const statusMap: Record<string, number> = {};
  for (const row of statusCounts) {
    statusMap[row.status] = row._count.id;
  }

  // ── Build chart data ────────────────────────────────────────
  const { labels, starts } = getChartLabels(period);
  const earningsByPeriod = labels.map((label, i) => {
    const rangeStart = starts[i];
    // Next range starts at starts[i+1], or end of current period
    const rangeEnd = i < starts.length - 1 ? starts[i + 1] : new Date(now.getTime() + 86400000);

    let earned = 0;
    let deals = 0;
    for (const deal of chartDeals) {
      const dt = new Date(deal.updatedAt);
      // Check if deal's updatedAt falls in this range (inclusive start, exclusive end)
      if (dt >= rangeStart && dt < rangeEnd) {
        earned += Number(deal.agentPayout) || 0;
        deals++;
      }
    }
    return { label, earned, deals };
  });

  // ── Period calculations ─────────────────────────────────────
  // Note: periodDeals counts ALL deals in period (any status), but periodEarned only counts PAID deals.
  // This is intentional: periodDeals shows pipeline activity, periodEarned shows actual payout.
  // For averages, we use periodDeals as the denominator to show per-deal metrics.
  const periodDeals = periodDealsAgg._count.id || 0;
  const periodVolume = Number(periodDealsAgg._sum.transactionValue || 0);
  const periodTotalCommission = Number(periodDealsAgg._sum.totalCommission || 0);
  const periodEarned = Number(periodPaidAgg._sum.agentPayout || 0);

  return JSON.parse(JSON.stringify({
    agentName: ctx.agentName,
    defaultSplit: ctx.defaultSplit,

    totalEarned: Number(totalPaidAgg._sum.agentPayout || 0),
    pendingPayout: Number(pendingAgg._sum.agentPayout || 0),
    thisMonthEarned: Number(monthPaidAgg._sum.agentPayout || 0),
    thisWeekEarned: Number(weekPaidAgg._sum.agentPayout || 0),

    periodEarned,
    periodDeals,
    periodVolume,
    periodAvgDeal: periodDeals > 0 ? periodVolume / periodDeals : 0,
    periodAvgCommission: periodDeals > 0 ? periodTotalCommission / periodDeals : 0,

    paidCount: statusMap["paid"] || 0,
    pendingCount: (statusMap["approved"] || 0) + (statusMap["invoiced"] || 0),
    submittedCount: statusMap["submitted"] || 0,

    earningsByPeriod,

    recentDeals: recentDeals.map((d) => ({
      id: d.id,
      address: d.propertyAddress,
      unit: d.unit,
      dealType: d.dealType,
      status: d.status,
      totalCommission: Number(d.totalCommission || 0),
      agentPayout: Number(d.agentPayout || 0),
      closedAt: d.closingDate ? new Date(d.closingDate).toISOString() : undefined,
      createdAt: new Date(d.createdAt).toISOString(),
      clientName: d.clientName,
    })),
  })) as EarningsSummary;
}
