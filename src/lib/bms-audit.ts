"use server";

import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

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
          details: (params.details || undefined) as Prisma.InputJsonValue | undefined,
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
