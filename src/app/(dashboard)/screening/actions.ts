"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/bms-permissions";
import type { BrokerageRoleType } from "@/lib/bms-types";
import { generateAccessToken, isValidEmail, isValidPhone, serialize } from "@/lib/screening/utils";
import { sendScreeningInviteEmail, sendScreeningInviteSMS } from "@/lib/screening/notifications";
import { getOrgTwilioNumber } from "@/lib/onboarding-notifications";
import { STATUS_CONFIG } from "@/lib/screening/constants";
import { dispatchAutomationSafe } from "@/lib/automation-dispatcher";

// ── Auth Helper ─────────────────────────────────────────────

interface AuthContext {
  userId: string;
  orgId: string;
  role: BrokerageRoleType;
  fullName: string;
  email: string;
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
    role,
    fullName: user.fullName || user.email,
    email: user.email,
  };
}

// ── List Applications ───────────────────────────────────────

export interface ScreeningListItem {
  id: string;
  accessToken: string;
  propertyAddress: string;
  unitNumber: string | null;
  tier: string;
  status: string;
  riskScore: number | null;
  recommendation: string | null;
  createdAt: string;
  completedAt: string | null;
  applicantCount: number;
  primaryApplicant: { firstName: string; lastName: string; email: string } | null;
  agentName: string | null;
}

export async function listApplications(
  filters?: { status?: string; page?: number; limit?: number }
): Promise<{ items: ScreeningListItem[]; total: number }> {
  const ctx = await getAuthContext();
  if (!ctx) return { items: [], total: 0 };

  const canViewAll = hasPermission(ctx.role, "screening_view_all");
  const page = Math.max(1, filters?.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters?.limit ?? 25));
  const skip = (page - 1) * limit;

  const where: any = { orgId: ctx.orgId };
  if (!canViewAll) where.agentUserId = ctx.userId;
  if (filters?.status && filters.status !== "all") where.status = filters.status;

  const [items, total] = await Promise.all([
    prisma.screeningApplication.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        applicants: {
          where: { role: "main" },
          select: { firstName: true, lastName: true, email: true },
          take: 1,
        },
        agent: { select: { fullName: true } },
        _count: { select: { applicants: true } },
      },
    }),
    prisma.screeningApplication.count({ where }),
  ]);

  return serialize({
    items: items.map((app: any) => ({
      id: app.id,
      accessToken: app.accessToken,
      propertyAddress: app.propertyAddress,
      unitNumber: app.unitNumber,
      tier: app.screeningTier,
      status: app.status,
      riskScore: app.vettdreRiskScore ? Number(app.vettdreRiskScore) : null,
      recommendation: app.riskRecommendation,
      createdAt: app.createdAt.toISOString(),
      completedAt: app.completedAt?.toISOString() ?? null,
      applicantCount: app._count.applicants,
      primaryApplicant: app.applicants[0] ?? null,
      agentName: app.agent?.fullName ?? null,
    })),
    total,
  });
}

// ── Get Application Detail ──────────────────────────────────

export async function getApplication(id: string): Promise<any | null> {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const app = await prisma.screeningApplication.findFirst({
    where: {
      id,
      orgId: ctx.orgId,
      ...(!hasPermission(ctx.role, "screening_view_all") ? { agentUserId: ctx.userId } : {}),
    },
    include: {
      applicants: {
        include: {
          signatures: true,
          plaidConnections: { select: { id: true, institutionName: true, status: true, createdAt: true } },
          creditReports: { select: { id: true, bureau: true, creditScore: true, evictionCount: true, criminalCount: true, hasActiveBankruptcy: true, createdAt: true } },
          documents: { include: { analysis: true } },
        },
      },
      wellnessProfile: true,
      payments: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "desc" }, take: 50 },
      agent: { select: { id: true, fullName: true, email: true } },
      organization: { select: { id: true, name: true } },
    },
  });

  if (!app) return null;
  return serialize(app);
}

// ── Create Application ──────────────────────────────────────

