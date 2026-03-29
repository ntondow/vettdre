"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/bms-permissions";
import { logSubmissionAction, logPaymentAction } from "@/lib/bms-audit";
import type { BrokerageRoleType } from "@/lib/bms-types";

// ── Auth Helper ─────────────────────────────────────────────

interface AuthContext {
  userId: string;
  orgId: string;
  role: BrokerageRoleType;
  fullName: string;
}

async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  let user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    include: { brokerAgent: { select: { id: true, brokerageRole: true, status: true } } },
  });
  if (!user && authUser.email) {
    user = await prisma.user.findFirst({
      where: { email: authUser.email },
      include: { brokerAgent: { select: { id: true, brokerageRole: true, status: true } } },
    });
  }
  if (!user) return null;

  let role: BrokerageRoleType | null = null;
  if (user.role === "owner" || user.role === "admin") {
    role = "brokerage_admin";
  } else {
    const firstOrgUser = await prisma.user.findFirst({
      where: { orgId: user.orgId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (firstOrgUser && firstOrgUser.id === user.id) role = "brokerage_admin";
  }
  if (!role) {
    const ROLE_MAP: Partial<Record<string, BrokerageRoleType>> = { admin: "brokerage_admin", manager: "manager" };
    if (user.role && ROLE_MAP[user.role]) role = ROLE_MAP[user.role]!;
    else if (user.brokerAgent?.brokerageRole) role = user.brokerAgent.brokerageRole as BrokerageRoleType;
  }
  if (!role) return null;

  return { userId: user.id, orgId: user.orgId, role, fullName: user.fullName || user.email };
}

function num(val: unknown): number {
  if (val == null) return 0;
  return Number(val);
}

// ── 1. recordPayout ─────────────────────────────────────────

export async function recordPayout(input: {
  submissionId: string;
  paymentMethod: string;
  paymentDate?: string;
  referenceNumber?: string;
  notes?: string;
}): Promise<{ success: boolean; paymentId?: string; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx.role, "record_payment")) {
      return { success: false, error: "Not authorized" };
    }

    const submission = await prisma.dealSubmission.findFirst({
      where: { id: input.submissionId, orgId: ctx.orgId },
      include: {
        invoice: true,
        transaction: true,
        agent: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!submission) return { success: false, error: "Submission not found" };
    if (submission.status !== "invoiced") {
      return { success: false, error: "Submission must be in 'invoiced' status to record payout" };
    }

    const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();
    const agentPayout = num(submission.agentPayout);

    const result = await prisma.$transaction(async (tx) => {
      // a. Update submission status
      await tx.dealSubmission.update({
        where: { id: input.submissionId },
        data: { status: "paid" },
      });

      // b. Update invoice if linked
      if (submission.invoice) {
        await tx.invoice.update({
          where: { id: submission.invoice.id },
          data: { status: "paid", paidDate: paymentDate },
        });
      }

      // c. Update transaction if linked
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

      // d. Create payment record
      let payment = null;
      if (submission.invoice) {
        payment = await tx.payment.create({
          data: {
            orgId: ctx.orgId,
            invoiceId: submission.invoice.id,
            agentId: submission.agentId || null,
            amount: agentPayout,
            paymentMethod: input.paymentMethod as "check" | "ach" | "wire" | "cash" | "other",
            paymentDate,
            referenceNumber: input.referenceNumber || null,
            notes: input.notes || null,
          },
        });
      }

      return { payment };
    });

    // e. Audit logs
    logSubmissionAction(ctx.orgId, { id: ctx.userId, name: ctx.fullName, role: ctx.role }, "paid", input.submissionId, {
      paymentMethod: input.paymentMethod,
      amount: agentPayout,
      agentName: submission.agent ? `${submission.agent.firstName} ${submission.agent.lastName}` : undefined,
    });
    if (result.payment) {
      logPaymentAction(ctx.orgId, { id: ctx.userId, name: ctx.fullName, role: ctx.role }, "recorded", result.payment.id, {
        submissionId: input.submissionId,
        amount: agentPayout,
      });
    }

    return { success: true, paymentId: result.payment?.id };
  } catch (error: unknown) {
    console.error("recordPayout error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to record payout" };
  }
}

// ── 2. getAgentEarningsReport ───────────────────────────────

export async function getAgentEarningsReport(params?: {
  startDate?: string;
  endDate?: string;
  year?: number;
}): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx.role, "view_reports")) {
      return { success: false, error: "Not authorized" };
    }

    const year = params?.year ?? new Date().getFullYear();
    const startDate = params?.startDate ? new Date(params.startDate) : new Date(year, 0, 1);
    const endDate = params?.endDate ? new Date(params.endDate) : new Date(year, 11, 31, 23, 59, 59);

    const submissions = await prisma.dealSubmission.findMany({
      where: {
        orgId: ctx.orgId,
        status: { in: ["approved", "invoiced", "paid"] },
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        agentId: true,
        agentFirstName: true,
        agentLastName: true,
        agentEmail: true,
        status: true,
        dealType: true,
        exclusiveType: true,
        transactionValue: true,
        totalCommission: true,
        agentPayout: true,
        housePayout: true,
      },
    });

    // Get agent details for address/license
    const agents = await prisma.brokerAgent.findMany({
      where: { orgId: ctx.orgId },
      select: { id: true, firstName: true, lastName: true, email: true, licenseNumber: true, address: true, city: true, state: true, zipCode: true },
    });
    const agentMap = new Map(agents.map((a) => [a.id, a]));

    // Aggregate per agent
    const byAgent = new Map<string, {
      agentId: string;
      agentName: string;
      agentEmail: string;
      licenseNumber: string;
      address: string;
      dealCount: number;
      totalCommission: number;
      totalAgentPayout: number;
      totalHousePayout: number;
      paidOut: number;
      pendingPayout: number;
      totalTransactionValue: number;
      dealsByType: Record<string, number>;
      dealsByExclusive: Record<string, number>;
    }>();

    for (const s of submissions) {
      const key = s.agentId ?? `${s.agentFirstName}_${s.agentLastName}`;
      if (!byAgent.has(key)) {
        const agentDetail = s.agentId ? agentMap.get(s.agentId) : null;
        const addr = agentDetail ? [agentDetail.address, agentDetail.city, agentDetail.state, agentDetail.zipCode].filter(Boolean).join(", ") : "";
        byAgent.set(key, {
          agentId: s.agentId ?? key,
          agentName: agentDetail ? `${agentDetail.firstName} ${agentDetail.lastName}` : `${s.agentFirstName} ${s.agentLastName}`,
          agentEmail: agentDetail?.email ?? s.agentEmail,
          licenseNumber: agentDetail?.licenseNumber ?? "",
          address: addr,
          dealCount: 0,
          totalCommission: 0,
          totalAgentPayout: 0,
          totalHousePayout: 0,
          paidOut: 0,
          pendingPayout: 0,
          totalTransactionValue: 0,
          dealsByType: {},
          dealsByExclusive: {},
        });
      }
      const row = byAgent.get(key)!;
      row.dealCount++;
      row.totalCommission += num(s.totalCommission);
      row.totalAgentPayout += num(s.agentPayout);
      row.totalHousePayout += num(s.housePayout);
      row.totalTransactionValue += num(s.transactionValue);
      if (s.status === "paid") row.paidOut += num(s.agentPayout);
      else row.pendingPayout += num(s.agentPayout);
      row.dealsByType[s.dealType] = (row.dealsByType[s.dealType] || 0) + 1;
      if (s.exclusiveType) row.dealsByExclusive[s.exclusiveType] = (row.dealsByExclusive[s.exclusiveType] || 0) + 1;
    }

    const agentRows = Array.from(byAgent.values())
      .map((r) => ({ ...r, avgDealSize: r.dealCount > 0 ? r.totalTransactionValue / r.dealCount : 0 }))
      .sort((a, b) => b.totalAgentPayout - a.totalAgentPayout);

    const orgTotals = {
      totalDeals: agentRows.reduce((s, r) => s + r.dealCount, 0),
      totalCommission: agentRows.reduce((s, r) => s + r.totalCommission, 0),
      totalAgentPayout: agentRows.reduce((s, r) => s + r.totalAgentPayout, 0),
      totalHousePayout: agentRows.reduce((s, r) => s + r.totalHousePayout, 0),
      totalPaidOut: agentRows.reduce((s, r) => s + r.paidOut, 0),
      totalPending: agentRows.reduce((s, r) => s + r.pendingPayout, 0),
    };

    return { success: true, data: { agents: agentRows, orgTotals } };
  } catch (error: unknown) {
    console.error("getAgentEarningsReport error:", error);
    return { success: false, error: "Failed to generate earnings report" };
  }
}

