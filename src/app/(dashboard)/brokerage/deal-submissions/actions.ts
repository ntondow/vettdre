"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/bms-permissions";
import { logSubmissionAction, logInvoiceAction, logTransactionAction } from "@/lib/bms-audit";
import { buildInvoiceNumber } from "@/lib/bms-types";
import type { DealSubmissionInput, ExclusiveType, BrokerageRoleType } from "@/lib/bms-types";

// ── Auth Helper ─────────────────────────────────────────────

interface AuthContext {
  userId: string;
  orgId: string;
  agentId: string;
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

  // Determine brokerage role (same logic as bms-auth.ts)
  let role: BrokerageRoleType | null = null;

  if (user.role === "owner" || user.role === "admin") {
    role = "brokerage_admin";
  } else {
    const firstOrgUser = await prisma.user.findFirst({
      where: { orgId: user.orgId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (firstOrgUser && firstOrgUser.id === user.id) {
      role = "brokerage_admin";
    }
  }

  if (!role) {
    const ROLE_MAP: Partial<Record<string, BrokerageRoleType>> = {
      admin: "brokerage_admin",
      manager: "manager",
    };
    if (user.role && ROLE_MAP[user.role]) {
      role = ROLE_MAP[user.role]!;
    } else if (user.brokerAgent?.brokerageRole) {
      role = user.brokerAgent.brokerageRole as BrokerageRoleType;
    }
  }

  if (!role) return null;

  return {
    userId: user.id,
    orgId: user.orgId,
    agentId: user.brokerAgent?.id ?? user.id,
    role,
    fullName: user.fullName || user.email,
  };
}

// ── Serialization Helpers ───────────────────────────────────

function num(val: unknown): number {
  if (val == null) return 0;
  return Number(val);
}

function serializeSubmission(row: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(row, (_key, value) => {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "bigint") return Number(value);
    return value;
  }));
}

// ── 1. submitDeal ───────────────────────────────────────────

export async function submitDeal(
  input: DealSubmissionInput,
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };

    // Auto-fill from BmsProperty for brokerage exclusive
    let landlordName = input.landlordName;
    let landlordEmail = input.landlordEmail;
    let landlordPhone = input.landlordPhone;
    let landlordAddress = input.landlordAddress;
    let managementCo = input.managementCo;

    if (input.exclusiveType === "brokerage" && input.bmsPropertyId) {
      const prop = await prisma.bmsProperty.findFirst({
        where: { id: input.bmsPropertyId, orgId: ctx.orgId },
      });
      if (prop) {
        landlordName = landlordName || prop.landlordName || undefined;
        landlordEmail = landlordEmail || prop.landlordEmail || undefined;
        landlordPhone = landlordPhone || prop.landlordPhone || undefined;
        landlordAddress = landlordAddress || prop.billingEntityAddress || undefined;
        managementCo = managementCo || prop.managementCo || undefined;
      }
    }

    // Determine split
    let agentSplitPct = input.agentSplitPct;
    let houseSplitPct = input.houseSplitPct;

    if (input.exclusiveType) {
      const agent = await prisma.brokerAgent.findFirst({
        where: { id: ctx.agentId, orgId: ctx.orgId },
        select: { houseExclusiveSplitPct: true, personalExclusiveSplitPct: true },
      });
      const org = await prisma.organization.findUnique({
        where: { id: ctx.orgId },
        select: { defaultHouseExclusiveSplitPct: true, defaultPersonalExclusiveSplitPct: true },
      });

      let resolvedSplit: number | null = null;

      if (input.exclusiveType === "brokerage") {
        resolvedSplit = agent?.houseExclusiveSplitPct != null
          ? num(agent.houseExclusiveSplitPct)
          : org?.defaultHouseExclusiveSplitPct != null
            ? num(org.defaultHouseExclusiveSplitPct)
            : null;
      } else {
        resolvedSplit = agent?.personalExclusiveSplitPct != null
          ? num(agent.personalExclusiveSplitPct)
          : org?.defaultPersonalExclusiveSplitPct != null
            ? num(org.defaultPersonalExclusiveSplitPct)
            : null;
      }

      if (resolvedSplit != null) {
        agentSplitPct = resolvedSplit;
        houseSplitPct = 100 - resolvedSplit;
      }
    }

    const totalCommission = input.totalCommission;
    const agentPayout = totalCommission * (agentSplitPct / 100);
    const housePayout = totalCommission * (houseSplitPct / 100);

