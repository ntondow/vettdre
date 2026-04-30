"use server";

import prisma from "@/lib/prisma";
import { getCurrentOrgContext } from "@/lib/auth-context";

// ── Auth Helper ───────────────────────────────────────────────

async function getCurrentOrg(options: { overrideAsOrg?: string } = {}) {
  const ctx = await getCurrentOrgContext(options);
  return ctx?.orgId || null;
}

// ── Slice 4: Period-comparison KPIs ──────────────────────────
//
// Returns the four slice 4 KPIs (House Revenue, Agent Payouts, Pending
// Invoices, Closed This Month) for both the current period and the
// immediately preceding period of the same length. Lets each KPI card
// render a vs-prior delta without the client having to compute it from
// two separate fetches.
//
// Period semantics match the existing /reports getDashboardSummary
// helper: "month" = trailing 30 days, "quarter" = 90, "year" = 365.

export type KpiPeriod = "month" | "quarter" | "year";

interface KpiSnapshot {
  houseRevenue: number;
  agentPayouts: number;
  pendingInvoices: number;
  closedDeals: number;
}

function periodSpanDays(period: KpiPeriod): number {
  if (period === "month") return 30;
  if (period === "quarter") return 90;
  return 365;
}

function rangeForPeriod(period: KpiPeriod): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - periodSpanDays(period));
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function priorRangeForPeriod(period: KpiPeriod): { start: Date; end: Date } {
  const days = periodSpanDays(period);
  const end = new Date();
  end.setDate(end.getDate() - days);
  const start = new Date();
  start.setDate(start.getDate() - days * 2);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

async function fetchKpiSnapshot(
  orgId: string,
  start: Date,
  end: Date,
): Promise<KpiSnapshot> {
  const [houseAgg, agentAgg, pendingAgg, closedCount] = await Promise.all([
    // House revenue from invoices that landed paid in the window.
    prisma.invoice.aggregate({
      where: { orgId, status: "paid", paidDate: { gte: start, lt: end } },
      _sum: { housePayout: true },
    }),
    // Agent payouts that landed paid in the window.
    prisma.invoice.aggregate({
      where: { orgId, status: "paid", paidDate: { gte: start, lt: end } },
      _sum: { agentPayout: true },
    }),
    // Pending invoices = draft + sent invoices created within the
    // window. Matches the existing getDashboardSummary "pendingPayouts"
    // semantic so the delta math agrees with /reports.
    prisma.invoice.aggregate({
      where: {
        orgId,
        status: { in: ["draft", "sent"] },
        createdAt: { gte: start, lt: end },
      },
      _sum: { agentPayout: true },
    }),
    // Closed deals = transactions whose `closedAt` falls in the window.
    // Mirrors the existing transactions/actions.ts convention (uses
    // stage="closed" + closedAt) so the KPI agrees with /transactions
    // stats numbers.
    prisma.transaction.count({
      where: {
        orgId,
        stage: "closed",
        closedAt: { gte: start, lt: end },
      },
    }),
  ]);

  return {
    houseRevenue: Number(houseAgg._sum.housePayout || 0),
    agentPayouts: Number(agentAgg._sum.agentPayout || 0),
    pendingInvoices: Number(pendingAgg._sum.agentPayout || 0),
    closedDeals: closedCount,
  };
}

export async function getKpiComparison(
  period: KpiPeriod = "month",
  options: { overrideAsOrg?: string } = {},
): Promise<{
  current: KpiSnapshot;
  previous: KpiSnapshot;
  periodStart: string;
  periodEnd: string;
} | null> {
  try {
    const orgId = await getCurrentOrg(options);
    if (!orgId) return null;
    const cur = rangeForPeriod(period);
    const prev = priorRangeForPeriod(period);
    const [current, previous] = await Promise.all([
      fetchKpiSnapshot(orgId, cur.start, cur.end),
      fetchKpiSnapshot(orgId, prev.start, prev.end),
    ]);
    return {
      current,
      previous,
      periodStart: cur.start.toISOString(),
      periodEnd: cur.end.toISOString(),
    };
  } catch (error) {
    console.error("getKpiComparison error:", error);
    return null;
  }
}

// ── Slice 4: Today's tasks (TransactionTask) ────────────────
//
// Per slice 4 spec: surface TransactionTask rows due today (or earlier
// — anything past-due is also "today's work"), not yet completed,
// scoped to the org. Capped at 5 rows for the dashboard panel; the
// "View all" link routes to /brokerage/transactions where the
// transaction-detail panels show their full task lists.

export async function getTodaysTasksForManager(
  options: { overrideAsOrg?: string } = {},
): Promise<{
  tasks: Array<{
    id: string;
    title: string;
    dueDate: string | null;
    transactionId: string;
    propertyAddress: string;
    stage: string;
    isPastDue: boolean;
  }>;
} | null> {
  try {
    const orgId = await getCurrentOrg(options);
    if (!orgId) return null;

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const rows = await prisma.transactionTask.findMany({
      where: {
        isCompleted: false,
        dueDate: { lte: endOfToday },
        transaction: { orgId },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
      select: {
        id: true,
        title: true,
        dueDate: true,
        stage: true,
        transactionId: true,
        transaction: { select: { propertyAddress: true } },
      },
    });

    const now = Date.now();
    return {
      tasks: rows.map((r) => ({
        id: r.id,
        title: r.title,
        dueDate: r.dueDate?.toISOString() ?? null,
        transactionId: r.transactionId,
        propertyAddress: r.transaction.propertyAddress,
        stage: String(r.stage),
        isPastDue: !!r.dueDate && r.dueDate.getTime() < now,
      })),
    };
  } catch (error) {
    console.error("getTodaysTasksForManager error:", error);
    return null;
  }
}

// ── Slice 4: Dashboard header (greeting context) ────────────
//
// Returns the *real* logged-in user's name regardless of `?as_org=`
// override target. Per slice 4 addition (B): the greeting stays
// personal to the actual user; the override banner already conveys
// data-scope ("Viewing as Gulino Group"). Adding userName here lets
// the dashboard render "Welcome back, Nathan" while showing Gulino's
// numbers without conflating identities.

export async function getDashboardHeader(
  options: { overrideAsOrg?: string } = {},
): Promise<{
  userName: string;
  isOverride: boolean;
  viewingOrgName?: string;
} | null> {
  try {
    const ctx = await getCurrentOrgContext(options);
    if (!ctx) return null;
    return {
      // userName here is the real user — getCurrentOrgContext sources
      // it from the auth-stamped User record, NOT from the override
      // target's org.
      userName: ctx.userName.split(" ")[0] || ctx.userName,
      isOverride: ctx.isOverride,
      viewingOrgName: ctx.viewingOrgName,
    };
  } catch (error) {
    console.error("getDashboardHeader error:", error);
    return null;
  }
}