// ── 3. getRevenuePipeline ───────────────────────────────────

export async function getRevenuePipeline(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx.role, "view_reports")) {
      return { success: false, error: "Not authorized" };
    }

    const where: Record<string, unknown> = { orgId: ctx.orgId };
    if (params?.startDate || params?.endDate) {
      const createdAt: Record<string, Date> = {};
      if (params.startDate) createdAt.gte = new Date(params.startDate);
      if (params.endDate) createdAt.lte = new Date(params.endDate);
      where.createdAt = createdAt;
    }

    const submissions = await prisma.dealSubmission.findMany({
      where,
      select: { status: true, totalCommission: true, agentPayout: true, housePayout: true },
    });

    const pipeline: Record<string, { count: number; totalCommission: number; totalAgentPayout: number; totalHousePayout: number }> = {};
    for (const status of ["submitted", "approved", "invoiced", "paid", "rejected"]) {
      pipeline[status] = { count: 0, totalCommission: 0, totalAgentPayout: 0, totalHousePayout: 0 };
    }

    for (const s of submissions) {
      const stage = pipeline[s.status];
      if (stage) {
        stage.count++;
        stage.totalCommission += num(s.totalCommission);
        stage.totalAgentPayout += num(s.agentPayout);
        stage.totalHousePayout += num(s.housePayout);
      }
    }

    const paid = pipeline.paid;
    const approved = pipeline.approved;
    const invoiced = pipeline.invoiced;

    return {
      success: true,
      data: {
        pipeline,
        totalRevenueCollected: paid.totalHousePayout,
        totalAgentPayoutsCompleted: paid.totalAgentPayout,
        pendingInvoicing: approved.totalCommission,
        pendingPayment: invoiced.totalCommission,
      },
    };
  } catch (error: unknown) {
    console.error("getRevenuePipeline error:", error);
    return { success: false, error: "Failed to fetch revenue pipeline" };
  }
}

