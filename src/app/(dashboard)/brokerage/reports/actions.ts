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

// ── Helpers ───────────────────────────────────────────────────

function getPeriodDates(period: "month" | "quarter" | "year"): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  if (period === "month") start.setDate(start.getDate() - 30);
  else if (period === "quarter") start.setDate(start.getDate() - 90);
  else start.setDate(start.getDate() - 365);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function escapeCSV(value: unknown): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatCurrency(n: number): string {
  return n.toFixed(2);
}

// ── 1. Dashboard Summary ──────────────────────────────────────

export async function getDashboardSummary(period: "month" | "quarter" | "year" = "month") {
  try {
    const { orgId } = await getCurrentOrg();
    const { start, end } = getPeriodDates(period);

    const approvedStatuses = ["approved", "invoiced", "paid"];

    const [
      totalDealsAgg,
      approvedDealsAgg,
      volumeAgg,
      commissionAgg,
      houseRevenueAgg,
      agentPayoutsAgg,
      pendingPayoutsAgg,
      submissionStatusGroups,
      invoiceStatusGroups,
      dealTypeGroups,
    ] = await Promise.all([
      // Total deals
      prisma.dealSubmission.count({
        where: { orgId, createdAt: { gte: start, lt: end } },
      }),
      // Approved+ deals
      prisma.dealSubmission.count({
        where: { orgId, createdAt: { gte: start, lt: end }, status: { in: approvedStatuses } },
      }),
      // Total volume from approved+ submissions
      prisma.dealSubmission.aggregate({
        where: { orgId, createdAt: { gte: start, lt: end }, status: { in: approvedStatuses } },
        _sum: { transactionValue: true },
      }),
      // Total commission from approved+ submissions
      prisma.dealSubmission.aggregate({
        where: { orgId, createdAt: { gte: start, lt: end }, status: { in: approvedStatuses } },
        _sum: { totalCommission: true },
      }),
      // House revenue from paid invoices
      prisma.invoice.aggregate({
        where: { orgId, paidDate: { gte: start, lt: end }, status: "paid" },
        _sum: { housePayout: true },
      }),
      // Agent payouts from paid invoices
      prisma.invoice.aggregate({
        where: { orgId, paidDate: { gte: start, lt: end }, status: "paid" },
        _sum: { agentPayout: true },
      }),
      // Pending payouts (draft + sent invoices)
      prisma.invoice.aggregate({
        where: { orgId, createdAt: { gte: start, lt: end }, status: { in: ["draft", "sent"] } },
        _sum: { agentPayout: true },
      }),
      // Submissions by status
      prisma.dealSubmission.groupBy({
        by: ["status"],
        where: { orgId, createdAt: { gte: start, lt: end } },
        _count: { status: true },
      }),
      // Invoices by status
      prisma.invoice.groupBy({
        by: ["status"],
        where: { orgId, createdAt: { gte: start, lt: end } },
        _count: { status: true },
      }),
      // Deals by type
      prisma.dealSubmission.groupBy({
        by: ["dealType"],
        where: { orgId, createdAt: { gte: start, lt: end } },
        _count: { dealType: true },
      }),
    ]);

    const totalVolume = Number(volumeAgg._sum.transactionValue || 0);
    const totalCommission = Number(commissionAgg._sum.totalCommission || 0);
    const approvedDeals = approvedDealsAgg || 0;

    const submissionsByStatus: Record<string, number> = {};
    for (const row of submissionStatusGroups) {
      submissionsByStatus[row.status] = row._count.status;
    }

    const invoicesByStatus: Record<string, number> = {};
    for (const row of invoiceStatusGroups) {
      invoicesByStatus[row.status] = row._count.status;
    }

    const dealsByType: Record<string, number> = {};
    for (const row of dealTypeGroups) {
      dealsByType[row.dealType] = row._count.dealType;
    }

    return JSON.parse(JSON.stringify({
      totalDeals: totalDealsAgg,
      approvedDeals,
      totalVolume,
      totalCommission,
      houseRevenue: Number(houseRevenueAgg._sum.housePayout || 0),
      agentPayouts: Number(agentPayoutsAgg._sum.agentPayout || 0),
      pendingPayouts: Number(pendingPayoutsAgg._sum.agentPayout || 0),
      avgDealSize: approvedDeals > 0 ? totalVolume / approvedDeals : 0,
      avgCommissionRate: totalVolume > 0 ? (totalCommission / totalVolume) * 100 : 0,
      submissionsByStatus,
      invoicesByStatus,
      dealsByType,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
    }));
  } catch (error) {
    console.error("getDashboardSummary error:", error);
    return {
      totalDeals: 0, approvedDeals: 0, totalVolume: 0, totalCommission: 0,
      houseRevenue: 0, agentPayouts: 0, pendingPayouts: 0,
      avgDealSize: 0, avgCommissionRate: 0,
      submissionsByStatus: {}, invoicesByStatus: {}, dealsByType: {},
      periodStart: "", periodEnd: "",
    };
  }
}

