"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type { BrokerageSettings } from "@/lib/bms-types";
import { logSettingsAction } from "@/lib/bms-audit";

// ── Auth Helper ───────────────────────────────────────────────

async function getCurrentOrgAsAdmin() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    include: { brokerAgent: { select: { brokerageRole: true } } },
  });
  if (!user) throw new Error("User not found");

  return {
    userId: user.id,
    orgId: user.orgId,
    role: (user.brokerAgent?.brokerageRole as string) || null,
  };
}

async function getCurrentOrg() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
  });
  if (!user) throw new Error("User not found");

  return { orgId: user.orgId };
}

// ── BMS Settings Defaults ────────────────────────────────────

interface BmsSettingsJson {
  defaultSplitPct: number;
  defaultPaymentTerms: string;
  invoiceFooterText: string;
  companyLicenseNumber: string;
  companyEmail: string;
  invoicePrefix: string;
  invoiceNotes: string;
  invoiceLineFormat: string;
  billToMappings: Record<string, { companyName: string; address?: string; phone?: string; email?: string }>;
}

const BMS_DEFAULTS: BmsSettingsJson = {
  defaultSplitPct: 70,
  defaultPaymentTerms: "Net 30",
  invoiceFooterText: "",
  companyLicenseNumber: "",
  companyEmail: "",
  invoicePrefix: "INV",
  invoiceNotes: "",
  invoiceLineFormat: "rental_commission_tenant_address",
  billToMappings: {},
};

function parseBmsSettings(raw: unknown): BmsSettingsJson {
  if (!raw || typeof raw !== "object") return { ...BMS_DEFAULTS };
  const obj = raw as Record<string, unknown>;
  return {
    defaultSplitPct: typeof obj.defaultSplitPct === "number" ? obj.defaultSplitPct : BMS_DEFAULTS.defaultSplitPct,
    defaultPaymentTerms: typeof obj.defaultPaymentTerms === "string" ? obj.defaultPaymentTerms : BMS_DEFAULTS.defaultPaymentTerms,
    invoiceFooterText: typeof obj.invoiceFooterText === "string" ? obj.invoiceFooterText : BMS_DEFAULTS.invoiceFooterText,
    companyLicenseNumber: typeof obj.companyLicenseNumber === "string" ? obj.companyLicenseNumber : BMS_DEFAULTS.companyLicenseNumber,
    companyEmail: typeof obj.companyEmail === "string" ? obj.companyEmail : BMS_DEFAULTS.companyEmail,
    invoicePrefix: typeof obj.invoicePrefix === "string" ? obj.invoicePrefix : BMS_DEFAULTS.invoicePrefix,
    invoiceNotes: typeof obj.invoiceNotes === "string" ? obj.invoiceNotes : BMS_DEFAULTS.invoiceNotes,
    invoiceLineFormat: typeof obj.invoiceLineFormat === "string" ? obj.invoiceLineFormat : BMS_DEFAULTS.invoiceLineFormat,
    billToMappings: (obj.billToMappings && typeof obj.billToMappings === "object" && !Array.isArray(obj.billToMappings))
      ? obj.billToMappings as BmsSettingsJson["billToMappings"]
      : BMS_DEFAULTS.billToMappings,
  };
}

// ── Get Brokerage Settings ───────────────────────────────────

export async function getBrokerageSettings(): Promise<BrokerageSettings> {
  try {
    const { orgId } = await getCurrentOrg();

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        name: true,
        address: true,
        phone: true,
        logoUrl: true,
        bmsSettings: true,
        submissionToken: true,
        brandSettings: {
          select: {
            companyName: true,
            logoUrl: true,
            primaryColor: true,
            accentColor: true,
          },
        },
      },
    });

    if (!org) {
      return {
        name: "",
        address: "",
        phone: "",
        logoUrl: null,
        companyName: null,
        submissionToken: null,
        primaryColor: null,
        accentColor: null,
        ...BMS_DEFAULTS,
      } as BrokerageSettings;
    }

    const bms = parseBmsSettings(org.bmsSettings);

    return {
      name: org.name,
      address: org.address || "",
      phone: org.phone || "",
      logoUrl: org.brandSettings?.logoUrl || org.logoUrl || null,
      companyName: org.brandSettings?.companyName || null,
      submissionToken: org.submissionToken || null,
      primaryColor: org.brandSettings?.primaryColor || null,
      accentColor: org.brandSettings?.accentColor || null,
      ...bms,
    } as BrokerageSettings;
  } catch (error) {
    console.error("getBrokerageSettings error:", error);
    return {
      name: "",
      address: "",
      phone: "",
      logoUrl: null,
      companyName: null,
      submissionToken: null,
      primaryColor: null,
      accentColor: null,
      ...BMS_DEFAULTS,
    } as BrokerageSettings;
  }
}

// ── Update Brokerage Settings ────────────────────────────────

