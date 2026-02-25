"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { BmsDealType, InvoiceStatus } from "@prisma/client";
import type { ExcelDealRow } from "@/lib/bms-types";
import { EXCEL_COLUMN_ALIASES } from "@/lib/bms-types";
import type { InvoiceInput, BrokerageConfig } from "@/lib/bms-types";

// ── Auth Helper ───────────────────────────────────────────────

async function getCurrentOrg() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");
  return { userId: user.id, orgId: user.orgId };
}

// ── Private Helpers ───────────────────────────────────────────

async function generateInvoiceNumber(orgId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;

  const lastInvoice = await prisma.invoice.findFirst({
    where: { orgId, invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });

  let nextNum = 1;
  if (lastInvoice) {
    const lastNum = parseInt(lastInvoice.invoiceNumber.replace(prefix, ""), 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }

  return `${prefix}${String(nextNum).padStart(4, "0")}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function parsePaymentTermsDays(terms: string): number {
  const match = terms.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 30;
}

// ── Brokerage Config ──────────────────────────────────────────

export async function getBrokerageConfig(): Promise<BrokerageConfig> {
  try {
    const { orgId } = await getCurrentOrg();

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        name: true,
        address: true,
        phone: true,
        logoUrl: true,
        website: true,
        brandSettings: { select: { companyName: true, logoUrl: true } },
      },
    });

    if (!org) return { name: "" };

    return {
      name: org.brandSettings?.companyName || org.name,
      address: org.address || undefined,
      phone: org.phone || undefined,
      email: "",
      licenseInfo: "",
      logoUrl: org.brandSettings?.logoUrl || org.logoUrl || undefined,
    };
  } catch (error) {
    console.error("getBrokerageConfig error:", error);
    return { name: "" };
  }
}

// ── Invoice List ──────────────────────────────────────────────

export async function getInvoices(filters?: {
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
        { invoiceNumber: { contains: search, mode: "insensitive" } },
        { agentName: { contains: search, mode: "insensitive" } },
        { propertyAddress: { contains: search, mode: "insensitive" } },
      ];
    }

    const [invoices, total, statusCounts] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          agent: { select: { id: true, firstName: true, lastName: true, email: true } },
          dealSubmission: { select: { id: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.invoice.count({ where }),
      prisma.invoice.groupBy({
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
      invoices,
      total,
      counts,
      page,
      totalPages: Math.ceil(total / limit),
    }));
  } catch (error) {
    console.error("getInvoices error:", error);
    return { invoices: [], total: 0, counts: {}, page: 1, totalPages: 0 };
  }
}

// ── Create Invoice ────────────────────────────────────────────

export async function createInvoice(input: InvoiceInput) {
  try {
    const { orgId } = await getCurrentOrg();

    const invoiceNumber = await generateInvoiceNumber(orgId);

    const termsDays = parsePaymentTermsDays(input.paymentTerms || "Net 30");
    const issueDate = new Date();
    const dueDate = input.dueDate ? new Date(input.dueDate) : addDays(issueDate, termsDays);

    // Snapshot brokerage info
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        name: true,
        address: true,
        phone: true,
        brandSettings: { select: { companyName: true, logoUrl: true } },
      },
    });

    const brokerageName = input.brokerageName || org?.brandSettings?.companyName || org?.name || "";
    const brokerageAddress = input.brokerageAddress || org?.address || null;
    const brokeragePhone = input.brokeragePhone || org?.phone || null;

    const invoice = await prisma.invoice.create({
      data: {
        orgId,
        invoiceNumber,
        dealSubmissionId: input.dealSubmissionId || null,
        agentId: input.agentId || null,

        brokerageName,
        brokerageAddress,
        brokeragePhone,
        brokerageEmail: input.brokerageEmail || null,
        brokerageLicense: input.brokerageLicense || null,

        agentName: input.agentName,
        agentEmail: input.agentEmail || null,
        agentLicense: input.agentLicense || null,

        propertyAddress: input.propertyAddress,
        dealType: input.dealType as BmsDealType,
        transactionValue: input.transactionValue,
        closingDate: input.closingDate ? new Date(input.closingDate) : null,
        clientName: input.clientName || null,
        representedSide: input.representedSide || null,

        totalCommission: input.totalCommission,
        agentSplitPct: input.agentSplitPct,
        houseSplitPct: input.houseSplitPct,
        agentPayout: input.agentPayout,
        housePayout: input.housePayout,

        paymentTerms: input.paymentTerms || "Net 30",
        issueDate,
        dueDate,
        status: "draft",
      },
    });

    // Update linked submission to 'invoiced'
    if (input.dealSubmissionId) {
      await prisma.dealSubmission.update({
        where: { id: input.dealSubmissionId, orgId },
        data: { status: "invoiced" },
      }).catch(() => {}); // Non-critical
    }

    return JSON.parse(JSON.stringify({ success: true, invoice }));
  } catch (error) {
    console.error("createInvoice error:", error);
    return { success: false, error: "Failed to create invoice" };
  }
}

// ── Create From Submission ────────────────────────────────────

export async function createInvoiceFromSubmission(submissionId: string) {
  try {
    const { orgId } = await getCurrentOrg();

    const submission = await prisma.dealSubmission.findFirst({
      where: { id: submissionId, orgId },
      include: { agent: true },
    });

    if (!submission) {
      return { success: false, error: "Submission not found" };
    }
    if (submission.status === "invoiced" || submission.status === "paid") {
      return { success: false, error: "Submission already invoiced" };
    }
    if (submission.status !== "approved") {
      return { success: false, error: "Submission must be approved before invoicing" };
    }

    return createInvoice({
      dealSubmissionId: submission.id,
      agentId: submission.agentId || undefined,

      brokerageName: "",
      agentName: `${submission.agentFirstName} ${submission.agentLastName}`,
      agentEmail: submission.agentEmail,
      agentLicense: submission.agentLicense || undefined,

      propertyAddress: submission.propertyAddress,
      dealType: submission.dealType as unknown as "sale" | "lease" | "rental",
      transactionValue: Number(submission.transactionValue),
      closingDate: submission.closingDate?.toISOString() || undefined,
      clientName: submission.clientName || undefined,
      representedSide: (submission.representedSide as "buyer" | "seller" | "landlord" | "tenant") || undefined,

      totalCommission: Number(submission.totalCommission),
      agentSplitPct: Number(submission.agentSplitPct),
      houseSplitPct: Number(submission.houseSplitPct),
      agentPayout: Number(submission.agentPayout),
      housePayout: Number(submission.housePayout),

      paymentTerms: "Net 30",
      dueDate: "",
    });
  } catch (error) {
    console.error("createInvoiceFromSubmission error:", error);
    return { success: false, error: "Failed to create invoice from submission" };
  }
}

// ── Update Invoice Status ─────────────────────────────────────

export async function updateInvoiceStatus(
  invoiceId: string,
  status: string,
  paidDate?: string,
) {
  try {
    const { orgId } = await getCurrentOrg();

    const data: Record<string, unknown> = {
      status: status as InvoiceStatus,
    };

    if (status === "paid") {
      data.paidDate = paidDate ? new Date(paidDate) : new Date();
    }

    const invoice = await prisma.invoice.update({
      where: { id: invoiceId, orgId },
      data,
    });

    // Also update linked submission
    if (status === "paid" && invoice.dealSubmissionId) {
      await prisma.dealSubmission.update({
        where: { id: invoice.dealSubmissionId, orgId },
        data: { status: "paid" },
      }).catch(() => {});
    }

    return JSON.parse(JSON.stringify({ success: true, invoice }));
  } catch (error) {
    console.error("updateInvoiceStatus error:", error);
    return { success: false, error: "Failed to update invoice status" };
  }
}

// ── Delete Invoice ────────────────────────────────────────────

export async function deleteInvoice(invoiceId: string) {
  try {
    const { orgId } = await getCurrentOrg();

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, orgId },
      select: { dealSubmissionId: true },
    });

    if (!invoice) {
      return { success: false, error: "Invoice not found" };
    }

    // Revert linked submission to 'approved'
    if (invoice.dealSubmissionId) {
      await prisma.dealSubmission.update({
        where: { id: invoice.dealSubmissionId, orgId },
        data: { status: "approved" },
      }).catch(() => {});
    }

    await prisma.invoice.delete({
      where: { id: invoiceId, orgId },
    });

    return { success: true };
  } catch (error) {
    console.error("deleteInvoice error:", error);
    return { success: false, error: "Failed to delete invoice" };
  }
}

// ── Get Invoice By ID ─────────────────────────────────────────

export async function getInvoiceById(invoiceId: string) {
  try {
    const { orgId } = await getCurrentOrg();

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, orgId },
      include: {
        agent: true,
        dealSubmission: true,
      },
    });

    if (!invoice) return null;
    return JSON.parse(JSON.stringify(invoice));
  } catch (error) {
    console.error("getInvoiceById error:", error);
    return null;
  }
}

// ── Bulk Create From Excel ────────────────────────────────────

export async function createBulkInvoices(
  rows: ExcelDealRow[],
  defaultAgentSplitPct?: number,
) {
  try {
    const results: Array<{ success: boolean; invoiceNumber?: string; error?: string; row: number }> = [];
    let created = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row._errors && row._errors.length > 0) {
        failed++;
        results.push({ success: false, error: row._errors.join("; "), row: i });
        continue;
      }

      const splitPct = row.agentSplitPct ?? defaultAgentSplitPct ?? 70;
      const houseSplitPct = 100 - splitPct;
      const totalCommission = row._totalCommission ?? row.commissionAmount ?? (row.transactionValue * (row.commissionPct ?? 0) / 100);
      const agentPayout = row._agentPayout ?? totalCommission * splitPct / 100;
      const housePayout = row._housePayout ?? totalCommission * houseSplitPct / 100;

      const result = await createInvoice({
        agentName: row.agentName,
        brokerageName: "",
        propertyAddress: row.propertyAddress,
        dealType: (row.dealType?.toLowerCase() as "sale" | "lease" | "rental") || "sale",
        transactionValue: row.transactionValue,
        closingDate: row.closingDate || undefined,
        clientName: row.clientName || undefined,

        totalCommission,
        agentSplitPct: splitPct,
        houseSplitPct,
        agentPayout,
        housePayout,

        paymentTerms: "Net 30",
        dueDate: "",
      });

      if (result.success) {
        created++;
        results.push({ success: true, invoiceNumber: result.invoice?.invoiceNumber, row: i });
      } else {
        failed++;
        results.push({ success: false, error: result.error, row: i });
      }
    }

    return { success: failed === 0, total: rows.length, created, failed, results };
  } catch (error) {
    console.error("createBulkInvoices error:", error);
    return { success: false, total: rows.length, created: 0, failed: rows.length, results: [] };
  }
}

// ── Validate Excel Data ───────────────────────────────────────

export async function validateExcelData(rawRows: Record<string, unknown>[]) {
  try {
    // Build reverse alias map: normalized header → standard field
    const aliasMap = new Map<string, string>();
    for (const [field, aliases] of Object.entries(EXCEL_COLUMN_ALIASES)) {
      aliasMap.set(field.toLowerCase(), field);
      for (const alias of aliases) {
        aliasMap.set(alias.toLowerCase(), field);
      }
    }

    const rows: ExcelDealRow[] = [];
    let validCount = 0;
    let errorCount = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i];
      const mapped: Record<string, unknown> = {};

      // Map raw column headers to standard fields
      for (const [header, value] of Object.entries(raw)) {
        const normalizedHeader = header.toLowerCase().trim();
        const standardField = aliasMap.get(normalizedHeader);
        if (standardField) {
          mapped[standardField] = value;
        }
      }

      const errors: string[] = [];

      // Parse and clean values
      const agentName = String(mapped.agentName || "").trim();
      const propertyAddress = String(mapped.propertyAddress || "").trim();
      const dealType = String(mapped.dealType || "sale").trim().toLowerCase();

      const transactionValue = parseNumeric(mapped.transactionValue);
      const commissionPct = mapped.commissionPct != null ? parseNumeric(mapped.commissionPct) : undefined;
      const commissionAmount = mapped.commissionAmount != null ? parseNumeric(mapped.commissionAmount) : undefined;
      const agentSplitPct = mapped.agentSplitPct != null ? parseNumeric(mapped.agentSplitPct) : undefined;

      // Validate required fields
      if (!agentName) errors.push("Agent name is required");
      if (!propertyAddress) errors.push("Property address is required");
      if (!transactionValue || transactionValue <= 0) errors.push("Transaction value must be greater than 0");
      if (commissionPct == null && commissionAmount == null) errors.push("Commission % or commission amount is required");

      // Calculate computed fields
      let totalCommission = 0;
      if (commissionAmount != null && commissionAmount > 0) {
        totalCommission = commissionAmount;
      } else if (commissionPct != null && transactionValue > 0) {
        totalCommission = transactionValue * commissionPct / 100;
      }

      const split = agentSplitPct ?? 70;
      const agentPayout = totalCommission * split / 100;
      const housePayout = totalCommission - agentPayout;

      const row: ExcelDealRow = {
        agentName,
        propertyAddress,
        dealType,
        transactionValue: transactionValue || 0,
        commissionPct: commissionPct ?? undefined,
        commissionAmount: commissionAmount ?? undefined,
        agentSplitPct: agentSplitPct ?? undefined,
        clientName: mapped.clientName ? String(mapped.clientName).trim() : undefined,
        closingDate: mapped.closingDate ? String(mapped.closingDate).trim() : undefined,
        notes: mapped.notes ? String(mapped.notes).trim() : undefined,
        _totalCommission: totalCommission,
        _agentPayout: agentPayout,
        _housePayout: housePayout,
        _errors: errors.length > 0 ? errors : undefined,
        _rowIndex: i,
      };

      if (errors.length > 0) {
        errorCount++;
      } else {
        validCount++;
      }

      rows.push(row);
    }

    return { rows, validCount, errorCount };
  } catch (error) {
    console.error("validateExcelData error:", error);
    return { rows: [], validCount: 0, errorCount: rawRows.length };
  }
}

// Strip $, commas, % from currency/percentage strings
function parseNumeric(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,%\s]/g, "").trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

// ── Bulk Mark Paid ────────────────────────────────────────────

export async function bulkMarkPaid(invoiceIds: string[]) {
  try {
    const { orgId } = await getCurrentOrg();
    const now = new Date();

    const result = await prisma.invoice.updateMany({
      where: { id: { in: invoiceIds }, orgId },
      data: { status: "paid", paidDate: now },
    });

    // Also update linked submissions
    const invoicesWithSubmissions = await prisma.invoice.findMany({
      where: { id: { in: invoiceIds }, orgId, dealSubmissionId: { not: null } },
      select: { dealSubmissionId: true },
    });

    const submissionIds = invoicesWithSubmissions
      .map(inv => inv.dealSubmissionId)
      .filter((id): id is string => id !== null);

    if (submissionIds.length > 0) {
      await prisma.dealSubmission.updateMany({
        where: { id: { in: submissionIds }, orgId },
        data: { status: "paid" },
      });
    }

    return { success: true, count: result.count };
  } catch (error) {
    console.error("bulkMarkPaid error:", error);
    return { success: false, count: 0 };
  }
}