    const submission = await prisma.dealSubmission.create({
      data: {
        orgId: ctx.orgId,
        agentId: ctx.agentId,
        agentFirstName: input.agentFirstName,
        agentLastName: input.agentLastName,
        agentEmail: input.agentEmail,
        agentPhone: input.agentPhone || null,
        agentLicense: input.agentLicense || null,
        propertyAddress: input.propertyAddress,
        unit: input.unit || null,
        city: input.city || null,
        state: input.state || "NY",
        dealType: input.dealType,
        transactionValue: input.transactionValue,
        closingDate: input.closingDate ? new Date(input.closingDate) : null,
        commissionType: input.commissionType,
        commissionPct: input.commissionPct ?? null,
        commissionFlat: input.commissionFlat ?? null,
        totalCommission,
        agentSplitPct,
        houseSplitPct,
        agentPayout,
        housePayout,
        clientName: input.clientName || null,
        clientEmail: input.clientEmail || null,
        clientPhone: input.clientPhone || null,
        representedSide: input.representedSide || null,
        coBrokeAgent: input.coBrokeAgent || null,
        coBrokeBrokerage: input.coBrokeBrokerage || null,
        coAgents: input.coAgents ? JSON.parse(JSON.stringify(input.coAgents)) : undefined,
        notes: input.notes || null,
        submissionSource: "internal",
        status: "submitted",
        exclusiveType: input.exclusiveType || null,
        bmsPropertyId: input.bmsPropertyId || null,
        landlordName: landlordName || null,
        landlordEmail: landlordEmail || null,
        landlordPhone: landlordPhone || null,
        landlordAddress: landlordAddress || null,
        managementCo: managementCo || null,
        leaseStartDate: input.leaseStartDate ? new Date(input.leaseStartDate) : null,
        leaseEndDate: input.leaseEndDate ? new Date(input.leaseEndDate) : null,
        monthlyRent: input.monthlyRent ?? null,
        tenantName: input.tenantName || null,
        tenantEmail: input.tenantEmail || null,
        tenantPhone: input.tenantPhone || null,
        requiredDocs: input.requiredDocs ? JSON.parse(JSON.stringify(input.requiredDocs)) : undefined,
      },
    });

    logSubmissionAction(ctx.orgId, { id: ctx.userId, name: ctx.fullName, role: ctx.role }, "submitted", submission.id);

    return { success: true, data: serializeSubmission(submission as unknown as Record<string, unknown>) };
  } catch (error: unknown) {
    console.error("submitDeal error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to submit deal" };
  }
}

// ── 2. getMySubmissions ─────────────────────────────────────

export async function getMySubmissions(): Promise<{ success: boolean; data?: Record<string, unknown>[]; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };

    const submissions = await prisma.dealSubmission.findMany({
      where: { orgId: ctx.orgId, agentId: ctx.agentId },
      include: { bmsProperty: true },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: submissions.map((s) => serializeSubmission(s as unknown as Record<string, unknown>)) };
  } catch (error: unknown) {
    console.error("getMySubmissions error:", error);
    return { success: false, error: "Failed to fetch submissions" };
  }
}

// ── 3. getSubmissionById ────────────────────────────────────

export async function getSubmissionById(
  id: string,
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };

    const submission = await prisma.dealSubmission.findFirst({
      where: { id, orgId: ctx.orgId },
      include: {
        bmsProperty: true,
        agent: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
      },
    });
    if (!submission) return { success: false, error: "Submission not found" };

    // Agents can only see their own submissions
    if (ctx.role === "agent" && submission.agentId !== ctx.agentId) {
      return { success: false, error: "Not authorized" };
    }

    // Fetch file attachments
    const files = await prisma.fileAttachment.findMany({
      where: { orgId: ctx.orgId, entityType: "deal_submission", entityId: id },
      orderBy: { createdAt: "desc" },
    });

    const result = serializeSubmission(submission as unknown as Record<string, unknown>);
    result.files = files.map((f) => serializeSubmission(f as unknown as Record<string, unknown>));

    return { success: true, data: result };
  } catch (error: unknown) {
    console.error("getSubmissionById error:", error);
    return { success: false, error: "Failed to fetch submission" };
  }
}

// ── 4. getAllSubmissions ─────────────────────────────────────