export async function updateBrokerageSettings(input: {
  name?: string;
  address?: string;
  phone?: string;
  companyName?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  defaultSplitPct?: number;
  defaultPaymentTerms?: string;
  invoiceFooterText?: string;
  companyLicenseNumber?: string;
  companyEmail?: string;
  invoicePrefix?: string;
  invoiceNotes?: string;
  invoiceLineFormat?: string;
  billToMappings?: Record<string, { companyName: string; address?: string; phone?: string; email?: string }>;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId, orgId, role } = await getCurrentOrgAsAdmin();

    if (role !== "brokerage_admin") {
      return { success: false, error: "Only brokerage administrators can update settings" };
    }

    // 1. Update Organization fields
    const orgUpdate: Record<string, unknown> = {};
    if (input.name !== undefined) orgUpdate.name = input.name;
    if (input.address !== undefined) orgUpdate.address = input.address || null;
    if (input.phone !== undefined) orgUpdate.phone = input.phone || null;

    // 2. Merge bmsSettings JSON
    const hasBmsFields =
      input.defaultSplitPct !== undefined ||
      input.defaultPaymentTerms !== undefined ||
      input.invoiceFooterText !== undefined ||
      input.companyLicenseNumber !== undefined ||
      input.companyEmail !== undefined ||
      input.invoicePrefix !== undefined ||
      input.invoiceNotes !== undefined ||
      input.invoiceLineFormat !== undefined ||
      input.billToMappings !== undefined;

    if (hasBmsFields) {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { bmsSettings: true },
      });
      const current = parseBmsSettings(org?.bmsSettings);
      const merged: BmsSettingsJson = {
        defaultSplitPct: input.defaultSplitPct ?? current.defaultSplitPct,
        defaultPaymentTerms: input.defaultPaymentTerms ?? current.defaultPaymentTerms,
        invoiceFooterText: input.invoiceFooterText ?? current.invoiceFooterText,
        companyLicenseNumber: input.companyLicenseNumber ?? current.companyLicenseNumber,
        companyEmail: input.companyEmail ?? current.companyEmail,
        invoicePrefix: input.invoicePrefix ?? current.invoicePrefix,
        invoiceNotes: input.invoiceNotes ?? current.invoiceNotes,
        invoiceLineFormat: input.invoiceLineFormat ?? current.invoiceLineFormat,
        billToMappings: input.billToMappings ?? current.billToMappings,
      };
      orgUpdate.bmsSettings = merged;
    }

    if (Object.keys(orgUpdate).length > 0) {
      await prisma.organization.update({
        where: { id: orgId },
        data: orgUpdate,
      });
    }

    // 3. Upsert BrandSettings
    const hasBrandFields =
      input.companyName !== undefined ||
      input.logoUrl !== undefined ||
      input.primaryColor !== undefined ||
      input.accentColor !== undefined;

    if (hasBrandFields) {
      const brandUpdate: Record<string, unknown> = {};
      if (input.companyName !== undefined) brandUpdate.companyName = input.companyName || null;
      if (input.logoUrl !== undefined) brandUpdate.logoUrl = input.logoUrl || null;
      if (input.primaryColor !== undefined) brandUpdate.primaryColor = input.primaryColor || "#2563EB";
      if (input.accentColor !== undefined) brandUpdate.accentColor = input.accentColor || null;

      await prisma.brandSettings.upsert({
        where: { orgId },
        create: {
          orgId,
          companyName: (brandUpdate.companyName as string) || null,
          logoUrl: (brandUpdate.logoUrl as string) || null,
          primaryColor: (brandUpdate.primaryColor as string) || "#2563EB",
          accentColor: (brandUpdate.accentColor as string) || null,
        },
        update: brandUpdate,
      });
    }

    logSettingsAction(orgId, { id: userId }, "settings_updated", {
      updatedFields: Object.keys(input),
    });

    return { success: true };
  } catch (error) {
    console.error("updateBrokerageSettings error:", error);
    return { success: false, error: "Failed to update settings" };
  }
}

// ── Audit Logs ──────────────────────────────────────────────

export async function getAuditLogs(filters?: {
  action?: string;
  entityType?: string;
  actorId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}) {
  try {
    const { orgId, role } = await getCurrentOrgAsAdmin();

    if (role !== "brokerage_admin") {
      return { logs: [], total: 0, page: 1, totalPages: 0 };
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { orgId };

    if (filters?.entityType && filters.entityType !== "all") {
      where.entityType = filters.entityType;
    }

    if (filters?.action) {
      where.action = { contains: filters.action, mode: "insensitive" };
    }

    if (filters?.actorId) {
      where.userId = filters.actorId;
    }

    if (filters?.startDate || filters?.endDate) {
      const createdAt: Record<string, Date> = {};
      if (filters?.startDate) createdAt.gte = new Date(filters.startDate);
      if (filters?.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        createdAt.lte = end;
      }
      where.createdAt = createdAt;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return JSON.parse(JSON.stringify({
      logs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    }));
  } catch (error) {
    console.error("getAuditLogs error:", error);
    return { logs: [], total: 0, page: 1, totalPages: 0 };
  }
}
