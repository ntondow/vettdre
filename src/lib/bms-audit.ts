"use server";

import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getCurrentOrgContext } from "@/lib/auth-context";

// ── Types ────────────────────────────────────────────────────

interface ActorInfo {
  id?: string;
  name?: string;
  role?: string;
}

interface LogParams {
  orgId: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
}

// ── Core Logger ──────────────────────────────────────────────

export async function logAction(params: LogParams): Promise<void> {
  try {
    // Stamp override metadata when a super_admin is acting via ?as_org=...:
    // the orgId we write is the *effective* (target) org so org owners see
    // changes against their own data, but `details._override` records that
    // a super_admin from another org actually performed the action. Keeps
    // the cross-tenant trail auditable without splitting the row across
    // two orgs.
    let overrideDetails: Record<string, unknown> | undefined;
    try {
      const ctx = await getCurrentOrgContext();
      if (ctx?.isOverride) {
        overrideDetails = {
          _override: {
            asOrg: true,
            realOrgId: ctx.realOrgId,
            realOrgName: ctx.realOrgName,
            realActorId: ctx.userId,
            realActorName: ctx.userName,
            realActorRole: ctx.userRole,
          },
        };
      }
    } catch {
      // ctx lookup is best-effort; never block audit writes on it.
    }

    const mergedDetails = overrideDetails || params.details
      ? { ...(params.details || {}), ...(overrideDetails || {}) }
      : undefined;

    prisma.auditLog
      .create({
        data: {
          orgId: params.orgId,
          userId: params.actorId || null,
          actorName: params.actorName || null,
          actorRole: params.actorRole || null,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId || null,
          details: (mergedDetails || undefined) as Prisma.InputJsonValue | undefined,
          previousValue: (params.previousValue || undefined) as Prisma.InputJsonValue | undefined,
          newValue: (params.newValue || undefined) as Prisma.InputJsonValue | undefined,
        },
      })
      .catch((err) => console.error("Audit log write failed:", err));
  } catch (err) {
    console.error("Audit log error:", err);
  }
}

// ── Convenience Functions ────────────────────────────────────

export async function logSubmissionAction(
  orgId: string,
  actor: ActorInfo,
  action: string,
  submissionId: string,
  details?: Record<string, unknown>,
): Promise<void> {
  logAction({
    orgId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    entityType: "deal_submission",
    entityId: submissionId,
    details,
  });
}

export async function logInvoiceAction(
  orgId: string,
  actor: ActorInfo,
  action: string,
  invoiceId: string,
  details?: Record<string, unknown>,
): Promise<void> {
  logAction({
    orgId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    entityType: "invoice",
    entityId: invoiceId,
    details,
  });
}

export async function logPaymentAction(
  orgId: string,
  actor: ActorInfo,
  action: string,
  paymentId: string,
  details?: Record<string, unknown>,
): Promise<void> {
  logAction({
    orgId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    entityType: "payment",
    entityId: paymentId,
    details,
  });
}

export async function logAgentAction(
  orgId: string,
  actor: ActorInfo,
  action: string,
  agentId: string,
  details?: Record<string, unknown>,
): Promise<void> {
  logAction({
    orgId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    entityType: "agent",
    entityId: agentId,
    details,
  });
}

export async function logComplianceAction(
  orgId: string,
  actor: ActorInfo,
  action: string,
  docId: string,
  details?: Record<string, unknown>,
): Promise<void> {
  logAction({
    orgId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    entityType: "compliance_doc",
    entityId: docId,
    details,
  });
}

export async function logTransactionAction(
  orgId: string,
  actor: ActorInfo,
  action: string,
  transactionId: string,
  details?: Record<string, unknown>,
): Promise<void> {
  logAction({
    orgId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    entityType: "transaction",
    entityId: transactionId,
    details,
  });
}

export async function logListingAction(
  orgId: string,
  actor: ActorInfo,
  action: string,
  listingId: string,
  details?: Record<string, unknown>,
): Promise<void> {
  logAction({
    orgId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    entityType: "listing",
    entityId: listingId,
    details,
  });
}

export async function logPropertyAction(
  orgId: string,
  actor: ActorInfo,
  action: string,
  propertyId: string,
  details?: Record<string, unknown>,
): Promise<void> {
  logAction({
    orgId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    entityType: "property",
    entityId: propertyId,
    details,
  });
}

export async function logGoalAction(
  orgId: string,
  actor: ActorInfo,
  action: string,
  goalId: string,
  details?: Record<string, unknown>,
): Promise<void> {
  logAction({
    orgId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    entityType: "agent_goal",
    entityId: goalId,
    details,
  });
}

export async function logSettingsAction(
  orgId: string,
  actor: ActorInfo,
  action: string,
  details?: Record<string, unknown>,
): Promise<void> {
  logAction({
    orgId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    entityType: "settings",
    details,
  });
}