export async function getAllSubmissions(filters?: {
  status?: string;
  agentId?: string;
  exclusiveType?: string;
  dealType?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}): Promise<{ success: boolean; data?: Record<string, unknown>[]; total?: number; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };

    if (!hasPermission(ctx.role, "view_all_submissions")) {
      return { success: false, error: "Not authorized" };
    }

    const page = Math.max(1, filters?.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters?.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { orgId: ctx.orgId };
    if (filters?.status) where.status = filters.status;
    if (filters?.agentId) where.agentId = filters.agentId;
    if (filters?.exclusiveType) where.exclusiveType = filters.exclusiveType;
    if (filters?.dealType) where.dealType = filters.dealType;
    if (filters?.startDate || filters?.endDate) {
      const createdAt: Record<string, Date> = {};
      if (filters.startDate) createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) createdAt.lte = new Date(filters.endDate);
      where.createdAt = createdAt;
    }

    const [submissions, total] = await Promise.all([
      prisma.dealSubmission.findMany({
        where,
        include: {
          agent: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.dealSubmission.count({ where }),
    ]);

    return {
      success: true,
      data: submissions.map((s) => serializeSubmission(s as unknown as Record<string, unknown>)),
      total,
    };
  } catch (error: unknown) {
    console.error("getAllSubmissions error:", error);
    return { success: false, error: "Failed to fetch submissions" };
  }
}

// ── 5. approveSubmission ────────────────────────────────────

export async function approveSubmission(
  id: string,
  overrides?: { exclusiveType?: ExclusiveType; agentSplitPct?: number; notes?: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx.role, "approve_deal")) {
      return { success: false, error: "Not authorized" };
    }

    const submission = await prisma.dealSubmission.findFirst({
      where: { id, orgId: ctx.orgId },
    });
    if (!submission) return { success: false, error: "Submission not found" };
    if (submission.status === "approved" || submission.status === "invoiced" || submission.status === "paid") {
      return { success: false, error: `Submission is already ${submission.status}` };
    }

    const updateData: Record<string, unknown> = {
      status: "approved",
      approvedBy: ctx.userId,
      approvedAt: new Date(),
    };

    const auditDetails: Record<string, unknown> = {
      previousStatus: submission.status,
    };

    if (overrides?.exclusiveType) {
      updateData.managerOverrideExclusiveType = overrides.exclusiveType;
      auditDetails.exclusiveTypeOverride = overrides.exclusiveType;
    }

    if (overrides?.agentSplitPct != null) {
      const newAgentSplit = overrides.agentSplitPct;
      const newHouseSplit = 100 - newAgentSplit;
      const totalComm = num(submission.totalCommission);

      updateData.managerOverrideSplitPct = newAgentSplit;
      updateData.agentSplitPct = newAgentSplit;
      updateData.houseSplitPct = newHouseSplit;
      updateData.agentPayout = totalComm * (newAgentSplit / 100);
      updateData.housePayout = totalComm * (newHouseSplit / 100);

      auditDetails.previousAgentSplitPct = num(submission.agentSplitPct);
      auditDetails.newAgentSplitPct = newAgentSplit;
    }

    if (overrides?.notes) {
      updateData.notes = overrides.notes;
    }

    await prisma.dealSubmission.update({ where: { id }, data: updateData });

    logSubmissionAction(ctx.orgId, { id: ctx.userId, name: ctx.fullName, role: ctx.role }, "approved", id, auditDetails);

    return { success: true };
  } catch (error: unknown) {
    console.error("approveSubmission error:", error);
    return { success: false, error: "Failed to approve submission" };
  }
}

// ── 6. rejectSubmission ─────────────────────────────────────

export async function rejectSubmission(
  id: string,
  reason: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx.role, "reject_deal")) {
      return { success: false, error: "Not authorized" };
    }

    const submission = await prisma.dealSubmission.findFirst({
      where: { id, orgId: ctx.orgId },
    });
    if (!submission) return { success: false, error: "Submission not found" };

    await prisma.dealSubmission.update({
      where: { id },
      data: { status: "rejected", rejectionReason: reason },
    });

    logSubmissionAction(ctx.orgId, { id: ctx.userId, name: ctx.fullName, role: ctx.role }, "rejected", id, { reason });

    return { success: true };
  } catch (error: unknown) {
    console.error("rejectSubmission error:", error);
    return { success: false, error: "Failed to reject submission" };
  }
}

// ── 7. pushToInvoice ────────────────────────────────────────