// ── 4. getRevenueByMonth ────────────────────────────────────

export async function getRevenueByMonth(year?: number): Promise<{
  success: boolean;
  data?: Array<{ month: number; monthLabel: string; totalCommission: number; houseRevenue: number; agentPayouts: number; dealCount: number }>;
  error?: string;
}> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx.role, "view_reports")) {
      return { success: false, error: "Not authorized" };
    }

    const y = year ?? new Date().getFullYear();
    const startDate = new Date(y, 0, 1);
    const endDate = new Date(y, 11, 31, 23, 59, 59);

    const submissions = await prisma.dealSubmission.findMany({
      where: {
        orgId: ctx.orgId,
        status: "paid",
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { createdAt: true, totalCommission: true, housePayout: true, agentPayout: true },
    });

    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const months = MONTHS.map((label, i) => ({
      month: i + 1,
      monthLabel: label,
      totalCommission: 0,
      houseRevenue: 0,
      agentPayouts: 0,
      dealCount: 0,
    }));

    for (const s of submissions) {
      const m = new Date(s.createdAt).getMonth();
      months[m].totalCommission += num(s.totalCommission);
      months[m].houseRevenue += num(s.housePayout);
      months[m].agentPayouts += num(s.agentPayout);
      months[m].dealCount++;
    }

    return { success: true, data: months };
  } catch (error: unknown) {
    console.error("getRevenueByMonth error:", error);
    return { success: false, error: "Failed to fetch monthly revenue" };
  }
}