// ── 2. P&L Report ─────────────────────────────────────────────

export async function getPnlReport(
  startDate: string,
  endDate: string,
  groupBy: "month" | "week" = "month",
) {
  try {
    const { orgId } = await getCurrentOrg();
    const start = new Date(startDate);
    const end = new Date(endDate);

    const invoices = await prisma.invoice.findMany({
      where: {
        orgId,
        status: "paid",
        paidDate: { gte: start, lt: end },
      },
      select: {
        paidDate: true,
        housePayout: true,
        agentPayout: true,
        transactionValue: true,
      },
      orderBy: { paidDate: "asc" },
    });

    // Group by period
    const periodMap = new Map<string, {
      revenue: number;
      payouts: number;
      netIncome: number;
      dealCount: number;
      volume: number;
    }>();

    for (const inv of invoices) {
      if (!inv.paidDate) continue;
      const d = new Date(inv.paidDate);
      let periodKey: string;

      if (groupBy === "month") {
        periodKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      } else {
        // ISO week number
        const jan1 = new Date(d.getFullYear(), 0, 1);
        const dayOfYear = Math.floor((d.getTime() - jan1.getTime()) / 86400000) + 1;
        const weekNum = Math.ceil(dayOfYear / 7);
        periodKey = `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
      }

      const existing = periodMap.get(periodKey) || { revenue: 0, payouts: 0, netIncome: 0, dealCount: 0, volume: 0 };
      const housePay = Number(inv.housePayout || 0);
      const agentPay = Number(inv.agentPayout || 0);
      const txValue = Number(inv.transactionValue || 0);

      existing.revenue += housePay;
      existing.payouts += agentPay;
      existing.netIncome += housePay - agentPay;
      existing.dealCount += 1;
      existing.volume += txValue;

      periodMap.set(periodKey, existing);
    }

    const periods = Array.from(periodMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, data]) => ({ period, ...data }));

    let totalRevenue = 0;
    let totalPayouts = 0;
    let totalDeals = 0;
    let totalVolume = 0;
    for (const p of periods) {
      totalRevenue += p.revenue;
      totalPayouts += p.payouts;
      totalDeals += p.dealCount;
      totalVolume += p.volume;
    }

    return JSON.parse(JSON.stringify({
      periods,
      totals: {
        totalRevenue,
        totalPayouts,
        totalNetIncome: totalRevenue - totalPayouts,
        totalDeals,
        totalVolume,
      },
    }));
  } catch (error) {
    console.error("getPnlReport error:", error);
    return { periods: [], totals: { totalRevenue: 0, totalPayouts: 0, totalNetIncome: 0, totalDeals: 0, totalVolume: 0 } };
  }
}

// ── 3. Agent Production Report ────────────────────────────────

export async function getAgentProductionReport(
  startDate: string,
  endDate: string,
  sortBy: "volume" | "deals" | "earnings" = "volume",
) {
  try {
    const { orgId } = await getCurrentOrg();
    const start = new Date(startDate);
    const end = new Date(endDate);

    const invoices = await prisma.invoice.findMany({
      where: {
        orgId,
        status: "paid",
        paidDate: { gte: start, lt: end },
      },
      select: {
        agentId: true,
        agentName: true,
        agentEmail: true,
        transactionValue: true,
        totalCommission: true,
        agentPayout: true,
        housePayout: true,
        agentSplitPct: true,
      },
    });

    // Aggregate per agent
    const agentMap = new Map<string, {
      agentId: string;
      agentName: string;
      agentEmail: string;
      dealCount: number;
      totalVolume: number;
      totalCommission: number;
      agentEarnings: number;
      houseEarnings: number;
      splitPctSum: number;
    }>();

    for (const inv of invoices) {
      const key = inv.agentId || inv.agentEmail || inv.agentName;
      const existing = agentMap.get(key) || {
        agentId: inv.agentId || "",
        agentName: inv.agentName,
        agentEmail: inv.agentEmail || "",
        dealCount: 0,
        totalVolume: 0,
        totalCommission: 0,
        agentEarnings: 0,
        houseEarnings: 0,
        splitPctSum: 0,
      };

      existing.dealCount += 1;
      existing.totalVolume += Number(inv.transactionValue || 0);
      existing.totalCommission += Number(inv.totalCommission || 0);
      existing.agentEarnings += Number(inv.agentPayout || 0);
      existing.houseEarnings += Number(inv.housePayout || 0);
      existing.splitPctSum += Number(inv.agentSplitPct || 0);

      agentMap.set(key, existing);
    }

    let agents = Array.from(agentMap.values()).map((a) => ({
      agentId: a.agentId,
      agentName: a.agentName,
      agentEmail: a.agentEmail,
      dealCount: a.dealCount,
      totalVolume: a.totalVolume,
      totalCommission: a.totalCommission,
      agentEarnings: a.agentEarnings,
      houseEarnings: a.houseEarnings,
      avgDealSize: a.dealCount > 0 ? a.totalVolume / a.dealCount : 0,
      avgSplitPct: a.dealCount > 0 ? a.splitPctSum / a.dealCount : 0,
      rank: 0,
    }));

    // Sort
    if (sortBy === "deals") {
      agents.sort((a, b) => b.dealCount - a.dealCount);
    } else if (sortBy === "earnings") {
      agents.sort((a, b) => b.agentEarnings - a.agentEarnings);
    } else {
      agents.sort((a, b) => b.totalVolume - a.totalVolume);
    }

    // Assign rank
    agents = agents.map((a, i) => ({ ...a, rank: i + 1 }));

    // Org totals
    let totalDeals = 0;
    let totalVolume = 0;
    let totalCommission = 0;
    let totalAgentPayouts = 0;
    let totalHouseRevenue = 0;
    for (const a of agents) {
      totalDeals += a.dealCount;
      totalVolume += a.totalVolume;
      totalCommission += a.totalCommission;
      totalAgentPayouts += a.agentEarnings;
      totalHouseRevenue += a.houseEarnings;
    }

    return JSON.parse(JSON.stringify({
      agents,
      orgTotals: { totalDeals, totalVolume, totalCommission, totalAgentPayouts, totalHouseRevenue },
    }));
  } catch (error) {
    console.error("getAgentProductionReport error:", error);
    return { agents: [], orgTotals: { totalDeals: 0, totalVolume: 0, totalCommission: 0, totalAgentPayouts: 0, totalHouseRevenue: 0 } };
  }
}

// ── 4. 1099 Prep Data ─────────────────────────────────────────

export async function get1099PrepData(taxYear: number) {
  try {
    const { orgId } = await getCurrentOrg();
    const yearStart = new Date(taxYear, 0, 1);
    const yearEnd = new Date(taxYear + 1, 0, 1);

    const invoices = await prisma.invoice.findMany({
      where: {
        orgId,
        status: "paid",
        paidDate: { gte: yearStart, lt: yearEnd },
      },
      select: {
        agentId: true,
        agentName: true,
        agentEmail: true,
        agentLicense: true,
        agentPayout: true,
        paidDate: true,
      },
      orderBy: { paidDate: "asc" },
    });

    // Aggregate per agent
    const agentMap = new Map<string, {
      agentId: string;
      agentName: string;
      agentEmail: string;
      agentLicense: string;
      totalEarnings: number;
      invoiceCount: number;
      firstPaymentDate: string;
      lastPaymentDate: string;
    }>();

    for (const inv of invoices) {
      const key = inv.agentId || inv.agentEmail || inv.agentName;
      const paidDateStr = inv.paidDate ? new Date(inv.paidDate).toISOString() : "";
      const existing = agentMap.get(key);

      if (existing) {
        existing.totalEarnings += Number(inv.agentPayout || 0);
        existing.invoiceCount += 1;
        if (paidDateStr) existing.lastPaymentDate = paidDateStr;
      } else {
        agentMap.set(key, {
          agentId: inv.agentId || "",
          agentName: inv.agentName,
          agentEmail: inv.agentEmail || "",
          agentLicense: inv.agentLicense || "",
          totalEarnings: Number(inv.agentPayout || 0),
          invoiceCount: 1,
          firstPaymentDate: paidDateStr,
          lastPaymentDate: paidDateStr,
        });
      }
    }

    const agents = Array.from(agentMap.values()).map((a) => ({
      ...a,
      isAbove600: a.totalEarnings >= 600,
    }));

    // Sort by earnings descending
    agents.sort((a, b) => b.totalEarnings - a.totalEarnings);

    const totalAgents = agents.length;
    const agentsAboveThreshold = agents.filter((a) => a.isAbove600).length;
    let totalPaid = 0;
    for (const a of agents) totalPaid += a.totalEarnings;

    return JSON.parse(JSON.stringify({
      agents,
      summary: { totalAgents, agentsAboveThreshold, totalPaid },
    }));
  } catch (error) {
    console.error("get1099PrepData error:", error);
    return { agents: [], summary: { totalAgents: 0, agentsAboveThreshold: 0, totalPaid: 0 } };
  }
}

// ── 5. Deal Pipeline Report ───────────────────────────────────

export async function getDealPipelineReport(startDate: string, endDate: string) {
  try {
    const { orgId } = await getCurrentOrg();
    const start = new Date(startDate);
    const end = new Date(endDate);

    const baseWhere = { orgId, createdAt: { gte: start, lt: end } };

    const [statusGroups, dealTypeGroups, sourceGroups, submissions] = await Promise.all([
      // Status counts
      prisma.dealSubmission.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: { status: true },
      }),
      // By deal type with volume
      prisma.dealSubmission.groupBy({
        by: ["dealType"],
        where: baseWhere,
        _count: { dealType: true },
        _sum: { transactionValue: true },
        _avg: { transactionValue: true },
      }),
      // By source
      prisma.dealSubmission.groupBy({
        by: ["submissionSource"],
        where: baseWhere,
        _count: { submissionSource: true },
        _sum: { transactionValue: true },
      }),
      // All submissions for timing calculations
      prisma.dealSubmission.findMany({
        where: baseWhere,
        select: {
          status: true,
          createdAt: true,
          updatedAt: true,
          rejectionReason: true,
          propertyAddress: true,
          agentFirstName: true,
          agentLastName: true,
          submissionSource: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Status counts
    const statusCounts: Record<string, number> = {
      submitted: 0, under_review: 0, approved: 0, invoiced: 0, paid: 0, rejected: 0,
    };
    for (const row of statusGroups) {
      statusCounts[row.status] = row._count.status;
    }

    const totalSubmitted = statusCounts.submitted + statusCounts.under_review +
      statusCounts.approved + statusCounts.invoiced + statusCounts.paid + statusCounts.rejected;
    const totalApproved = statusCounts.approved + statusCounts.invoiced + statusCounts.paid;
    const totalInvoiced = statusCounts.invoiced + statusCounts.paid;
    const totalPaid = statusCounts.paid;

    // Conversion rates
    const conversionRates = {
      submittedToApproved: totalSubmitted > 0 ? (totalApproved / totalSubmitted) * 100 : 0,
      approvedToInvoiced: totalApproved > 0 ? (totalInvoiced / totalApproved) * 100 : 0,
      invoicedToPaid: totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : 0,
      overallConversion: totalSubmitted > 0 ? (totalPaid / totalSubmitted) * 100 : 0,
    };

    // Average days to approval / payment
    // For approved+ submissions, measure createdAt → updatedAt as proxy
    const approvedSubs = submissions.filter((s) =>
      ["approved", "invoiced", "paid"].includes(s.status),
    );
    let totalDaysToApproval = 0;
    for (const s of approvedSubs) {
      const days = (new Date(s.updatedAt).getTime() - new Date(s.createdAt).getTime()) / 86400000;
      totalDaysToApproval += days;
    }
    const avgDaysToApproval = approvedSubs.length > 0
      ? totalDaysToApproval / approvedSubs.length : 0;

    const paidSubs = submissions.filter((s) => s.status === "paid");
    let totalDaysToPayment = 0;
    for (const s of paidSubs) {
      const days = (new Date(s.updatedAt).getTime() - new Date(s.createdAt).getTime()) / 86400000;
      totalDaysToPayment += days;
    }
    const avgDaysToPayment = paidSubs.length > 0
      ? totalDaysToPayment / paidSubs.length : 0;

    // By source
    const bySource: Record<string, { count: number; volume: number }> = {
      internal: { count: 0, volume: 0 },
      external: { count: 0, volume: 0 },
    };
    for (const row of sourceGroups) {
      const key = row.submissionSource === "external" ? "external" : "internal";
      bySource[key] = {
        count: row._count.submissionSource,
        volume: Number(row._sum.transactionValue || 0),
      };
    }

    // By deal type
    const byDealType: Record<string, { count: number; volume: number; avgValue: number }> = {};
    for (const row of dealTypeGroups) {
      byDealType[row.dealType] = {
        count: row._count.dealType,
        volume: Number(row._sum.transactionValue || 0),
        avgValue: Number(row._avg.transactionValue || 0),
      };
    }

    // Recent rejections (last 10)
    const recentRejections = submissions
      .filter((s) => s.status === "rejected")
      .slice(0, 10)
      .map((s) => ({
        propertyAddress: s.propertyAddress,
        agentName: `${s.agentFirstName} ${s.agentLastName}`,
        reason: s.rejectionReason || "No reason provided",
        date: new Date(s.createdAt).toISOString(),
      }));

    return JSON.parse(JSON.stringify({
      statusCounts,
      conversionRates,
      avgDaysToApproval: Math.round(avgDaysToApproval * 10) / 10,
      avgDaysToPayment: Math.round(avgDaysToPayment * 10) / 10,
      bySource,
      byDealType,
      recentRejections,
    }));
  } catch (error) {
    console.error("getDealPipelineReport error:", error);
    return {
      statusCounts: {}, conversionRates: {
        submittedToApproved: 0, approvedToInvoiced: 0, invoicedToPaid: 0, overallConversion: 0,
      },
      avgDaysToApproval: 0, avgDaysToPayment: 0,
      bySource: {}, byDealType: {}, recentRejections: [],
    };
  }
}

// ── 6. CSV Export ─────────────────────────────────────────────

export async function exportReportCSV(
  reportType: "1099" | "agent_production" | "pnl",
  params: Record<string, string>,
): Promise<{ csv: string; filename: string }> {
  try {
    if (reportType === "1099") {
      const taxYear = parseInt(params.taxYear || String(new Date().getFullYear()), 10);
      const data = await get1099PrepData(taxYear);

      const header = ["Agent Name", "Email", "License #", "Total Earnings", "Invoice Count", "Above $600 Threshold"];
      const rows = data.agents.map((a: {
        agentName: string; agentEmail: string; agentLicense: string;
        totalEarnings: number; invoiceCount: number; isAbove600: boolean;
      }) => [
        escapeCSV(a.agentName),
        escapeCSV(a.agentEmail),
        escapeCSV(a.agentLicense),
        formatCurrency(a.totalEarnings),
        String(a.invoiceCount),
        a.isAbove600 ? "Yes" : "No",
      ]);

      const csv = [header.join(","), ...rows.map((r: string[]) => r.join(","))].join("\n");
      return { csv, filename: `1099-prep-${taxYear}.csv` };
    }

    if (reportType === "agent_production") {
      const startDate = params.startDate || new Date(new Date().getFullYear(), 0, 1).toISOString();
      const endDate = params.endDate || new Date().toISOString();
      const sortBy = (params.sortBy as "volume" | "deals" | "earnings") || "volume";
      const data = await getAgentProductionReport(startDate, endDate, sortBy);

      const header = ["Rank", "Agent Name", "Email", "Deals", "Volume", "Commission", "Agent Earnings", "House Earnings", "Avg Deal Size"];
      const rows = data.agents.map((a: {
        rank: number; agentName: string; agentEmail: string; dealCount: number;
        totalVolume: number; totalCommission: number; agentEarnings: number;
        houseEarnings: number; avgDealSize: number;
      }) => [
        String(a.rank),
        escapeCSV(a.agentName),
        escapeCSV(a.agentEmail),
        String(a.dealCount),
        formatCurrency(a.totalVolume),
        formatCurrency(a.totalCommission),
        formatCurrency(a.agentEarnings),
        formatCurrency(a.houseEarnings),
        formatCurrency(a.avgDealSize),
      ]);

      const csv = [header.join(","), ...rows.map((r: string[]) => r.join(","))].join("\n");
      return { csv, filename: `agent-production-${params.startDate || "ytd"}.csv` };
    }

    if (reportType === "pnl") {
      const startDate = params.startDate || new Date(new Date().getFullYear(), 0, 1).toISOString();
      const endDate = params.endDate || new Date().toISOString();
      const groupBy = (params.groupBy as "month" | "week") || "month";
      const data = await getPnlReport(startDate, endDate, groupBy);

      const header = ["Period", "Revenue (House)", "Payouts (Agent)", "Net Income", "Deals", "Volume"];
      const rows = data.periods.map((p: {
        period: string; revenue: number; payouts: number;
        netIncome: number; dealCount: number; volume: number;
      }) => [
        escapeCSV(p.period),
        formatCurrency(p.revenue),
        formatCurrency(p.payouts),
        formatCurrency(p.netIncome),
        String(p.dealCount),
        formatCurrency(p.volume),
      ]);

      const csv = [header.join(","), ...rows.map((r: string[]) => r.join(","))].join("\n");
      return { csv, filename: `pnl-report-${params.startDate || "ytd"}.csv` };
    }

    return { csv: "", filename: "unknown.csv" };
  } catch (error) {
    console.error("exportReportCSV error:", error);
    return { csv: "", filename: "error.csv" };
  }
}