export async function pushToInvoice(
  submissionId: string,
): Promise<{ success: boolean; invoiceId?: string; transactionId?: string; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx.role, "create_invoice")) {
      return { success: false, error: "Not authorized" };
    }

    const submission = await prisma.dealSubmission.findFirst({
      where: { id: submissionId, orgId: ctx.orgId },
      include: {
        agent: { select: { id: true, firstName: true, lastName: true, email: true, licenseNumber: true } },
        bmsProperty: true,
      },
    });
    if (!submission) return { success: false, error: "Submission not found" };
    if (submission.status !== "approved") {
      return { success: false, error: "Submission must be approved before creating an invoice" };
    }

    // Get org settings for brokerage info
    const org = await prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { name: true, address: true, phone: true, settings: true, bmsSettings: true },
    });
    if (!org) return { success: false, error: "Organization not found" };

    const bmsSettings = (org.bmsSettings as Record<string, unknown>) ?? {};
    const defaultPaymentTerms = (bmsSettings.defaultPaymentTerms as string) || "Net 30";

    // Generate invoice number
    const invoiceNumber = buildInvoiceNumber({
      propertyAddress: submission.propertyAddress,
      unit: submission.unit || undefined,
      moveInDate: submission.leaseStartDate || submission.closingDate || undefined,
      tenantName: submission.tenantName || submission.clientName || undefined,
      createdAt: new Date(),
    });

    // Calculate due date from payment terms
    const daysMatch = defaultPaymentTerms.match(/(\d+)/);
    const netDays = daysMatch ? parseInt(daysMatch[1], 10) : 30;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + netDays);

    const agentName = submission.agent
      ? `${submission.agent.firstName} ${submission.agent.lastName}`
      : `${submission.agentFirstName} ${submission.agentLastName}`;

    // Create invoice + transaction in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          orgId: ctx.orgId,
          invoiceNumber,
          dealSubmissionId: submissionId,
          agentId: submission.agentId || null,
          brokerageName: org.name,
          brokerageAddress: org.address || null,
          brokeragePhone: org.phone || null,
          brokerageEmail: (bmsSettings.companyEmail as string) || null,
          brokerageLicense: (bmsSettings.companyLicenseNumber as string) || null,
          agentName,
          agentEmail: submission.agentEmail || null,
          agentLicense: submission.agent?.licenseNumber || submission.agentLicense || null,
          propertyAddress: submission.propertyAddress,
          dealType: submission.dealType,
          transactionValue: submission.transactionValue,
          closingDate: submission.closingDate || null,
          clientName: submission.tenantName || submission.clientName || null,
          representedSide: submission.representedSide || null,
          totalCommission: submission.totalCommission,
          agentSplitPct: submission.agentSplitPct,
          houseSplitPct: submission.houseSplitPct,
          agentPayout: submission.agentPayout,
          housePayout: submission.housePayout,
          paymentTerms: defaultPaymentTerms,
          dueDate,
          status: "draft",
        },
      });

      const isLeaseDeal = ["lease", "rental", "commercial_lease"].includes(submission.dealType);

      const transaction = await tx.transaction.create({
        data: {
          orgId: ctx.orgId,
          dealSubmissionId: submissionId,
          agentId: submission.agentId || null,
          invoiceId: invoice.id,
          type: isLeaseDeal ? "rental" : "sale",
          stage: "invoice_sent",
          propertyAddress: submission.propertyAddress,
          propertyUnit: submission.unit || null,
          propertyCity: submission.city || null,
          propertyState: submission.state || "NY",
          transactionValue: submission.transactionValue,
          commissionAmount: submission.totalCommission,
          clientName: submission.tenantName || submission.clientName || null,
          clientEmail: submission.tenantEmail || submission.clientEmail || null,
          clientPhone: submission.tenantPhone || submission.clientPhone || null,
          closingDate: submission.closingDate || null,
          leaseStartDate: submission.leaseStartDate || null,
          leaseEndDate: submission.leaseEndDate || null,
          agentSplitPct: submission.agentSplitPct,
          agentPayoutAmount: submission.agentPayout,
          housePayoutAmount: submission.housePayout,
          agentPayoutStatus: "pending",
          invoiceCreatedAt: new Date(),
        },
      });

      await tx.dealSubmission.update({
        where: { id: submissionId },
        data: { status: "invoiced" },
      });

      return { invoice, transaction };
    });

    logSubmissionAction(ctx.orgId, { id: ctx.userId, name: ctx.fullName, role: ctx.role }, "invoiced", submissionId, {
      invoiceId: result.invoice.id,
      invoiceNumber,
      transactionId: result.transaction.id,
    });
    logInvoiceAction(ctx.orgId, { id: ctx.userId, name: ctx.fullName, role: ctx.role }, "created", result.invoice.id, {
      fromSubmission: submissionId,
    });
    logTransactionAction(ctx.orgId, { id: ctx.userId, name: ctx.fullName, role: ctx.role }, "created", result.transaction.id, {
      fromSubmission: submissionId,
    });

    return { success: true, invoiceId: result.invoice.id, transactionId: result.transaction.id };
  } catch (error: unknown) {
    console.error("pushToInvoice error:", error);
    const msg = error instanceof Error ? error.message : "Failed to create invoice";
    return { success: false, error: msg };
  }
}