export interface CreateApplicationInput {
  propertyAddress: string;
  unitNumber?: string;
  monthlyRent: number;
  tier: "base" | "enhanced";
  applicants: Array<{
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    role: "main" | "co_applicant" | "guarantor" | "occupant";
  }>;
}

export async function createApplication(
  input: CreateApplicationInput
): Promise<{ id: string; accessToken: string } | { error: string }> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Not authenticated" };
  if (!hasPermission(ctx.role, "screening_create")) return { error: "Permission denied" };

  if (!input.propertyAddress?.trim()) return { error: "Property address is required" };
  if (!input.monthlyRent || input.monthlyRent <= 0) return { error: "Monthly rent must be positive" };
  if (!input.applicants?.length) return { error: "At least one applicant is required" };

  const hasMain = input.applicants.some(a => a.role === "main");
  if (!hasMain) return { error: "A primary applicant is required" };

  // Validate email and phone formats
  for (const a of input.applicants) {
    if (!a.firstName?.trim() || !a.lastName?.trim()) return { error: "All applicants must have a first and last name" };
    if (!isValidEmail(a.email)) return { error: `Invalid email address: ${a.email}` };
    if (a.phone && !isValidPhone(a.phone)) return { error: `Invalid phone number for ${a.firstName} ${a.lastName}` };
  }

  const accessToken = generateAccessToken();

  const app = await prisma.screeningApplication.create({
    data: {
      orgId: ctx.orgId,
      agentUserId: ctx.userId,
      propertyAddress: input.propertyAddress.trim(),
      unitNumber: input.unitNumber?.trim() || null,
      monthlyRent: input.monthlyRent,
      screeningTier: input.tier,
      accessToken,
      status: "draft",
      applicants: {
        create: input.applicants.map(a => ({
          firstName: a.firstName.trim(),
          lastName: a.lastName.trim(),
          email: a.email.trim().toLowerCase(),
          phone: a.phone?.trim() || null,
          role: a.role,
          status: "invited",
        })),
      },
    },
  });

  // Log event
  await prisma.screeningEvent.create({
    data: {
      applicationId: app.id,
      agentUserId: ctx.userId,
      eventType: "created",
      eventData: {
        tier: input.tier,
        applicantCount: input.applicants.length,
        createdBy: ctx.fullName,
      },
    },
  });

  // Note: contactId is always null at creation time — contacts get linked
  // later by the pipeline via linkOrCreateContact() after screening completes.

  return { id: app.id, accessToken };
}

// ── Send Invite ─────────────────────────────────────────────

