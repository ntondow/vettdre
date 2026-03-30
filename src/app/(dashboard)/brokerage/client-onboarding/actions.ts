"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/bms-permissions";
import { logSubmissionAction, logInvoiceAction, logTransactionAction } from "@/lib/bms-audit";
import { buildInvoiceNumber } from "@/lib/bms-types";
import { generateTenantRepAgreementPdf } from "@/lib/onboarding-pdf";
import { prefillPdfFields, buildPrefillValues, stampLogoOnPdf } from "@/lib/onboarding-prefill";
import { sendOnboardingInviteEmail, sendOnboardingReminder } from "@/lib/onboarding-notifications";
import type { BrokerageRoleType } from "@/lib/bms-types";
import type { ClientOnboardingInput } from "@/lib/onboarding-types";
import { DOC_TYPE_LABELS } from "@/lib/onboarding-types";

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

  let role: BrokerageRoleType | null = null;
  if (user.role === "owner" || user.role === "admin" || user.role === "super_admin") {
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

  return {
    userId: user.id,
    orgId: user.orgId,
    agentId: user.brokerAgent?.id ?? user.id,
    role,
    fullName: user.fullName || user.email,
  };
}

// ── Serialization ───────────────────────────────────────────

function serialize<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_key, value) => {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "bigint") return Number(value);
    return value;
  }));
}

function num(val: unknown): number {
  if (val == null) return 0;
  return Number(val);
}

// ── 1. getOnboardings ───────────────────────────────────────

export async function getOnboardings(filters?: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{ success: boolean; data?: Record<string, unknown>[]; total?: number; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };

    const canViewAll = hasPermission(ctx.role, "client_onboarding_view_all");
    const canViewOwn = hasPermission(ctx.role, "client_onboarding_view_own");
    if (!canViewAll && !canViewOwn) {
      return { success: false, error: "Not authorized" };
    }

    const page = Math.max(1, filters?.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters?.limit ?? 25));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { orgId: ctx.orgId };
    if (!canViewAll) where.agentId = ctx.agentId;
    if (filters?.status) where.status = filters.status;

    const [onboardings, total] = await Promise.all([
      prisma.clientOnboarding.findMany({
        where,
        include: {
          agent: { select: { id: true, firstName: true, lastName: true, email: true } },
          documents: { select: { id: true, docType: true, status: true }, orderBy: { sortOrder: "asc" } },
          _count: { select: { auditLogs: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.clientOnboarding.count({ where }),
    ]);

    const data = onboardings.map((o) => {
      const record = serialize(o);
      return {
        ...record,
        _documentSummary: {
          total: o.documents.length,
          signed: o.documents.filter((d) => d.status === "signed").length,
          pending: o.documents.filter((d) => d.status === "pending").length,
        },
        _auditLogCount: o._count.auditLogs,
      };
    });

    return { success: true, data: data as unknown as Record<string, unknown>[], total };
  } catch (error: unknown) {
    console.error("getOnboardings error:", error);
    return { success: false, error: "Failed to fetch onboardings" };
  }
}

// ── 2. getOnboarding ────────────────────────────────────────

export async function getOnboarding(
  id: string,
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };

    const canViewAll = hasPermission(ctx.role, "client_onboarding_view_all");
    const canViewOwn = hasPermission(ctx.role, "client_onboarding_view_own");
    if (!canViewAll && !canViewOwn) {
      return { success: false, error: "Not authorized" };
    }

    const onboarding = await prisma.clientOnboarding.findFirst({
      where: {
        id,
        orgId: ctx.orgId,
        ...(!canViewAll ? { agentId: ctx.agentId } : {}),
      },
      include: {
        agent: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, licenseNumber: true } },
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        documents: {
          orderBy: { sortOrder: "asc" },
          include: {
            auditLogs: { orderBy: { createdAt: "desc" }, take: 20 },
          },
        },
        auditLogs: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });

    if (!onboarding) return { success: false, error: "Onboarding not found" };

    return { success: true, data: serialize(onboarding) as unknown as Record<string, unknown> };
  } catch (error: unknown) {
    console.error("getOnboarding error:", error);
    return { success: false, error: "Failed to fetch onboarding" };
  }
}

// ── 3. createOnboarding ─────────────────────────────────────

