"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/bms-permissions";
import { logSubmissionAction, logPaymentAction } from "@/lib/bms-audit";
import type { BrokerageRoleType } from "@/lib/bms-types";

// ── Auth Helper ───────────────────────────────────────────────

async function getAuthContext() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    include: { brokerAgent: { select: { id: true, brokerageRole: true, status: true } } },
  });
  if (!user) throw new Error("User not found");

  // Resolve brokerage role
  let role: BrokerageRoleType = "agent";
  if (user.role === "owner" || user.role === "admin" || user.role === "super_admin") {
    role = "brokerage_admin";
  } else if (user.brokerAgent?.brokerageRole) {
    role = user.brokerAgent.brokerageRole as BrokerageRoleType;
  }

  return {
    userId: user.id,
    orgId: user.orgId,
    role,
    agentId: user.brokerAgent?.id || null,
  };
}

// ── Helpers ───────────────────────────────────────────────────

function toNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function buildDateFilter(startDate?: string, endDate?: string) {
  const filter: Record<string, unknown> = {};
  if (startDate) filter.gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    filter.lte = end;
  }
  return Object.keys(filter).length > 0 ? filter : undefined;
}

// ── 1. Record Payout ──────────────────────────────────────────

export async function recordPayout(input: {
  submissionId: string;
  paymentMethod: string;
  paymentDate?: string;
  referenceNumber?: string;
  notes?: string;
}) {
  try {
    const ctx = await getAuthContext();

    if (!hasPermission(ctx.role, "record_payment")) {
      return { success: false, error: "Insufficient permissions" };
    }

    const submission = await prisma.dealSubmission.findFirst({
      where: { id: input.submissionId, orgId: ctx.orgId },
      include: {
        invoice: true,
        transaction: true,
      },
    });

    if (!submission) {
      return { success: false, error: "Submission not found" };
    }

    if (submission.status !== "invoiced") {
      return { success: false, error: "Submission must be in invoiced status to record payment" };
    }

    const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update submission to paid
      await tx.dealSubmission.update({
        where: { id: input.submissionId },
        data: { status: "paid" },
      });

      // 2. Update linked invoice to paid
      if (submission.invoice) {
        await tx.invoice.update({
          where: { id: submission.invoice.id },
          data: {
            status: "paid",
            paidDate: paymentDate,
          },
        });
      }

      // 3. Update linked transaction payout fields
      if (submission.transaction) {
        await tx.transaction.update({
          where: { id: submission.transaction.id },
          data: {
            agentPayoutStatus: "paid",
            agentPaidAt: paymentDate,
            agentPayoutDate: paymentDate,
            agentPayoutMethod: input.paymentMethod,
            agentPayoutReference: input.referenceNumber || null,
          },
        });
      }

      // 4. Create payment record
      const payment = await tx.payment.create({
        data: {
          orgId: ctx.orgId,
          invoiceId: submission.invoice?.id || "",
          agentId: submission.agentId || null,
          amount: submission.agentPayout,
          paymentMethod: input.paymentMethod as "check" | "ach" | "wire" | "cash" | "stripe" | "other",
          paymentDate,
          referenceNumber: input.referenceNumber || null,
          notes: input.notes || null,
        },
      });

      return payment;
    });

    // Audit logs (fire-and-forget)
    logSubmissionAction(ctx.orgId, { id: ctx.userId }, "paid", input.submissionId, {
      paymentMethod: input.paymentMethod,
      paymentDate: paymentDate.toISOString(),
      referenceNumber: input.referenceNumber,
    });

    logPaymentAction(ctx.orgId, { id: ctx.userId }, "recorded", result.id, {
      submissionId: input.submissionId,
      amount: toNum(submission.agentPayout),
      paymentMethod: input.paymentMethod,
    });

    return { success: true, paymentId: result.id };
  } catch (error) {
    console.error("recordPayout error:", error);
    return { success: false, error: "Failed to record payout" };
  }
}