export async function sendInvite(
  applicationId: string,
  method: "email" | "sms" | "email+sms"
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const app = await prisma.screeningApplication.findFirst({
    where: { id: applicationId, orgId: ctx.orgId },
    include: {
      applicants: true,
      organization: { select: { name: true } },
    },
  });

  if (!app) return { success: false, error: "Application not found" };

  // Only allow invites for draft or invited applications
  if (!["draft", "invited"].includes(app.status)) {
    return { success: false, error: `Cannot send invites for applications in "${app.status}" status` };
  }

  // Validate delivery method
  if (!["email", "sms", "email+sms"].includes(method)) {
    return { success: false, error: "Invalid delivery method" };
  }

  const appUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://app.vettdre.com"}/screen/${app.accessToken}`;
  const sendErrors: string[] = [];

  for (const applicant of app.applicants) {
    const channels = method.split("+");

    try {
      if (channels.includes("email") && applicant.email) {
        await sendScreeningInviteEmail({
          applicantEmail: applicant.email,
          applicantFirstName: applicant.firstName,
          agentName: ctx.fullName,
          propertyAddress: app.propertyAddress,
          unitNumber: app.unitNumber || undefined,
          screeningUrl: appUrl,
        });
      }

      if (channels.includes("sms") && applicant.phone) {
        const fromNumber = await getOrgTwilioNumber(ctx.orgId, ctx.userId);
        if (fromNumber) {
          await sendScreeningInviteSMS({
            applicantPhone: applicant.phone,
            agentName: ctx.fullName,
            propertyAddress: app.propertyAddress,
            screeningUrl: appUrl,
            fromNumber,
          });
        }
      }
    } catch (err) {
      const name = `${applicant.firstName} ${applicant.lastName}`.trim();
      const msg = err instanceof Error ? err.message : String(err);
      sendErrors.push(`${name}: ${msg}`);
      console.error(`[Screening] Failed to notify applicant ${applicant.email || applicant.phone}:`, err);
      // Continue sending to remaining applicants
    }
  }

  // Update status to invited if still draft
  if (app.status === "draft") {
    await prisma.screeningApplication.update({
      where: { id: applicationId },
      data: { status: "invited", inviteSentAt: new Date() },
    });
  }

  await prisma.screeningEvent.create({
    data: {
      applicationId,
      agentUserId: ctx.userId,
      eventType: "invited",
      eventData: { method, applicantCount: app.applicants.length, sentBy: ctx.fullName, failedCount: sendErrors.length },
    },
  });

  // Report partial failures
  if (sendErrors.length > 0 && sendErrors.length >= app.applicants.length) {
    return { success: false, error: `Failed to send invites: ${sendErrors.join("; ")}` };
  }
  if (sendErrors.length > 0) {
    return { success: true, error: `Sent ${app.applicants.length - sendErrors.length}/${app.applicants.length} invites. Failed: ${sendErrors.join("; ")}` };
  }

  return { success: true };
}

// ── Update Decision ─────────────────────────────────────────

export async function updateDecision(
  applicationId: string,
  decision: "approved" | "conditional" | "denied",
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: "Not authenticated" };
  if (!hasPermission(ctx.role, "screening_decide")) return { success: false, error: "Permission denied" };

  const app = await prisma.screeningApplication.findFirst({
    where: { id: applicationId, orgId: ctx.orgId },
  });
  if (!app) return { success: false, error: "Application not found" };
  if (app.status !== "complete") return { success: false, error: "Application is not yet complete" };

  await prisma.screeningApplication.update({
    where: { id: applicationId },
    data: {
      status: decision,
      decisionNotes: notes || null,
      decisionAt: new Date(),
    },
  });

  await prisma.screeningEvent.create({
    data: {
      applicationId,
      agentUserId: ctx.userId,
      eventType: "decision_made",
      eventData: { decision, notes, decidedBy: ctx.fullName },
    },
  });

  // Create activity on linked contact
  if (app.contactId) {
    const { createScreeningActivity } = await import("@/lib/screening/integration");
    await createScreeningActivity(
      ctx.orgId,
      app.contactId,
      ctx.userId,
      `Screening decision: ${decision.toUpperCase()} by ${ctx.fullName}`,
      { screeningApplicationId: applicationId, decision, notes: notes || null },
    ).catch((err) => console.error("[Screening] Activity creation error:", err));
  }

  return { success: true };
}

// ── Add Applicant ───────────────────────────────────────────

export async function addApplicant(
  applicationId: string,
  data: { firstName: string; lastName: string; email: string; phone?: string; role: "main" | "co_applicant" | "guarantor" | "occupant" }
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: "Not authenticated" };
  if (!hasPermission(ctx.role, "screening_create")) return { success: false, error: "Permission denied" };

  const app = await prisma.screeningApplication.findFirst({
    where: { id: applicationId, orgId: ctx.orgId },
  });
  if (!app) return { success: false, error: "Application not found" };
  if (!["draft", "invited", "in_progress"].includes(app.status)) {
    return { success: false, error: "Cannot add applicants at this stage" };
  }

  await prisma.screeningApplicant.create({
    data: {
      applicationId,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      email: data.email.trim().toLowerCase(),
      phone: data.phone?.trim() || null,
      role: data.role,
      status: "invited",
    },
  });

  await prisma.screeningEvent.create({
    data: {
      applicationId,
      agentUserId: ctx.userId,
      eventType: "applicant_added",
      eventData: { role: data.role, email: data.email, addedBy: ctx.fullName },
    },
  });

  return { success: true };
}