export async function createOnboarding(
  input: ClientOnboardingInput,
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx.role, "client_onboarding_create")) {
      return { success: false, error: "Not authorized" };
    }

    if (!input.clientFirstName?.trim()) return { success: false, error: "Client first name is required" };
    if (!input.clientLastName?.trim()) return { success: false, error: "Client last name is required" };
    if (!input.clientEmail?.trim()) return { success: false, error: "Client email is required" };

    // Get agent + org info for PDF generation
    const agent = await prisma.brokerAgent.findFirst({
      where: { id: ctx.agentId, orgId: ctx.orgId },
      select: { id: true, firstName: true, lastName: true, email: true, licenseNumber: true },
    });
    if (!agent) return { success: false, error: "Agent record not found" };

    const org = await prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { name: true, bmsSettings: true },
    });
    if (!org) return { success: false, error: "Organization not found" };

    const termDays = input.expiresInDays ?? 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + termDays);

    const agentFullName = `${agent.firstName} ${agent.lastName}`;
    const supabase = await createClient();

    // Build prefill values for templates
    const prefillValues = buildPrefillValues({
      clientFirstName: input.clientFirstName.trim(),
      clientLastName: input.clientLastName.trim(),
      clientEmail: input.clientEmail.trim(),
      propertyAddress: input.propertyAddress?.trim(),
      unitNumber: input.unitNumber?.trim(),
      monthlyRent: input.monthlyRent,
      commissionPct: input.commissionPct,
      moveInDate: input.moveInDate,
      agentName: agentFullName,
      agentLicense: agent.licenseNumber || undefined,
      brokerageName: org.name,
      termDays,
    });

    // Resolve which templates to use
    const hasSelectedTemplates = Array.isArray(input.selectedTemplateIds) && input.selectedTemplateIds.length > 0;
    let selectedTemplates: Array<{ id: string; name: string; templatePdfUrl: string; fields: unknown; docType: string }> = [];

    if (hasSelectedTemplates) {
      const dbTemplates = await prisma.documentTemplate.findMany({
        where: { id: { in: input.selectedTemplateIds }, orgId: ctx.orgId, isActive: true },
        orderBy: { sortOrder: "asc" },
      });
      selectedTemplates = dbTemplates.map((t) => ({
        id: t.id,
        name: t.name,
        templatePdfUrl: t.templatePdfUrl,
        fields: t.fields,
        docType: "tenant_rep_agreement",
      }));
    } else {
      // Auto-select default templates if none specified
      const defaults = await prisma.documentTemplate.findMany({
        where: { orgId: ctx.orgId, isDefault: true, isActive: true },
        orderBy: { sortOrder: "asc" },
      });
      if (defaults.length > 0) {
        selectedTemplates = defaults.map((t) => ({
          id: t.id,
          name: t.name,
          templatePdfUrl: t.templatePdfUrl,
          fields: t.fields,
          docType: "tenant_rep_agreement",
        }));
      }
    }

    // Fallback: if no templates selected, use the old hardcoded 3-doc flow
    if (selectedTemplates.length === 0) {
      // Generate Tenant Rep Agreement PDF from scratch
      const pdfBytes = await generateTenantRepAgreementPdf({
        brokerageName: org.name,
        agentFullName,
        agentLicense: agent.licenseNumber || "N/A",
        clientFirstName: input.clientFirstName.trim(),
        clientLastName: input.clientLastName.trim(),
        commissionAmount: input.commissionPct ?? 0,
        commissionType: "percentage",
        termDays,
      });

      let fallbackPdfUrl: string | null = null;
      try {
        const fileName = `onboarding/${ctx.orgId}/${Date.now()}-tenant-rep-agreement.pdf`;
        const { error: uploadError } = await supabase.storage
          .from("bms-files")
          .upload(fileName, pdfBytes, { contentType: "application/pdf", upsert: false });
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from("bms-files").getPublicUrl(fileName);
          fallbackPdfUrl = urlData?.publicUrl ?? null;
        }
      } catch (e) {
        console.error("Fallback PDF upload failed:", e);
      }

      selectedTemplates = [
        { id: "", name: DOC_TYPE_LABELS.tenant_rep_agreement, templatePdfUrl: fallbackPdfUrl ?? "", fields: [], docType: "tenant_rep_agreement" },
        { id: "", name: DOC_TYPE_LABELS.nys_disclosure, templatePdfUrl: "", fields: [], docType: "nys_disclosure" },
        { id: "", name: DOC_TYPE_LABELS.fair_housing_notice, templatePdfUrl: "", fields: [], docType: "fair_housing_notice" },
      ];
    }

    // Fetch brokerage logo for stamping onto PDFs (replaces "[YOUR LOGO HERE]" placeholder)
    let logoBytes: Uint8Array | null = null;
    let logoMimeType: "image/png" | "image/jpeg" = "image/png";
    try {
      const brandSettings = await prisma.brandSettings.findUnique({ where: { orgId: ctx.orgId }, select: { logoUrl: true } });
      if (brandSettings?.logoUrl) {
        const logoResp = await fetch(brandSettings.logoUrl);
        if (logoResp.ok) {
          logoBytes = new Uint8Array(await logoResp.arrayBuffer());
          const ct = logoResp.headers.get("content-type") || "";
          logoMimeType = ct.includes("jpeg") || ct.includes("jpg") ? "image/jpeg" : "image/png";
        }
      }
    } catch (logoErr) {
      console.error("Logo fetch failed (will skip logo stamping):", logoErr);
    }

    // Pre-fill and upload PDFs for selected templates
    const preparedDocs: Array<{ templateId: string | null; name: string; pdfUrl: string | null; docType: string; sortOrder: number }> = [];

    for (let i = 0; i < selectedTemplates.length; i++) {
      const tmpl = selectedTemplates[i];
      let finalPdfUrl = tmpl.templatePdfUrl || null;

      // If template has fields and a PDF, pre-fill it
      const tmplFields = Array.isArray(tmpl.fields) ? tmpl.fields as import("@/lib/onboarding-types").TemplateFieldDefinition[] : [];
      if (tmpl.templatePdfUrl && tmplFields.length > 0) {
        try {
          // Download template PDF
          const pathMatch = tmpl.templatePdfUrl.match(/\/storage\/v1\/object\/public\/bms-files\/(.+)/);
          const storagePath = pathMatch?.[1];
          let pdfBytes: Uint8Array | null = null;

          if (storagePath) {
            const { data: fileData } = await supabase.storage.from("bms-files").download(storagePath);
            if (fileData) pdfBytes = new Uint8Array(await fileData.arrayBuffer());
          } else if (tmpl.templatePdfUrl.startsWith("http")) {
            const resp = await fetch(tmpl.templatePdfUrl);
            if (resp.ok) pdfBytes = new Uint8Array(await resp.arrayBuffer());
          }

          if (pdfBytes && pdfBytes.length > 0) {
            let filledPdf = await prefillPdfFields(pdfBytes, tmplFields, prefillValues);

            // Stamp brokerage logo onto custom/brokerage templates (not government forms)
            const isGovernmentForm = tmpl.name.includes("DOS-") || tmpl.docType === "nys_disclosure" || tmpl.docType === "fair_housing_notice";
            if (logoBytes && logoBytes.length > 0 && !isGovernmentForm) {
              try {
                filledPdf = await stampLogoOnPdf(new Uint8Array(filledPdf), logoBytes, logoMimeType);
              } catch (logoStampErr) {
                console.error(`Logo stamp failed for ${tmpl.name}:`, logoStampErr);
              }
            }

            const filledPath = `onboarding/${ctx.orgId}/${Date.now()}-prefilled-${i}.pdf`;
            const { error: upErr } = await supabase.storage
              .from("bms-files")
              .upload(filledPath, filledPdf, { contentType: "application/pdf", upsert: false });
            if (!upErr) {
              const { data: urlData } = supabase.storage.from("bms-files").getPublicUrl(filledPath);
              finalPdfUrl = urlData?.publicUrl ?? finalPdfUrl;
            }
          }
        } catch (prefillErr) {
          console.error(`Prefill failed for template ${tmpl.name}:`, prefillErr);
          // Use original template URL as fallback
        }
      }

      preparedDocs.push({
        templateId: tmpl.id || null,
        name: tmpl.name,
        pdfUrl: finalPdfUrl,
        docType: tmpl.docType,
        sortOrder: i,
      });
    }

    // Create onboarding + documents in a transaction
    const onboarding = await prisma.$transaction(async (tx) => {
      const record = await tx.clientOnboarding.create({
        data: {
          orgId: ctx.orgId,
          agentId: agent.id,
          clientFirstName: input.clientFirstName.trim(),
          clientLastName: input.clientLastName.trim(),
          clientEmail: input.clientEmail.trim(),
          clientPhone: input.clientPhone?.trim() || null,
          dealType: input.dealType || null,
          propertyAddress: input.propertyAddress?.trim() || null,
          exclusiveType: input.exclusiveType || null,
          status: "pending",
          expiresAt,
          sentAt: new Date(),
          sentVia: input.deliveryMethod || "email",
          commissionPct: input.commissionPct ?? null,
          monthlyRent: input.monthlyRent ?? null,
          notes: input.notes?.trim() || null,
        },
      });

      for (const doc of preparedDocs) {
        await tx.onboardingDocument.create({
          data: {
            onboardingId: record.id,
            templateId: doc.templateId || null,
            docType: doc.docType,
            title: doc.name,
            sortOrder: doc.sortOrder,
            status: "pending",
            pdfUrl: doc.pdfUrl,
          },
        });
      }

      await tx.signingAuditLog.create({
        data: {
          onboardingId: record.id,
          action: "created",
          actorType: "agent",
          actorId: ctx.userId,
          actorName: ctx.fullName,
        },
      });

      return record;
    });

    // Send invite email (fire-and-forget)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.vettdre.com";
    const signingUrl = `${appUrl}/sign/${onboarding.token}`;

    sendOnboardingInviteEmail({
      clientEmail: input.clientEmail.trim(),
      clientFirstName: input.clientFirstName.trim(),
      agentFullName: `${agent.firstName} ${agent.lastName}`,
      brokerageName: org.name,
      signingUrl,
      personalNote: input.notes?.trim() || undefined,
      orgId: ctx.orgId,
    }).catch((err) => console.error("Invite email send failed:", err));

    return { success: true, data: serialize(onboarding) as unknown as Record<string, unknown> };
  } catch (error: unknown) {
    console.error("createOnboarding error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to create onboarding" };
  }
}

