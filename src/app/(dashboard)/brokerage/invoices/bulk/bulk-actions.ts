"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { BillToMappings, FromInfo, InvoiceSettings, PaymentInstructions, TransactionRecord, InvoiceNumberInput } from "@/lib/bms-types";
import { buildInvoiceNumber } from "@/lib/bms-types";
import { logTransactionAction } from "@/lib/bms-audit";
import { ensureDefaultTemplates } from "@/app/(dashboard)/brokerage/transactions/actions";

// ── Auth Helper ───────────────────────────────────────────────

async function getCurrentOrg() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");
  return { userId: user.id, orgId: user.orgId };
}

// ── Get Bill To Mappings ──────────────────────────────────────

export async function getBillToMappings(): Promise<BillToMappings> {
  try {
    const { orgId } = await getCurrentOrg();

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { bmsSettings: true },
    });

    if (!org?.bmsSettings || typeof org.bmsSettings !== "object") return {};

    const settings = org.bmsSettings as Record<string, unknown>;
    const mappings = settings.billToMappings;
    if (!mappings || typeof mappings !== "object") return {};

    return mappings as BillToMappings;
  } catch (error) {
    console.error("getBillToMappings error:", error);
    return {};
  }
}

// ── Save Bill To Mappings ─────────────────────────────────────

export async function saveBillToMappings(
  mappings: BillToMappings,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { orgId } = await getCurrentOrg();

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { bmsSettings: true },
    });

    const current = (org?.bmsSettings && typeof org.bmsSettings === "object")
      ? org.bmsSettings as Record<string, unknown>
      : {};

    const merged = { ...current, billToMappings: mappings } as Record<string, unknown>;

    await prisma.organization.update({
      where: { id: orgId },
      data: { bmsSettings: merged as any },  // eslint-disable-line @typescript-eslint/no-explicit-any
    });

    return { success: true };
  } catch (error) {
    console.error("saveBillToMappings error:", error);
    return { success: false, error: "Failed to save Bill To mappings" };
  }
}

// ── Invoice Number Generation ─────────────────────────────────

/**
 * Ensure generated invoice number is unique within the org.
 * If a duplicate exists, append "2", "3", etc.
 */
