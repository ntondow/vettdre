// ── /api/mobile/clients/[id] ──────────────────────────────────
// GET: Returns detailed client onboarding record with documents and audit log
// POST: Actions — void, archive
// DELETE: Permanently delete an onboarding

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMobileAuth, unauthorized, serialize } from "@/lib/mobile-auth";
import { hasPermission } from "@/lib/bms-permissions";
import type { BrokerageRoleType } from "@/lib/bms-types";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const { id } = await params;
    const { orgId, brokerageRole, agentId } = ctx;
    const role = (brokerageRole || "agent") as BrokerageRoleType;

    const canViewAll = hasPermission(role, "client_onboarding_view_all");

    const onboarding = await prisma.clientOnboarding.findFirst({
      where: {
        id,
        orgId,
        ...(!canViewAll && agentId ? { agentId } : {}),
      },
      include: {
        agent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        documents: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            docType: true,
            title: true,
            status: true,
            signedAt: true,
            pdfUrl: true,
            sortOrder: true,
          },
        },
        auditLogs: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            action: true,
            actorType: true,
            metadata: true,
            createdAt: true,
          },
        },
      },
    });

    if (!onboarding) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(serialize(onboarding));
  } catch (error: unknown) {
    console.error("[mobile/clients/[id]] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch client" },
      { status: 500 }
    );
  }
}

// ── POST: void or archive ─────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const { id } = await params;
    const { orgId, userId, brokerageRole } = ctx;
    const role = (brokerageRole || "agent") as BrokerageRoleType;

    if (!hasPermission(role, "client_onboarding_void")) {
      return NextResponse.json(
        { error: "You don't have permission to modify onboardings" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { action, reason } = body; // action: "void" | "archive"

    if (!action || !["void", "archive"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'void' or 'archive'" },
        { status: 400 }
      );
    }

    const onboarding = await prisma.clientOnboarding.findFirst({
      where: { id, orgId },
    });

    if (!onboarding) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (action === "void") {
      const voidableStatuses = ["draft", "pending", "partially_signed"];
      if (!voidableStatuses.includes(onboarding.status)) {
        return NextResponse.json(
          { error: `Cannot void onboarding with status "${onboarding.status}"` },
          { status: 400 }
        );
      }

      await prisma.clientOnboarding.update({
        where: { id },
        data: { status: "voided", notes: reason ? `Voided: ${reason}` : "Voided from mobile" },
      });

      // Audit log
      await prisma.signingAuditLog.create({
        data: {
          onboardingId: id,
          action: "voided",
          actorType: "agent",
          metadata: { reason, voidedBy: userId, source: "mobile" },
        },
      });

      return NextResponse.json({ success: true, action: "voided" });
    }

    if (action === "archive") {
      const archivableStatuses = ["completed", "voided", "expired"];
      if (!archivableStatuses.includes(onboarding.status)) {
        return NextResponse.json(
          { error: `Cannot archive onboarding with status "${onboarding.status}"` },
          { status: 400 }
        );
      }

      const existingNotes = onboarding.notes || "";
      await prisma.clientOnboarding.update({
        where: { id },
        data: {
          notes: existingNotes.startsWith("[ARCHIVED]")
            ? existingNotes
            : `[ARCHIVED] ${existingNotes}`.trim(),
        },
      });

      await prisma.signingAuditLog.create({
        data: {
          onboardingId: id,
          action: "archived",
          actorType: "agent",
          metadata: { archivedBy: userId, source: "mobile" },
        },
      });

      return NextResponse.json({ success: true, action: "archived" });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    console.error("[mobile/clients/[id]] POST error:", error);
    return NextResponse.json(
      { error: "Failed to update onboarding" },
      { status: 500 }
    );
  }
}

// ── DELETE: permanently remove ────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const { id } = await params;
    const { orgId, brokerageRole } = ctx;
    const role = (brokerageRole || "agent") as BrokerageRoleType;

    if (!hasPermission(role, "client_onboarding_void")) {
      return NextResponse.json(
        { error: "You don't have permission to delete onboardings" },
        { status: 403 }
      );
    }

    const onboarding = await prisma.clientOnboarding.findFirst({
      where: { id, orgId },
    });

    if (!onboarding) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Cascade delete: audit logs → documents → onboarding
    await prisma.signingAuditLog.deleteMany({ where: { onboardingId: id } });
    await prisma.onboardingDocument.deleteMany({ where: { onboardingId: id } });
    await prisma.clientOnboarding.delete({ where: { id } });

    return NextResponse.json({ success: true, action: "deleted" });
  } catch (error: unknown) {
    console.error("[mobile/clients/[id]] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete onboarding" },
      { status: 500 }
    );
  }
}