// ── 4. voidOnboarding ───────────────────────────────────────

export async function voidOnboarding(
  id: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx.role, "client_onboarding_void")) {
      return { success: false, error: "Not authorized" };
    }

    const onboarding = await prisma.clientOnboarding.findFirst({
      where: { id, orgId: ctx.orgId },
    });
    if (!onboarding) return { success: false, error: "Onboarding not found" };

    const voidableStatuses = ["draft", "pending", "partially_signed"];
    if (!voidableStatuses.includes(onboarding.status)) {
      return { success: false, error: `Cannot void an onboarding with status "${onboarding.status}"` };
    }

    // Get document PDFs for cleanup
    const docs = await prisma.onboardingDocument.findMany({
      where: { onboardingId: id },
      select: { pdfUrl: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.clientOnboarding.update({
        where: { id },
        data: { status: "voided" },
      });

      await tx.signingAuditLog.create({
        data: {
          onboardingId: id,
          action: "voided",
          actorType: "agent",
          actorId: ctx.userId,
          actorName: ctx.fullName,
          metadata: reason ? { reason } : undefined,
        },
      });
    });

    // Cleanup storage (fire-and-forget)
    cleanupOnboardingStorage(docs.map((d) => d.pdfUrl).filter(Boolean) as string[]).catch(() => {});

    return { success: true };
  } catch (error: unknown) {
    console.error("voidOnboarding error:", error);
    return { success: false, error: "Failed to void onboarding" };
  }
}