// ── 8. getExclusiveProperties ───────────────────────────────

export async function getExclusiveProperties(): Promise<{ success: boolean; data?: Record<string, unknown>[]; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };

    const properties = await prisma.bmsProperty.findMany({
      where: { orgId: ctx.orgId, isExclusive: true },
      orderBy: { name: "asc" },
    });

    return {
      success: true,
      data: properties.map((p) => serializeSubmission(p as unknown as Record<string, unknown>)),
    };
  } catch (error: unknown) {
    console.error("getExclusiveProperties error:", error);
    return { success: false, error: "Failed to fetch exclusive properties" };
  }
}

// ── 9. getAgentSplitForDeal ─────────────────────────────────

export async function getAgentSplitForDeal(
  agentId: string,
  exclusiveType: ExclusiveType,
): Promise<{ success: boolean; agentSplitPct?: number; houseSplitPct?: number; source?: string; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };

    const agent = await prisma.brokerAgent.findFirst({
      where: { id: agentId, orgId: ctx.orgId },
      select: { houseExclusiveSplitPct: true, personalExclusiveSplitPct: true },
    });

    // Check agent override
    const agentOverride = exclusiveType === "brokerage"
      ? agent?.houseExclusiveSplitPct
      : agent?.personalExclusiveSplitPct;

    if (agentOverride != null) {
      const pct = num(agentOverride);
      return { success: true, agentSplitPct: pct, houseSplitPct: 100 - pct, source: "agent_override" };
    }

    // Check org default
    const org = await prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { defaultHouseExclusiveSplitPct: true, defaultPersonalExclusiveSplitPct: true },
    });

    const orgDefault = exclusiveType === "brokerage"
      ? org?.defaultHouseExclusiveSplitPct
      : org?.defaultPersonalExclusiveSplitPct;

    if (orgDefault != null) {
      const pct = num(orgDefault);
      return { success: true, agentSplitPct: pct, houseSplitPct: 100 - pct, source: "org_default" };
    }

    // Fallback 70/30
    return { success: true, agentSplitPct: 70, houseSplitPct: 30, source: "fallback" };
  } catch (error: unknown) {
    console.error("getAgentSplitForDeal error:", error);
    return { success: false, error: "Failed to calculate split" };
  }
}

// ── 10. getSubmissionStats ──────────────────────────────────

export async function getSubmissionStats(): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };

    const canViewAll = hasPermission(ctx.role, "view_all_submissions");
    const canViewOwn = hasPermission(ctx.role, "view_own_submissions");
    if (!canViewAll && !canViewOwn) {
      return { success: false, error: "Not authorized" };
    }

    const agentFilter = canViewAll ? {} : { agentId: ctx.agentId };
    const where = { orgId: ctx.orgId, ...agentFilter };

    const submissions = await prisma.dealSubmission.findMany({
      where,
      select: {
        status: true,
        exclusiveType: true,
        totalCommission: true,
        agentPayout: true,
        housePayout: true,
      },
    });

    const byStatus: Record<string, number> = {};
    const byExclusiveType: Record<string, number> = {};
    let totalCommissionPending = 0;
    let totalCommissionPaid = 0;

    for (const s of submissions) {
      byStatus[s.status] = (byStatus[s.status] || 0) + 1;
      if (s.exclusiveType) {
        byExclusiveType[s.exclusiveType] = (byExclusiveType[s.exclusiveType] || 0) + 1;
      }
      if (s.status === "paid") {
        totalCommissionPaid += num(s.totalCommission);
      } else if (s.status !== "rejected") {
        totalCommissionPending += num(s.totalCommission);
      }
    }

    return {
      success: true,
      data: {
        total: submissions.length,
        byStatus,
        byExclusiveType,
        totalCommissionPending,
        totalCommissionPaid,
      },
    };
  } catch (error: unknown) {
    console.error("getSubmissionStats error:", error);
    return { success: false, error: "Failed to fetch stats" };
  }
}

// ── 11. getOrgAgents ────────────────────────────────────────

export async function getOrgAgents(): Promise<{
  success: boolean;
  data?: Array<{ id: string; firstName: string; lastName: string; email: string }>;
  error?: string;
}> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };

    const agents = await prisma.brokerAgent.findMany({
      where: { orgId: ctx.orgId, status: "active" },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });

    return { success: true, data: agents };
  } catch (error: unknown) {
    console.error("getOrgAgents error:", error);
    return { success: false, error: "Failed to fetch agents" };
  }
}