// ── Withdraw Application ────────────────────────────────────

export async function withdrawApplication(
  applicationId: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: "Not authenticated" };
  if (!hasPermission(ctx.role, "screening_create")) return { success: false, error: "Permission denied" };

  const app = await prisma.screeningApplication.findFirst({
    where: { id: applicationId, orgId: ctx.orgId },
  });
  if (!app) return { success: false, error: "Application not found" };
  if (["approved", "conditional", "denied", "withdrawn"].includes(app.status)) {
    return { success: false, error: "Cannot withdraw application after a decision has been made" };
  }

  await prisma.screeningApplication.update({
    where: { id: applicationId },
    data: { status: "withdrawn" },
  });

  await prisma.screeningEvent.create({
    data: {
      applicationId,
      agentUserId: ctx.userId,
      eventType: "withdrawn",
      eventData: { withdrawnBy: ctx.fullName },
    },
  });

  return { success: true };
}

// ── Get Stats ───────────────────────────────────────────────

export interface ScreeningStats {
  total: number;
  pending: number;
  processing: number;
  complete: number;
  approved: number;
  denied: number;
  avgScore: number | null;
}

export async function getScreeningStats(): Promise<ScreeningStats> {
  const ctx = await getAuthContext();
  if (!ctx) return { total: 0, pending: 0, processing: 0, complete: 0, approved: 0, denied: 0, avgScore: null };

  const where: any = { orgId: ctx.orgId };
  if (!hasPermission(ctx.role, "screening_view_all")) where.agentUserId = ctx.userId;

  const [total, pending, processing, complete, approved, denied, scoreAgg] = await Promise.all([
    prisma.screeningApplication.count({ where }),
    prisma.screeningApplication.count({ where: { ...where, status: { in: ["draft", "invited", "in_progress", "pending_payment"] } } }),
    prisma.screeningApplication.count({ where: { ...where, status: "processing" } }),
    prisma.screeningApplication.count({ where: { ...where, status: "complete" } }),
    prisma.screeningApplication.count({ where: { ...where, status: "approved" } }),
    prisma.screeningApplication.count({ where: { ...where, status: "denied" } }),
    prisma.screeningApplication.aggregate({ where: { ...where, vettdreRiskScore: { not: null } }, _avg: { vettdreRiskScore: true } }),
  ]);

  return {
    total,
    pending,
    processing,
    complete,
    approved,
    denied,
    avgScore: scoreAgg._avg.vettdreRiskScore ? Number(scoreAgg._avg.vettdreRiskScore) : null,
  };
}

// ── Get Report Download URL ────────────────────────────────

export async function getReportDownloadUrl(
  applicationId: string
): Promise<{ url: string; fileName: string } | { error: string }> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Not authenticated" };

  const app = await prisma.screeningApplication.findFirst({
    where: {
      id: applicationId,
      orgId: ctx.orgId,
      ...(!hasPermission(ctx.role, "screening_view_all") ? { agentUserId: ctx.userId } : {}),
    },
    select: {
      reportPdfPath: true,
      propertyAddress: true,
    },
  });

  if (!app) return { error: "Application not found" };
  if (!app.reportPdfPath) return { error: "Report not yet generated" };

  // Generate signed URL via service role client
  const { createClient: createSupabaseAdmin } = await import("@supabase/supabase-js");
  const admin = createSupabaseAdmin(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
  );

  const { data, error } = await admin.storage
    .from("screening-reports")
    .createSignedUrl(app.reportPdfPath, 300, { download: true });

  if (error || !data?.signedUrl) {
    console.error("[Screening] Signed URL error:", error);
    return { error: "Failed to generate download link" };
  }

  const fileName = `VettdRE_Screening_${app.propertyAddress.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 40)}.pdf`;
  return { url: data.signedUrl, fileName };
}