// ── 5. resendOnboarding ─────────────────────────────────────

export async function resendOnboarding(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx.role, "client_onboarding_resend")) {
      return { success: false, error: "Not authorized" };
    }

    const onboarding = await prisma.clientOnboarding.findFirst({
      where: { id, orgId: ctx.orgId },
    });
    if (!onboarding) return { success: false, error: "Onboarding not found" };

    const resendableStatuses = ["pending", "partially_signed"];
    if (!resendableStatuses.includes(onboarding.status)) {
      return { success: false, error: `Cannot resend an onboarding with status "${onboarding.status}"` };
    }

    await prisma.$transaction(async (tx) => {
      await tx.clientOnboarding.update({
        where: { id },
        data: { sentAt: new Date() },
      });

      await tx.signingAuditLog.create({
        data: {
          onboardingId: id,
          action: "resent",
          actorType: "agent",
          actorId: ctx.userId,
          actorName: ctx.fullName,
        },
      });
    });

    // Send reminder email (fire-and-forget)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.vettdre.com";
    const signingUrl = `${appUrl}/sign/${onboarding.token}`;
    const daysRemaining = onboarding.expiresAt
      ? Math.max(0, Math.ceil((new Date(onboarding.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : 0;

    const agent = await prisma.brokerAgent.findUnique({
      where: { id: ctx.agentId },
      select: { firstName: true, lastName: true },
    });
    const org = await prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { name: true },
    });

    sendOnboardingReminder({
      clientEmail: onboarding.clientEmail,
      clientFirstName: onboarding.clientFirstName,
      agentFullName: agent ? `${agent.firstName} ${agent.lastName}` : ctx.fullName,
      brokerageName: org?.name ?? "Your Brokerage",
      signingUrl,
      daysRemaining,
    }).catch((err) => console.error("Reminder email send failed:", err));

    return { success: true };
  } catch (error: unknown) {
    console.error("resendOnboarding error:", error);
    return { success: false, error: "Failed to resend onboarding" };
  }
}

