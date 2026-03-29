"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { BmsDealType } from "@prisma/client";
import type { DealSubmissionInput } from "@/lib/bms-types";
import { logSubmissionAction } from "@/lib/bms-audit";

// ── Auth Helper ───────────────────────────────────────────────

async function getCurrentOrg() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");
  return { userId: user.id, orgId: user.orgId };
}

// ── Deal Submissions ──────────────────────────────────────────

export async function getDealSubmissions(filters?: {
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
        { propertyAddress: { contains: search, mode: "insensitive" } },
        { agentFirstName: { contains: search, mode: "insensitive" } },
        { agentLastName: { contains: search, mode: "insensitive" } },
        { agentEmail: { contains: search, mode: "insensitive" } },
        { clientName: { contains: search, mode: "insensitive" } },
      ];
    }

    const [submissions, total, statusCounts] = await Promise.all([
      prisma.dealSubmission.findMany({
        where,
        include: {
          agent: true,
          invoice: { select: { id: true, invoiceNumber: true, status: true } },
          transaction: { select: { id: true, stage: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.dealSubmission.count({ where }),
      prisma.dealSubmission.groupBy({
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
      submissions,
      total,
      counts,
      page,
      totalPages: Math.ceil(total / limit),
    }));
  } catch (error) {
    console.error("getDealSubmissions error:", error);
    return { submissions: [], total: 0, counts: {}, page: 1, totalPages: 0 };
  }
}

export async function createDealSubmission(input: DealSubmissionInput & { submissionSource?: string }) {
  try {
    const { orgId } = await getCurrentOrg();

    const agent = await prisma.brokerAgent.findFirst({
      where: { orgId, email: { equals: input.agentEmail, mode: "insensitive" } },
    });

    const submission = await prisma.dealSubmission.create({
      data: {
        orgId,
        agentId: agent?.id || null,

        agentFirstName: input.agentFirstName,
        agentLastName: input.agentLastName,
        agentEmail: input.agentEmail,
        agentPhone: input.agentPhone || null,
        agentLicense: input.agentLicense || null,

        propertyAddress: input.propertyAddress,
        unit: input.unit || null,
        city: input.city || null,
        state: input.state || "NY",

        dealType: input.dealType as BmsDealType,
        transactionValue: input.transactionValue,
        closingDate: input.closingDate ? new Date(input.closingDate) : null,

        commissionType: input.commissionType || "percentage",
        commissionPct: input.commissionPct ?? null,
        commissionFlat: input.commissionFlat ?? null,
        totalCommission: input.totalCommission,
        agentSplitPct: input.agentSplitPct,
        houseSplitPct: input.houseSplitPct,
        agentPayout: input.agentPayout,
        housePayout: input.housePayout,

        clientName: input.clientName || null,
        clientEmail: input.clientEmail || null,
        clientPhone: input.clientPhone || null,
        representedSide: input.representedSide || null,

        coBrokeAgent: input.coBrokeAgent || null,
        coBrokeBrokerage: input.coBrokeBrokerage || null,
        coAgents: input.coAgents && input.coAgents.length > 0 ? JSON.parse(JSON.stringify(input.coAgents)) : undefined,

        notes: input.notes || null,

        status: "submitted",
        submissionSource: input.submissionSource || "internal",
      },
    });

    return JSON.parse(JSON.stringify({ success: true, submission }));
  } catch (error) {
    console.error("createDealSubmission error:", error);
    return { success: false, error: "Failed to create submission" };
  }
}

export async function createPublicDealSubmission(
  orgToken: string,
  input: DealSubmissionInput,
) {
  try {
    const org = await prisma.organization.findUnique({
      where: { submissionToken: orgToken },
    });
    if (!org) {
      return { success: false, error: "Invalid submission link" };
    }

    const agent = await prisma.brokerAgent.findFirst({
      where: { orgId: org.id, email: { equals: input.agentEmail, mode: "insensitive" } },
    });

    const submission = await prisma.dealSubmission.create({
      data: {
        orgId: org.id,
        agentId: agent?.id || null,

        agentFirstName: input.agentFirstName,
        agentLastName: input.agentLastName,
        agentEmail: input.agentEmail,
        agentPhone: input.agentPhone || null,
        agentLicense: input.agentLicense || null,

        propertyAddress: input.propertyAddress,
        unit: input.unit || null,
        city: input.city || null,
        state: input.state || "NY",

        dealType: input.dealType as BmsDealType,
        transactionValue: input.transactionValue,
        closingDate: input.closingDate ? new Date(input.closingDate) : null,

        commissionType: input.commissionType || "percentage",
        commissionPct: input.commissionPct ?? null,
        commissionFlat: input.commissionFlat ?? null,
        totalCommission: input.totalCommission,
        agentSplitPct: input.agentSplitPct,
        houseSplitPct: input.houseSplitPct,
        agentPayout: input.agentPayout,
        housePayout: input.housePayout,

        clientName: input.clientName || null,
        clientEmail: input.clientEmail || null,
        clientPhone: input.clientPhone || null,
        representedSide: input.representedSide || null,

        coBrokeAgent: input.coBrokeAgent || null,
        coBrokeBrokerage: input.coBrokeBrokerage || null,
        coAgents: input.coAgents && input.coAgents.length > 0 ? JSON.parse(JSON.stringify(input.coAgents)) : undefined,

        notes: input.notes || null,

        status: "submitted",
        submissionSource: "external",
      },
    });

    return { success: true, submissionId: submission.id };
  } catch (error) {
    console.error("createPublicDealSubmission error:", error);
    return { success: false, error: "Failed to create submission" };
  }
}

export async function updateSubmissionStatus(
  submissionId: string,
  status: string,
  rejectionReason?: string,
) {
  try {
    const { userId, orgId } = await getCurrentOrg();

    const prev = await prisma.dealSubmission.findFirst({
      where: { id: submissionId, orgId },
      select: { status: true, propertyAddress: true },
    });

    const submission = await prisma.dealSubmission.update({
      where: { id: submissionId, orgId },
      data: {
        status,
        rejectionReason: status === "rejected" ? (rejectionReason || null) : null,
      },
    });

    logSubmissionAction(orgId, { id: userId }, status, submissionId, {
      propertyAddress: prev?.propertyAddress,
      previousStatus: prev?.status,
      ...(rejectionReason ? { rejectionReason } : {}),
    });

    return JSON.parse(JSON.stringify({ success: true, submission }));
  } catch (error) {
    console.error("updateSubmissionStatus error:", error);
    return { success: false, error: "Failed to update status" };
  }
}

export async function deleteSubmission(submissionId: string) {
  try {
    const { userId, orgId } = await getCurrentOrg();

    const prev = await prisma.dealSubmission.findFirst({
      where: { id: submissionId, orgId },
      select: { propertyAddress: true, status: true },
    });

    await prisma.dealSubmission.delete({
      where: { id: submissionId, orgId },
    });

    logSubmissionAction(orgId, { id: userId }, "deleted", submissionId, {
      propertyAddress: prev?.propertyAddress,
    });

    return { success: true };
  } catch (error) {
    console.error("deleteSubmission error:", error);
    return { success: false, error: "Failed to delete submission" };
  }
}

export async function getSubmissionById(submissionId: string) {
  try {
    const { orgId } = await getCurrentOrg();

    const submission = await prisma.dealSubmission.findFirst({
      where: { id: submissionId, orgId },
      include: {
        agent: true,
        invoice: true,
      },
    });

    if (!submission) return null;
    return JSON.parse(JSON.stringify(submission));
  } catch (error) {
    console.error("getSubmissionById error:", error);
    return null;
  }
}

// ── Public Submission Link ────────────────────────────────────

export async function getPublicSubmissionLink() {
  try {
    const { orgId } = await getCurrentOrg();

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { submissionToken: true },
    });

    if (org?.submissionToken) {
      return { token: org.submissionToken };
    }

    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    await prisma.organization.update({
      where: { id: orgId },
      data: { submissionToken: token },
    });

    return { token };
  } catch (error) {
    console.error("getPublicSubmissionLink error:", error);
    return { token: null };
  }
}

export async function regenerateSubmissionToken() {
  try {
    const { orgId } = await getCurrentOrg();

    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    await prisma.organization.update({
      where: { id: orgId },
      data: { submissionToken: token },
    });

    return { success: true, token };
  } catch (error) {
    console.error("regenerateSubmissionToken error:", error);
    return { success: false, token: null };
  }
}

// ── Bulk Operations ───────────────────────────────────────────

export async function bulkUpdateStatus(submissionIds: string[], status: string) {
  try {
    const { userId, orgId } = await getCurrentOrg();

    const result = await prisma.dealSubmission.updateMany({
      where: { id: { in: submissionIds }, orgId },
      data: { status },
    });

    for (const id of submissionIds) {
      logSubmissionAction(orgId, { id: userId }, `bulk_${status}`, id);
    }

    return { success: true, count: result.count };
  } catch (error) {
    console.error("bulkUpdateStatus error:", error);
    return { success: false, count: 0 };
  }
}

// ── Agent Deal Submission (new flow) ─────────────────────────

export async function submitDeal(input: DealSubmissionInput & { submissionSource?: string }) {
  try {
    const { userId, orgId } = await getCurrentOrg();

    // Find the agent by userId
    const agent = await prisma.brokerAgent.findFirst({
      where: { orgId, userId },
    });

    // If brokerage exclusive, auto-fill from BmsProperty
    let landlordData: Record<string, unknown> = {};
    if (input.exclusiveType === "brokerage" && input.bmsPropertyId) {
      const prop = await prisma.bmsProperty.findFirst({
        where: { id: input.bmsPropertyId, orgId },
      });
      if (prop) {
        landlordData = {
          landlordName: prop.landlordName || null,
          landlordEmail: prop.landlordEmail || null,
          landlordPhone: prop.landlordPhone || null,
          managementCo: prop.managementCo || null,
          landlordAddress: prop.billingEntityAddress || null,
        };
      }
    }

    const submission = await prisma.dealSubmission.create({
      data: {
        orgId,
        agentId: agent?.id || null,

        agentFirstName: input.agentFirstName,
        agentLastName: input.agentLastName,
        agentEmail: input.agentEmail,
        agentPhone: input.agentPhone || null,
        agentLicense: input.agentLicense || null,

        exclusiveType: input.exclusiveType || null,
        bmsPropertyId: input.bmsPropertyId || null,

        propertyAddress: input.propertyAddress,
        unit: input.unit || null,
        city: input.city || null,
        state: input.state || "NY",

        // Landlord info (auto-filled or manual)
        landlordName: (landlordData.landlordName as string) || input.landlordName || null,
        landlordEmail: (landlordData.landlordEmail as string) || input.landlordEmail || null,
        landlordPhone: (landlordData.landlordPhone as string) || input.landlordPhone || null,
        landlordAddress: (landlordData.landlordAddress as string) || input.landlordAddress || null,
        managementCo: (landlordData.managementCo as string) || input.managementCo || null,

        dealType: input.dealType as BmsDealType,
        transactionValue: input.transactionValue,
        closingDate: input.closingDate ? new Date(input.closingDate) : null,

        // Lease-specific
        leaseStartDate: input.leaseStartDate ? new Date(input.leaseStartDate) : null,
        leaseEndDate: input.leaseEndDate ? new Date(input.leaseEndDate) : null,
        monthlyRent: input.monthlyRent ?? null,

        // Tenant info
        tenantName: input.tenantName || null,
        tenantEmail: input.tenantEmail || null,
        tenantPhone: input.tenantPhone || null,

        commissionType: input.commissionType || "percentage",
        commissionPct: input.commissionPct ?? null,
        commissionFlat: input.commissionFlat ?? null,
        totalCommission: input.totalCommission,
        agentSplitPct: input.agentSplitPct,
        houseSplitPct: input.houseSplitPct,
        agentPayout: input.agentPayout,
        housePayout: input.housePayout,

        clientName: input.clientName || null,
        clientEmail: input.clientEmail || null,
        clientPhone: input.clientPhone || null,
        representedSide: input.representedSide || null,

        coBrokeAgent: input.coBrokeAgent || null,
        coBrokeBrokerage: input.coBrokeBrokerage || null,
        coAgents: input.coAgents && input.coAgents.length > 0 ? JSON.parse(JSON.stringify(input.coAgents)) : undefined,

        requiredDocs: input.requiredDocs ? JSON.parse(JSON.stringify(input.requiredDocs)) : undefined,
        notes: input.notes || null,

        status: "submitted",
        submissionSource: input.submissionSource || "internal",
      },
    });

    return JSON.parse(JSON.stringify({ success: true, submission }));
  } catch (error) {
    console.error("submitDeal error:", error);
    return { success: false, error: "Failed to submit deal" };
  }
}

// ── Exclusive Properties ─────────────────────────────────────

export async function getExclusiveProperties() {
  try {
    const { orgId } = await getCurrentOrg();

    const properties = await prisma.bmsProperty.findMany({
      where: { orgId, isExclusive: true },
      select: {
        id: true,
        name: true,
        address: true,
        landlordName: true,
        landlordEmail: true,
        landlordPhone: true,
        billingEntityAddress: true,
        billingEntityName: true,
        billingEntityEmail: true,
        billingEntityPhone: true,
        managementCo: true,
      },
      orderBy: { name: "asc" },
    });

    return { data: JSON.parse(JSON.stringify(properties)) };
  } catch (error) {
    console.error("getExclusiveProperties error:", error);
    return { data: [] };
  }
}

// ── Agent Split Resolution ───────────────────────────────────

export async function getAgentSplitForDeal(agentId: string, exclusiveType: "brokerage" | "personal") {
  try {
    const { orgId } = await getCurrentOrg();

    const [agent, org] = await Promise.all([
      prisma.brokerAgent.findFirst({
        where: { id: agentId, orgId },
        select: { houseExclusiveSplitPct: true, personalExclusiveSplitPct: true },
      }),
      prisma.organization.findUnique({
        where: { id: orgId },
        select: { defaultHouseExclusiveSplitPct: true, defaultPersonalExclusiveSplitPct: true },
      }),
    ]);

    let agentSplitPct: number;
    if (exclusiveType === "brokerage") {
      agentSplitPct = agent?.houseExclusiveSplitPct
        ? Number(agent.houseExclusiveSplitPct)
        : org?.defaultHouseExclusiveSplitPct
          ? Number(org.defaultHouseExclusiveSplitPct)
          : 50;
    } else {
      agentSplitPct = agent?.personalExclusiveSplitPct
        ? Number(agent.personalExclusiveSplitPct)
        : org?.defaultPersonalExclusiveSplitPct
          ? Number(org.defaultPersonalExclusiveSplitPct)
          : 70;
    }

    return { agentSplitPct, houseSplitPct: 100 - agentSplitPct };
  } catch (error) {
    console.error("getAgentSplitForDeal error:", error);
    return { agentSplitPct: 70, houseSplitPct: 30 };
  }
}

// ── Submission Stats ─────────────────────────────────────────

export async function getSubmissionStats() {
  try {
    const { orgId } = await getCurrentOrg();

    const counts = await prisma.dealSubmission.groupBy({
      by: ["status"],
      where: { orgId },
      _count: { status: true },
      _sum: { totalCommission: true, agentPayout: true, housePayout: true },
    });

    const stats: Record<string, { count: number; totalCommission: number; agentPayout: number; housePayout: number }> = {};
    for (const row of counts) {
      stats[row.status] = {
        count: row._count.status,
        totalCommission: Number(row._sum.totalCommission || 0),
        agentPayout: Number(row._sum.agentPayout || 0),
        housePayout: Number(row._sum.housePayout || 0),
      };
    }

    return stats;
  } catch (error) {
    console.error("getSubmissionStats error:", error);
    return {};
  }
}

// ── Org Agents List ──────────────────────────────────────────

export async function getOrgAgents() {
  try {
    const { orgId } = await getCurrentOrg();

    const agents = await prisma.brokerAgent.findMany({
      where: { orgId, status: "active" },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { firstName: "asc" },
    });

    return JSON.parse(JSON.stringify(agents));
  } catch (error) {
    console.error("getOrgAgents error:", error);
    return [];
  }
}

// ── Approve / Reject ─────────────────────────────────────────

export async function approveSubmission(
  submissionId: string,
  overrides?: { exclusiveType?: string; splitPct?: number },
) {
  try {
    const { userId, orgId } = await getCurrentOrg();

    const data: Record<string, unknown> = {
      status: "approved",
      approvedBy: userId,
      approvedAt: new Date(),
    };

    if (overrides?.exclusiveType) {
      data.managerOverrideExclusiveType = overrides.exclusiveType;
    }

    if (overrides?.splitPct !== undefined) {
      data.managerOverrideSplitPct = overrides.splitPct;
      data.agentSplitPct = overrides.splitPct;
      data.houseSplitPct = 100 - overrides.splitPct;

      // Recalculate payouts
      const sub = await prisma.dealSubmission.findFirst({
        where: { id: submissionId, orgId },
        select: { totalCommission: true },
      });
      if (sub) {
        const tc = Number(sub.totalCommission);
        data.agentPayout = (tc * overrides.splitPct) / 100;
        data.housePayout = tc - ((tc * overrides.splitPct) / 100);
      }
    }

    const submission = await prisma.dealSubmission.update({
      where: { id: submissionId, orgId },
      data,
    });

    logSubmissionAction(orgId, { id: userId }, "approved", submissionId);

    return JSON.parse(JSON.stringify({ success: true, submission }));
  } catch (error) {
    console.error("approveSubmission error:", error);
    return { success: false, error: "Failed to approve submission" };
  }
}

export async function rejectSubmission(submissionId: string, reason?: string) {
  try {
    const { userId, orgId } = await getCurrentOrg();

    const submission = await prisma.dealSubmission.update({
      where: { id: submissionId, orgId },
      data: {
        status: "rejected",
        rejectionReason: reason || null,
      },
    });

    logSubmissionAction(orgId, { id: userId }, "rejected", submissionId, { reason });

    return JSON.parse(JSON.stringify({ success: true, submission }));
  } catch (error) {
    console.error("rejectSubmission error:", error);
    return { success: false, error: "Failed to reject submission" };
  }
}