// ── Billing: Get Card on File Status ───────────────────────

export interface CardOnFile {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface BillingStatus {
  hasCard: boolean;
  card: CardOnFile | null;
  isAdmin: boolean;
}

export async function getScreeningBillingStatus(): Promise<BillingStatus> {
  const ctx = await getAuthContext();
  if (!ctx) return { hasCard: false, card: null, isAdmin: false };

  const isAdmin = hasPermission(ctx.role, "screening_manage");

  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: { stripeCustomerId: true, stripeDefaultPaymentMethod: true },
  });
  if (!org?.stripeDefaultPaymentMethod || !org.stripeCustomerId) {
    return { hasCard: false, card: null, isAdmin };
  }

  try {
    const { getStripe } = await import("@/lib/stripe");
    const pm = await getStripe().paymentMethods.retrieve(org.stripeDefaultPaymentMethod);
    if (pm.card) {
      return {
        hasCard: true,
        card: {
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year,
        },
        isAdmin,
      };
    }
  } catch (err: any) {
    console.warn("[Screening Billing] Failed to retrieve PM:", err);
    // Clean up stale reference if PM was deleted in Stripe
    if (err?.statusCode === 404 || err?.code === "resource_missing") {
      await prisma.organization.update({
        where: { id: ctx.orgId },
        data: { stripeDefaultPaymentMethod: null },
      });
    }
  }

  return { hasCard: false, card: null, isAdmin };
}

// ── Billing: Get Charge History ────────────────────────────

export interface ScreeningCharge {
  id: string;
  applicationId: string;
  propertyAddress: string;
  applicantName: string;
  payerType: string;
  paymentType: string;
  amountCents: number;
  status: string;
  paidAt: string | null;
  createdAt: string;
}

export async function getScreeningChargeHistory(): Promise<ScreeningCharge[]> {
  const ctx = await getAuthContext();
  if (!ctx) return [];

  if (!hasPermission(ctx.role, "screening_manage")) return [];

  const payments = await prisma.screeningPayment.findMany({
    where: { organizationId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      application: {
        select: {
          id: true,
          propertyAddress: true,
          applicants: {
            where: { role: "main" },
            take: 1,
            select: { firstName: true, lastName: true },
          },
        },
      },
    },
  });

  return payments.map((p) => {
    const mainApplicant = p.application.applicants[0];
    return {
      id: p.id,
      applicationId: p.applicationId,
      propertyAddress: p.application.propertyAddress,
      applicantName: mainApplicant
        ? `${mainApplicant.firstName} ${mainApplicant.lastName}`
        : "Unknown",
      payerType: p.payerType,
      paymentType: p.paymentType,
      amountCents: p.amountCents,
      status: p.status,
      paidAt: p.paidAt?.toISOString() || null,
      createdAt: p.createdAt.toISOString(),
    };
  });
}

// ── Billing: Remove Card ───────────────────────────────────

export async function removeScreeningCard(): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  if (!hasPermission(ctx.role, "screening_manage")) {
    return { success: false, error: "Only admins can manage billing" };
  }

  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: { stripeCustomerId: true, stripeDefaultPaymentMethod: true },
  });

  if (org?.stripeDefaultPaymentMethod) {
    try {
      const { getStripe } = await import("@/lib/stripe");
      await getStripe().paymentMethods.detach(org.stripeDefaultPaymentMethod);
    } catch (err: any) {
      // Only proceed with DB cleanup if PM is already gone (404) — otherwise report failure
      if (err?.statusCode === 404 || err?.code === "resource_missing") {
        console.warn("[Screening Billing] PM already deleted in Stripe, clearing DB reference");
      } else {
        console.error("[Screening Billing] Failed to detach PM:", err);
        return { success: false, error: "Failed to remove payment method from Stripe" };
      }
    }
  }

  await prisma.organization.update({
    where: { id: ctx.orgId },
    data: { stripeDefaultPaymentMethod: null },
  });

  return { success: true };
}