// ── 6. getOnboardingPublic ──────────────────────────────────

export async function getOnboardingPublic(
  token: string,
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    if (!token?.trim()) return { success: false, error: "Invalid token" };

    const onboarding = await prisma.clientOnboarding.findUnique({
      where: { token },
      include: {
        documents: {
          select: {
            id: true,
            docType: true,
            title: true,
            status: true,
            sortOrder: true,
            pdfUrl: true,
            signedAt: true,
          },
          orderBy: { sortOrder: "asc" },
        },
        agent: { select: { firstName: true, lastName: true } },
        organization: { select: { name: true } },
      },
    });

    if (!onboarding) return { success: false, error: "Onboarding not found" };

    // Validate state
    if (onboarding.status === "voided") return { success: false, error: "This onboarding has been cancelled" };
    if (onboarding.status === "completed") return { success: false, error: "All documents have already been signed" };
    if (onboarding.expiresAt && new Date(onboarding.expiresAt) < new Date()) {
      return { success: false, error: "This signing link has expired" };
    }

    // Return only safe public fields (no orgId, agentId, storage paths)
    const publicData = {
      id: onboarding.id,
      clientFirstName: onboarding.clientFirstName,
      clientLastName: onboarding.clientLastName,
      clientEmail: onboarding.clientEmail,
      status: onboarding.status,
      expiresAt: onboarding.expiresAt?.toISOString() ?? null,
      brokerageName: (onboarding as Record<string, unknown>).organization
        ? ((onboarding as Record<string, unknown>).organization as { name: string }).name
        : null,
      agentName: onboarding.agent
        ? `${onboarding.agent.firstName} ${onboarding.agent.lastName}`
        : null,
      dealType: onboarding.dealType,
      propertyAddress: onboarding.propertyAddress,
      documents: onboarding.documents.map((d) => ({
        id: d.id,
        docType: d.docType,
        title: d.title,
        status: d.status,
        pdfUrl: d.pdfUrl,
        signedAt: d.signedAt?.toISOString() ?? null,
      })),
    };

    return { success: true, data: publicData as unknown as Record<string, unknown> };
  } catch (error: unknown) {
    console.error("getOnboardingPublic error:", error);
    return { success: false, error: "Failed to load signing page" };
  }
}

// ── 7. generateInvoiceFromOnboarding ────────────────────────

