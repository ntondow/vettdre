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

// ── Bill To Mapping Types ─────────────────────────────────────

export interface BillToEntity {
  companyName: string;
  address?: string;
  phone?: string;
  email?: string;
}

export type BillToMappings = Record<string, BillToEntity>;

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

// ── Get Next Invoice Number ───────────────────────────────────

export async function getNextInvoiceNumber(): Promise<string> {
  try {
    const { orgId } = await getCurrentOrg();
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
  } catch (error) {
    console.error("getNextInvoiceNumber error:", error);
    return `INV-${new Date().getFullYear()}-0001`;
  }
}

// ── Get From Info ─────────────────────────────────────────────

export interface FromInfo {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
}

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

export interface InvoiceSettings {
  invoicePrefix: string;
  invoiceNotes: string;
  invoiceLineFormat: string;
  defaultPaymentTerms: string;
}

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