// ── 2. Agent Earnings Report ──────────────────────────────────

export async function getAgentEarningsReport(filters?: {
  startDate?: string;
  endDate?: string;
  year?: number;
}) {
  try {
    const ctx = await getAuthContext();

    if (!hasPermission(ctx.role, "view_reports")) {
      return { agents: [], orgTotals: null };
    }

    const where: Record<string, unknown> = {
      orgId: ctx.orgId,
      status: { in: ["approved", "invoiced", "paid"] },
    };

    if (filters?.year) {
      const yearStart = new Date(filters.year, 0, 1);
      const yearEnd = new Date(filters.year, 11, 31, 23, 59, 59, 999);
      where.createdAt = { gte: yearStart, lte: yearEnd };
    } else {
      const dateFilter = buildDateFilter(filters?.startDate, filters?.endDate);
      if (dateFilter) where.createdAt = dateFilter;
    }

    const submissions = await prisma.dealSubmission.findMany({
      where,
      include: {
        agent: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Group by agent
    const agentMap = new Map<string, {
      agentId: string;
      agentName: string;
      agentEmail: string;
      dealCount: number;
      totalCommission: number;
      totalAgentPayout: number;
      totalHousePayout: number;
      paidOut: number;
      pendingPayout: number;
      avgDealSize: number;
      totalTransactionValue: number;
      dealsByType: Record<string, number>;
      dealsByExclusive: { exclusive: number; coBroke: number };
    }>();

    let orgTotalCommission = 0;
    let orgTotalAgentPayout = 0;
    let orgTotalHousePayout = 0;
    let orgTotalPaidOut = 0;
    let orgTotalPending = 0;
    let orgTotalDeals = 0;
    let orgTotalTransactionValue = 0;

    for (const sub of submissions) {
      const agentKey = sub.agentId || sub.agentEmail;
      const agentName = sub.agent
        ? `${sub.agent.firstName} ${sub.agent.lastName}`
        : `${sub.agentFirstName} ${sub.agentLastName}`;
      const agentEmail = sub.agent?.email || sub.agentEmail;

      if (!agentMap.has(agentKey)) {
        agentMap.set(agentKey, {
          agentId: sub.agentId || agentKey,
          agentName,
          agentEmail,
          dealCount: 0,
          totalCommission: 0,
          totalAgentPayout: 0,
          totalHousePayout: 0,
          paidOut: 0,
          pendingPayout: 0,
          avgDealSize: 0,
          totalTransactionValue: 0,
          dealsByType: {},
          dealsByExclusive: { exclusive: 0, coBroke: 0 },
        });
      }

      const entry = agentMap.get(agentKey)!;
      const commission = toNum(sub.totalCommission);
      const agentPay = toNum(sub.agentPayout);
      const housePay = toNum(sub.housePayout);
      const txnValue = toNum(sub.transactionValue);

      entry.dealCount++;
      entry.totalCommission += commission;
      entry.totalAgentPayout += agentPay;
      entry.totalHousePayout += housePay;
      entry.totalTransactionValue += txnValue;

      if (sub.status === "paid") {
        entry.paidOut += agentPay;
      } else {
        entry.pendingPayout += agentPay;
      }

      // Deal type breakdown
      const dt = sub.dealType || "other";
      entry.dealsByType[dt] = (entry.dealsByType[dt] || 0) + 1;

      // Exclusive vs co-broke
      if (sub.coBrokeAgent || sub.coBrokeBrokerage) {
        entry.dealsByExclusive.coBroke++;
      } else {
        entry.dealsByExclusive.exclusive++;
      }

      // Org totals
      orgTotalCommission += commission;
      orgTotalAgentPayout += agentPay;
      orgTotalHousePayout += housePay;
      orgTotalDeals++;
      orgTotalTransactionValue += txnValue;
      if (sub.status === "paid") orgTotalPaidOut += agentPay;
      else orgTotalPending += agentPay;
    }

    // Compute avg deal size and sort by payout desc
    const agents = Array.from(agentMap.values())
      .map((a) => ({
        ...a,
        avgDealSize: a.dealCount > 0 ? a.totalTransactionValue / a.dealCount : 0,
      }))
      .sort((a, b) => b.totalAgentPayout - a.totalAgentPayout);

    const orgTotals = {
      totalCommission: orgTotalCommission,
      totalAgentPayout: orgTotalAgentPayout,
      totalHousePayout: orgTotalHousePayout,
      paidOut: orgTotalPaidOut,
      pendingPayout: orgTotalPending,
      totalDeals: orgTotalDeals,
      totalTransactionValue: orgTotalTransactionValue,
      avgDealSize: orgTotalDeals > 0 ? orgTotalTransactionValue / orgTotalDeals : 0,
    };

    return JSON.parse(JSON.stringify({ agents, orgTotals }));
  } catch (error) {
    console.error("getAgentEarningsReport error:", error);
    return { agents: [], orgTotals: null };
  }
}

// ── 3. Revenue Pipeline ───────────────────────────────────────

export async function getRevenuePipeline(filters?: {
  startDate?: string;
  endDate?: string;
}) {
  try {
    const ctx = await getAuthContext();

    if (!hasPermission(ctx.role, "view_reports")) {
      return null;
    }

    const where: Record<string, unknown> = { orgId: ctx.orgId };
    const dateFilter = buildDateFilter(filters?.startDate, filters?.endDate);
    if (dateFilter) where.createdAt = dateFilter;

    const submissions = await prisma.dealSubmission.findMany({
      where,
      select: {
        status: true,
        totalCommission: true,
        agentPayout: true,
        housePayout: true,
      },
    });

    const stages: Record<string, { count: number; totalCommission: number; totalAgentPayout: number; totalHousePayout: number }> = {
      submitted: { count: 0, totalCommission: 0, totalAgentPayout: 0, totalHousePayout: 0 },
      approved: { count: 0, totalCommission: 0, totalAgentPayout: 0, totalHousePayout: 0 },
      invoiced: { count: 0, totalCommission: 0, totalAgentPayout: 0, totalHousePayout: 0 },
      paid: { count: 0, totalCommission: 0, totalAgentPayout: 0, totalHousePayout: 0 },
    };

    let totalRevenueCollected = 0;
    let totalAgentPayoutsCompleted = 0;

    for (const sub of submissions) {
      const stage = stages[sub.status];
      if (!stage) continue; // skip rejected, under_review

      const commission = toNum(sub.totalCommission);
      const agentPay = toNum(sub.agentPayout);
      const housePay = toNum(sub.housePayout);

      stage.count++;
      stage.totalCommission += commission;
      stage.totalAgentPayout += agentPay;
      stage.totalHousePayout += housePay;

      if (sub.status === "paid") {
        totalRevenueCollected += housePay;
        totalAgentPayoutsCompleted += agentPay;
      }
    }

    const pendingInvoicing = stages.approved.totalCommission;
    const pendingPayment = stages.invoiced.totalAgentPayout;

    return JSON.parse(JSON.stringify({
      stages,
      totalRevenueCollected,
      totalAgentPayoutsCompleted,
      pendingInvoicing,
      pendingPayment,
    }));
  } catch (error) {
    console.error("getRevenuePipeline error:", error);
    return null;
  }
}

// ── 4. Revenue by Month ───────────────────────────────────────

export async function getRevenueByMonth(year?: number) {
  try {
    const ctx = await getAuthContext();

    if (!hasPermission(ctx.role, "view_reports")) {
      return [];
    }

    const targetYear = year || new Date().getFullYear();
    const yearStart = new Date(targetYear, 0, 1);
    const yearEnd = new Date(targetYear, 11, 31, 23, 59, 59, 999);

    const submissions = await prisma.dealSubmission.findMany({
      where: {
        orgId: ctx.orgId,
        status: "paid",
        updatedAt: { gte: yearStart, lte: yearEnd },
      },
      select: {
        totalCommission: true,
        agentPayout: true,
        housePayout: true,
        updatedAt: true,
      },
    });

    // Initialize 12-month array
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i,
      label: new Date(targetYear, i, 1).toLocaleString("en-US", { month: "short" }),
      totalCommission: 0,
      houseRevenue: 0,
      agentPayouts: 0,
      dealCount: 0,
    }));

    for (const sub of submissions) {
      const monthIndex = sub.updatedAt.getMonth();
      const entry = months[monthIndex];
      entry.totalCommission += toNum(sub.totalCommission);
      entry.houseRevenue += toNum(sub.housePayout);
      entry.agentPayouts += toNum(sub.agentPayout);
      entry.dealCount++;
    }

    return JSON.parse(JSON.stringify(months));
  } catch (error) {
    console.error("getRevenueByMonth error:", error);
    return [];
  }
}