// ── 5. get1099Data ──────────────────────────────────────────

export async function get1099Data(year: number): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx.role, "view_1099")) {
      return { success: false, error: "Not authorized" };
    }

    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31, 23, 59, 59);

    const submissions = await prisma.dealSubmission.findMany({
      where: {
        orgId: ctx.orgId,
        status: "paid",
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        agentId: true,
        agentFirstName: true,
        agentLastName: true,
        agentEmail: true,
        agentLicense: true,
        agentPayout: true,
        createdAt: true,
      },
    });

    const agents = await prisma.brokerAgent.findMany({
      where: { orgId: ctx.orgId },
      select: { id: true, firstName: true, lastName: true, email: true, licenseNumber: true, address: true, city: true, state: true, zipCode: true },
    });
    const agentMap = new Map(agents.map((a) => [a.id, a]));

    const byAgent = new Map<string, {
      agentId: string;
      agentName: string;
      agentEmail: string;
      agentLicense: string;
      agentAddress: string;
      totalEarnings: number;
      invoiceCount: number;
      firstPaymentDate: string | null;
      lastPaymentDate: string | null;
    }>();

    for (const s of submissions) {
      const key = s.agentId ?? `${s.agentFirstName}_${s.agentLastName}`;
      if (!byAgent.has(key)) {
        const detail = s.agentId ? agentMap.get(s.agentId) : null;
        const addr = detail ? [detail.address, detail.city, detail.state, detail.zipCode].filter(Boolean).join(", ") : "";
        byAgent.set(key, {
          agentId: key,
          agentName: detail ? `${detail.firstName} ${detail.lastName}` : `${s.agentFirstName} ${s.agentLastName}`,
          agentEmail: detail?.email ?? s.agentEmail,
          agentLicense: detail?.licenseNumber ?? s.agentLicense ?? "",
          agentAddress: addr,
          totalEarnings: 0,
          invoiceCount: 0,
          firstPaymentDate: null,
          lastPaymentDate: null,
        });
      }
      const row = byAgent.get(key)!;
      row.totalEarnings += num(s.agentPayout);
      row.invoiceCount++;
      const dateStr = new Date(s.createdAt).toISOString();
      if (!row.firstPaymentDate || dateStr < row.firstPaymentDate) row.firstPaymentDate = dateStr;
      if (!row.lastPaymentDate || dateStr > row.lastPaymentDate) row.lastPaymentDate = dateStr;
    }

    const allAgents = Array.from(byAgent.values()).sort((a, b) => b.totalEarnings - a.totalEarnings);
    const above600 = allAgents.filter((a) => a.totalEarnings >= 600);

    return {
      success: true,
      data: {
        agents: allAgents.map((a) => ({ ...a, isAbove600: a.totalEarnings >= 600 })),
        summary: {
          totalAgents: allAgents.length,
          agentsAboveThreshold: above600.length,
          totalPaid: allAgents.reduce((s, a) => s + a.totalEarnings, 0),
        },
      },
    };
  } catch (error: unknown) {
    console.error("get1099Data error:", error);
    return { success: false, error: "Failed to generate 1099 data" };
  }
}

// ── 6. markSubmissionPaid ───────────────────────────────────

export async function markSubmissionPaid(submissionId: string): Promise<{ success: boolean; error?: string }> {
  const result = await recordPayout({
    submissionId,
    paymentMethod: "check",
    paymentDate: new Date().toISOString(),
  });
  return { success: result.success, error: result.error };
}