export async function generateInvoiceFromOnboarding(
  onboardingId: string,
  additionalData: {
    propertyAddress: string;
    unit?: string;
    leaseStartDate?: string;
    leaseEndDate?: string;
    monthlyRent?: number;
    closingDate?: string;
  },
): Promise<{ success: boolean; invoiceId?: string; transactionId?: string; submissionId?: string; error?: string }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx.role, "create_invoice")) {
      return { success: false, error: "Not authorized" };
    }

    const onboarding = await prisma.clientOnboarding.findFirst({
      where: { id: onboardingId, orgId: ctx.orgId },
      include: {
        agent: { select: { id: true, firstName: true, lastName: true, email: true, licenseNumber: true, defaultSplitPct: true, houseExclusiveSplitPct: true, personalExclusiveSplitPct: true } },
        documents: { where: { docType: "tenant_rep_agreement", status: "signed" }, select: { pdfUrl: true } },
      },
    });
    if (!onboarding) return { success: false, error: "Onboarding not found" };
    if (onboarding.status !== "completed") {
      return { success: false, error: "Onboarding must be completed before generating an invoice" };
    }

    const org = await prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { name: true, address: true, phone: true, bmsSettings: true, defaultHouseExclusiveSplitPct: true, defaultPersonalExclusiveSplitPct: true },
    });
    if (!org) return { success: false, error: "Organization not found" };

    const bmsSettings = (org.bmsSettings as Record<string, unknown>) ?? {};
    const defaultPaymentTerms = (bmsSettings.defaultPaymentTerms as string) || "Net 30";

    // Resolve commission
    const commissionPct = num(onboarding.commissionPct) || 8.33;
    const monthlyRent = additionalData.monthlyRent ?? num(onboarding.monthlyRent) ?? 0;
    const annualRent = monthlyRent * 12;
    const totalCommission = (annualRent * commissionPct) / 100;

    // Resolve split
    const exclusiveType = onboarding.exclusiveType;
    let agentSplitPct: number;
    if (exclusiveType === "brokerage") {
      agentSplitPct = onboarding.agent?.houseExclusiveSplitPct
        ? num(onboarding.agent.houseExclusiveSplitPct)
        : org.defaultHouseExclusiveSplitPct ? num(org.defaultHouseExclusiveSplitPct) : 35;
    } else {
      agentSplitPct = onboarding.agent?.personalExclusiveSplitPct
        ? num(onboarding.agent.personalExclusiveSplitPct)
        : org.defaultPersonalExclusiveSplitPct ? num(org.defaultPersonalExclusiveSplitPct) : 70;
    }
    const houseSplitPct = 100 - agentSplitPct;
    const agentPayout = totalCommission * (agentSplitPct / 100);
    const housePayout = totalCommission * (houseSplitPct / 100);

    const agentName = onboarding.agent
      ? `${onboarding.agent.firstName} ${onboarding.agent.lastName}`
      : ctx.fullName;
    const clientName = `${onboarding.clientFirstName} ${onboarding.clientLastName}`;

    const invoiceNumber = buildInvoiceNumber({
      propertyAddress: additionalData.propertyAddress,
      unit: additionalData.unit,
      moveInDate: additionalData.leaseStartDate || additionalData.closingDate || undefined,
      tenantName: clientName,
      createdAt: new Date(),
    });

    const daysMatch = defaultPaymentTerms.match(/(\d+)/);
    const netDays = daysMatch ? parseInt(daysMatch[1], 10) : 30;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + netDays);

    const result = await prisma.$transaction(async (tx) => {
      // Create auto-approved deal submission
      const submission = await tx.dealSubmission.create({
        data: {
          orgId: ctx.orgId,
          agentId: onboarding.agentId,
          agentFirstName: onboarding.agent?.firstName ?? "",
          agentLastName: onboarding.agent?.lastName ?? "",
          agentEmail: onboarding.agent?.email ?? "",
          agentLicense: onboarding.agent?.licenseNumber || null,
          propertyAddress: additionalData.propertyAddress,
          unit: additionalData.unit || null,
          state: "NY",
          dealType: (onboarding.dealType as "lease" | "sale" | "rental") || "lease",
          transactionValue: annualRent,
          closingDate: additionalData.closingDate ? new Date(additionalData.closingDate) : null,
          commissionType: "percentage",
          commissionPct: commissionPct,
          totalCommission,
          agentSplitPct,
          houseSplitPct,
          agentPayout,
          housePayout,
          clientName,
          clientEmail: onboarding.clientEmail || null,
          clientPhone: onboarding.clientPhone || null,
          exclusiveType: exclusiveType || null,
          tenantName: clientName,
          tenantEmail: onboarding.clientEmail || null,
          tenantPhone: onboarding.clientPhone || null,
          monthlyRent: monthlyRent || null,
          leaseStartDate: additionalData.leaseStartDate ? new Date(additionalData.leaseStartDate) : null,
          leaseEndDate: additionalData.leaseEndDate ? new Date(additionalData.leaseEndDate) : null,
          status: "approved",
          submissionSource: "internal",
          approvedBy: ctx.userId,
          approvedAt: new Date(),
          notes: `Auto-generated from client onboarding (${onboarding.id})`,
        },
      });

      // Create invoice
      const invoice = await tx.invoice.create({
        data: {
          orgId: ctx.orgId,
          invoiceNumber,
          dealSubmissionId: submission.id,
          agentId: onboarding.agentId,
          brokerageName: org.name,
          brokerageAddress: org.address || null,
          brokeragePhone: org.phone || null,
          brokerageEmail: (bmsSettings.companyEmail as string) || null,
          brokerageLicense: (bmsSettings.companyLicenseNumber as string) || null,
          agentName,
          agentEmail: onboarding.agent?.email || null,
          agentLicense: onboarding.agent?.licenseNumber || null,
          propertyAddress: additionalData.propertyAddress,
          dealType: (onboarding.dealType as "lease" | "sale" | "rental") || "lease",
          transactionValue: annualRent,
          closingDate: additionalData.closingDate ? new Date(additionalData.closingDate) : null,
          clientName,
          totalCommission,
          agentSplitPct,
          houseSplitPct,
          agentPayout,
          housePayout,
          paymentTerms: defaultPaymentTerms,
          dueDate,
          status: "draft",
        },
      });

      // Create transaction
      const transaction = await tx.transaction.create({
        data: {
          orgId: ctx.orgId,
          dealSubmissionId: submission.id,
          agentId: onboarding.agentId,
          invoiceId: invoice.id,
          type: "rental",
          stage: "invoice_sent",
          propertyAddress: additionalData.propertyAddress,
          propertyUnit: additionalData.unit || null,
          propertyState: "NY",
          transactionValue: annualRent,
          commissionAmount: totalCommission,
          clientName,
          clientEmail: onboarding.clientEmail || null,
          clientPhone: onboarding.clientPhone || null,
          leaseStartDate: additionalData.leaseStartDate ? new Date(additionalData.leaseStartDate) : null,
          leaseEndDate: additionalData.leaseEndDate ? new Date(additionalData.leaseEndDate) : null,
          agentSplitPct,
          agentPayoutAmount: agentPayout,
          housePayoutAmount: housePayout,
          agentPayoutStatus: "pending",
          invoiceCreatedAt: new Date(),
        },
      });

      // Update submission to invoiced
      await tx.dealSubmission.update({
        where: { id: submission.id },
        data: { status: "invoiced" },
      });

      // Attach signed tenant rep agreement PDF as file attachment
      const signedDoc = Array.isArray(onboarding.documents) ? onboarding.documents[0] : null;
      if (signedDoc?.pdfUrl) {
        await tx.fileAttachment.create({
          data: {
            orgId: ctx.orgId,
            entityType: "transaction",
            entityId: transaction.id,
            fileName: "Signed_Tenant_Rep_Agreement.pdf",
            fileType: "application/pdf",
            fileSize: 0,
            storagePath: signedDoc.pdfUrl,
            uploadedBy: ctx.userId,
          },
        });
      }

      return { submission, invoice, transaction };
    });

    // Audit logs
    logSubmissionAction(ctx.orgId, { id: ctx.userId, name: ctx.fullName, role: ctx.role }, "submitted", result.submission.id, {
      source: "client_onboarding", onboardingId,
    });
    logInvoiceAction(ctx.orgId, { id: ctx.userId, name: ctx.fullName, role: ctx.role }, "created", result.invoice.id, {
      source: "client_onboarding", onboardingId,
    });
    logTransactionAction(ctx.orgId, { id: ctx.userId, name: ctx.fullName, role: ctx.role }, "created", result.transaction.id, {
      source: "client_onboarding", onboardingId,
    });

    return {
      success: true,
      invoiceId: result.invoice.id,
      transactionId: result.transaction.id,
      submissionId: result.submission.id,
    };
  } catch (error: unknown) {
    console.error("generateInvoiceFromOnboarding error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to generate invoice" };
  }
}

// ── Storage Cleanup Helper ──────────────────────────────────

async function cleanupOnboardingStorage(pdfUrls: string[]): Promise<void> {
  if (pdfUrls.length === 0) return;
  try {
    const supabase = await createClient();
    const paths = pdfUrls
      .map((url) => {
        const match = url.match(/\/storage\/v1\/object\/public\/bms-files\/(.+)/);
        return match?.[1];
      })
      .filter(Boolean) as string[];

    if (paths.length > 0) {
      await supabase.storage.from("bms-files").remove(paths);
      console.log(`[Onboarding] Cleaned up ${paths.length} storage files`);
    }
  } catch (err) {
    console.error("[Onboarding] Storage cleanup failed:", err);
  }
}