// ── 5. 1099 Data ──────────────────────────────────────────────

export async function get1099Data(year: number) {
  try {
    const ctx = await getAuthContext();

    if (!hasPermission(ctx.role, "view_1099")) {
      return { agents: [], summary: null };
    }

    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

    const submissions = await prisma.dealSubmission.findMany({
      where: {
        orgId: ctx.orgId,
        status: "paid",
        updatedAt: { gte: yearStart, lte: yearEnd },
      },
      include: {
        agent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            address: true,
            city: true,
            state: true,
            zipCode: true,
            w9OnFile: true,
          },
        },
      },
    });

    // Group by agent
    const agentMap = new Map<string, {
      agentId: string;
      agentName: string;
      agentEmail: string;
      address: string;
      city: string;
      state: string;
      zipCode: string;
      w9OnFile: boolean;
      totalPaid: number;
      dealCount: number;
      meetsThreshold: boolean;
    }>();

    for (const sub of submissions) {
      const agentKey = sub.agentId || sub.agentEmail;
      const agentName = sub.agent
        ? `${sub.agent.firstName} ${sub.agent.lastName}`
        : `${sub.agentFirstName} ${sub.agentLastName}`;

      if (!agentMap.has(agentKey)) {
        agentMap.set(agentKey, {
          agentId: sub.agentId || agentKey,
          agentName,
          agentEmail: sub.agent?.email || sub.agentEmail,
          address: sub.agent?.address || "",
          city: sub.agent?.city || "",
          state: sub.agent?.state || "NY",
          zipCode: sub.agent?.zipCode || "",
          w9OnFile: sub.agent?.w9OnFile ?? false,
          totalPaid: 0,
          dealCount: 0,
          meetsThreshold: false,
        });
      }

      const entry = agentMap.get(agentKey)!;
      entry.totalPaid += toNum(sub.agentPayout);
      entry.dealCount++;
    }

    const agents = Array.from(agentMap.values())
      .map((a) => ({
        ...a,
        meetsThreshold: a.totalPaid >= 600,
      }))
      .sort((a, b) => b.totalPaid - a.totalPaid);

    const summary = {
      year,
      totalAgents: agents.length,
      agentsAboveThreshold: agents.filter((a) => a.meetsThreshold).length,
      agentsBelowThreshold: agents.filter((a) => !a.meetsThreshold).length,
      totalPaidOut: agents.reduce((sum, a) => sum + a.totalPaid, 0),
      missingW9Count: agents.filter((a) => a.meetsThreshold && !a.w9OnFile).length,
    };

    return JSON.parse(JSON.stringify({ agents, summary }));
  } catch (error) {
    console.error("get1099Data error:", error);
    return { agents: [], summary: null };
  }
}

// ── 6. Mark Submission Paid (convenience wrapper) ─────────────

export async function markSubmissionPaid(submissionId: string) {
  return recordPayout({
    submissionId,
    paymentMethod: "check",
    paymentDate: new Date().toISOString().slice(0, 10),
  });
}