async function ensureUniqueInvoiceNumber(orgId: string, baseNumber: string): Promise<string> {
  // Check if base number already exists
  const existing = await prisma.invoice.findFirst({
    where: { orgId, invoiceNumber: baseNumber },
    select: { id: true },
  });
  if (!existing) return baseNumber;

  // Append sequential suffix
  for (let i = 2; i <= 99; i++) {
    const candidate = `${baseNumber}${i}`;
    const dup = await prisma.invoice.findFirst({
      where: { orgId, invoiceNumber: candidate },
      select: { id: true },
    });
    if (!dup) return candidate;
  }

  // Extremely unlikely fallback
  return `${baseNumber}${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Server action: generate a unique invoice number for the current org.
 * Called from the client to get a descriptive invoice number.
 */
export async function getNextInvoiceNumber(input?: InvoiceNumberInput): Promise<string> {
  try {
    const { orgId } = await getCurrentOrg();
    const baseNumber = buildInvoiceNumber(input ?? {});
    return ensureUniqueInvoiceNumber(orgId, baseNumber);
  } catch (error) {
    console.error("getNextInvoiceNumber error:", error);
    // Fallback: date-only number
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const yy = String(now.getFullYear()).slice(-2);
    return `${mm}${dd}${yy}`;
  }
}

// ── Get From Info ─────────────────────────────────────────────

export async function getFromInfo(): Promise<FromInfo> {
  try {
    const { orgId } = await getCurrentOrg();

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        name: true,
        address: true,
        phone: true,
        bmsSettings: true,
        brandSettings: { select: { companyName: true } },
      },
    });

    if (!org) return { name: "" };

    const bms = (org.bmsSettings && typeof org.bmsSettings === "object")
      ? org.bmsSettings as Record<string, unknown>
      : {};

    return {
      name: org.brandSettings?.companyName || org.name,
      address: org.address || undefined,
      phone: org.phone || undefined,
      email: typeof bms.companyEmail === "string" ? bms.companyEmail : undefined,
    };
  } catch (error) {
    console.error("getFromInfo error:", error);
    return { name: "" };
  }
}

// ── Get Invoice Settings ──────────────────────────────────────

export async function getInvoiceSettings(): Promise<InvoiceSettings> {
  try {
    const { orgId } = await getCurrentOrg();

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { bmsSettings: true },
    });

    const bms = (org?.bmsSettings && typeof org.bmsSettings === "object")
      ? org.bmsSettings as Record<string, unknown>
      : {};

    return {
      invoicePrefix: typeof bms.invoicePrefix === "string" ? bms.invoicePrefix : "INV",
      invoiceNotes: typeof bms.invoiceNotes === "string" ? bms.invoiceNotes : "",
      invoiceLineFormat: typeof bms.invoiceLineFormat === "string" ? bms.invoiceLineFormat : "rental_commission_tenant_address",
      defaultPaymentTerms: typeof bms.defaultPaymentTerms === "string" ? bms.defaultPaymentTerms : "Net 30",
    };
  } catch (error) {
    console.error("getInvoiceSettings error:", error);
    return { invoicePrefix: "INV", invoiceNotes: "", invoiceLineFormat: "rental_commission_tenant_address", defaultPaymentTerms: "Net 30" };
  }
}

// ── Get Payment Instructions ─────────────────────────────────

export async function getPaymentInstructions(): Promise<PaymentInstructions | null> {
  try {
    const { orgId } = await getCurrentOrg();

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { bmsSettings: true },
    });

    if (!org?.bmsSettings || typeof org.bmsSettings !== "object") return null;

    const settings = org.bmsSettings as Record<string, unknown>;
    const pi = settings.paymentInstructions;
    if (!pi || typeof pi !== "object") return null;

    return pi as PaymentInstructions;
  } catch (error) {
    console.error("getPaymentInstructions error:", error);
    return null;
  }
}

// ── Get Brokerage Logo ───────────────────────────────────────

export async function getBrokerageLogo(): Promise<string | null> {
  try {
    const { orgId } = await getCurrentOrg();

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        logoUrl: true,
        brandSettings: { select: { logoUrl: true } },
      },
    });

    return org?.brandSettings?.logoUrl || org?.logoUrl || null;
  } catch (error) {
    console.error("getBrokerageLogo error:", error);
    return null;
  }
}

// ── Lookup Agents by Name ────────────────────────────────────

export async function lookupAgentsByName(
  names: string[],
): Promise<Record<string, { licenseNumber?: string }>> {
  try {
    const { orgId } = await getCurrentOrg();

    const agents = await prisma.brokerAgent.findMany({
      where: { orgId, status: "active" },
      select: { firstName: true, lastName: true, licenseNumber: true },
    });

    const result: Record<string, { licenseNumber?: string }> = {};
    const uniqueNames = [...new Set(names.map(n => n.toLowerCase().trim()))];

    for (const excelName of uniqueNames) {
      for (const agent of agents) {
        const fullName = `${agent.firstName} ${agent.lastName}`.toLowerCase().trim();
        if (fullName === excelName) {
          // Find the original casing from the input
          const originalName = names.find(n => n.toLowerCase().trim() === excelName) || excelName;
          result[originalName] = {
            licenseNumber: agent.licenseNumber || undefined,
          };
          break;
        }
      }
    }

    return result;
  } catch (error) {
    console.error("lookupAgentsByName error:", error);
    return {};
  }
}

// ── Invoice Number Format ─────────────────────────────────────

export async function getInvoiceNumberFormat(): Promise<string | null> {
  try {
    const { orgId } = await getCurrentOrg();
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { bmsSettings: true },
    });
    if (!org?.bmsSettings || typeof org.bmsSettings !== "object") return null;
    const settings = org.bmsSettings as Record<string, unknown>;
    return typeof settings.invoiceNumberFormat === "string" ? settings.invoiceNumberFormat : null;
  } catch (error) {
    console.error("getInvoiceNumberFormat error:", error);
    return null;
  }
}

export async function saveInvoiceNumberFormat(
  format: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { orgId } = await getCurrentOrg();
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { bmsSettings: true },
    });
    const current = (org?.bmsSettings && typeof org.bmsSettings === "object")
      ? org.bmsSettings as Record<string, unknown>
      : {};
    const merged = { ...current, invoiceNumberFormat: format } as Record<string, unknown>;
    await prisma.organization.update({
      where: { id: orgId },
      data: { bmsSettings: merged as any }, // eslint-disable-line @typescript-eslint/no-explicit-any
    });
    return { success: true };
  } catch (error) {
    console.error("saveInvoiceNumberFormat error:", error);
    return { success: false, error: "Failed to save invoice number format" };
  }
}

/**
 * Get the next sequential invoice number for the org.
 * Returns just the integer sequence value.
 */
export async function getNextInvoiceSequence(): Promise<number> {
  try {
    const { orgId } = await getCurrentOrg();
    const count = await prisma.invoice.count({ where: { orgId } });
    return count + 1;
  } catch (error) {
    console.error("getNextInvoiceSequence error:", error);
    return 1;
  }
}

// ── Create Transactions from Invoices ────────────────────────

export async function createTransactionsFromInvoices(
  invoiceIds: string[],
): Promise<{ success: boolean; created: number; skipped: number; errors: string[] }> {
  try {
    const { userId, orgId } = await getCurrentOrg();

    // Ensure default templates exist
    await ensureDefaultTemplates(orgId);

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const invoiceId of invoiceIds) {
      try {
        // Check if invoice already has a linked transaction
        const existingTx = await prisma.transaction.findUnique({
          where: { invoiceId },
        });
        if (existingTx) {
          skipped++;
          continue;
        }

        const invoice = await prisma.invoice.findFirst({
          where: { id: invoiceId, orgId },
          include: { agent: { select: { id: true, defaultSplitPct: true } } },
        });
        if (!invoice) {
          errors.push(`Invoice ${invoiceId} not found`);
          continue;
        }

        // Map deal type to transaction type
        const dealType = invoice.dealType as string;
        const txType = dealType === "rental" || dealType === "lease" ? "rental" : "sale";

        // Determine initial stage — invoice already exists, so start at invoice_sent
        const initialStage = invoice.status === "sent" || invoice.status === "paid"
          ? "invoice_sent"
          : "invoice_sent"; // Even draft invoices — they'll be at this financial stage

        const transaction = await prisma.transaction.create({
          data: {
            orgId,
            type: txType as any, // eslint-disable-line @typescript-eslint/no-explicit-any
            stage: initialStage as any, // eslint-disable-line @typescript-eslint/no-explicit-any
            invoiceId: invoice.id,
            agentId: invoice.agentId,
            dealSubmissionId: invoice.dealSubmissionId,
            propertyAddress: invoice.propertyAddress,
            transactionValue: invoice.transactionValue,
            commissionAmount: invoice.totalCommission,
            clientName: invoice.clientName,
            closingDate: invoice.closingDate,
            agentSplitPct: invoice.agentSplitPct,
            agentPayoutAmount: invoice.agentPayout,
            housePayoutAmount: invoice.housePayout,
            invoiceCreatedAt: invoice.createdAt,
            invoiceSentAt: invoice.status === "sent" || invoice.status === "paid"
              ? invoice.issueDate
              : null,
            commissionReceivedAt: invoice.status === "paid" && invoice.paidDate
              ? invoice.paidDate
              : null,
          },
        });

        // Copy template tasks — mark operational stages as implicitly complete
        const template = await prisma.transactionTemplate.findFirst({
          where: { orgId, type: txType as any, isActive: true }, // eslint-disable-line @typescript-eslint/no-explicit-any
          orderBy: { isDefault: "desc" },
          include: { tasks: { orderBy: { sortOrder: "asc" } } },
        });

        if (template && template.tasks.length > 0) {
          // Financial stages — tasks from these stages remain uncompleted
          const financialStages = new Set(["invoice_sent", "payment_received", "agent_paid"]);

          await prisma.transactionTask.createMany({
            data: template.tasks.map((t) => ({
              transactionId: transaction.id,
              title: t.title,
              description: t.description,
              stage: t.stage,
              sortOrder: t.sortOrder,
              isRequired: t.isRequired,
              // Mark non-financial tasks as completed (operational stages already passed)
              isCompleted: !financialStages.has(t.stage) && t.stage !== "closed",
              completedAt: !financialStages.has(t.stage) && t.stage !== "closed" ? new Date() : null,
              completedBy: !financialStages.has(t.stage) && t.stage !== "closed" ? userId : null,
            })),
          });
        }

        logTransactionAction(orgId, { id: userId }, "transactions_from_invoices", transaction.id, {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
        });

        created++;
      } catch (err) {
        errors.push(`Invoice ${invoiceId}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    return { success: errors.length === 0, created, skipped, errors };
  } catch (error) {
    console.error("createTransactionsFromInvoices error:", error);
    return { success: false, created: 0, skipped: 0, errors: ["Failed to create transactions"] };
  }
}
