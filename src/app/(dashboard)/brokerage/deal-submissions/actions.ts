"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { BmsDealType } from "@prisma/client";
import type { DealSubmissionInput } from "@/lib/bms-types";

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
    const { orgId } = await getCurrentOrg();

    const submission = await prisma.dealSubmission.update({
      where: { id: submissionId, orgId },
      data: {
        status,
        rejectionReason: status === "rejected" ? (rejectionReason || null) : null,
      },
    });

    return JSON.parse(JSON.stringify({ success: true, submission }));
  } catch (error) {
    console.error("updateSubmissionStatus error:", error);
    return { success: false, error: "Failed to update status" };
  }
}

export async function deleteSubmission(submissionId: string) {
  try {
    const { orgId } = await getCurrentOrg();

    await prisma.dealSubmission.delete({
      where: { id: submissionId, orgId },
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
    const { orgId } = await getCurrentOrg();

    const result = await prisma.dealSubmission.updateMany({
      where: { id: { in: submissionIds }, orgId },
      data: { status },
    });

    return { success: true, count: result.count };
  } catch (error) {
    console.error("bulkUpdateStatus error:", error);
    return { success: false, count: 0 };
  }
}
