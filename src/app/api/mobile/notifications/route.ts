// ── GET /api/mobile/notifications ──────────────────────────────
// Returns notifications for the authenticated user.
// Aggregates recent activity across onboardings, deals, invoices, and tasks.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMobileAuth, unauthorized, serialize } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

interface MobileNotification {
  id: string;
  type: string;
  body: string;
  timestamp: string;
  read: boolean;
  entityId?: string;
  entityType?: string;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const { orgId, userId, agentId, isAdmin } = ctx;
    const agentFilter = isAdmin ? {} : { agentId: agentId || undefined };

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Load persisted read IDs from user prefs
    const userPrefs = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPrefs: true },
    });
    const prefs =
      (userPrefs?.notificationPrefs as Record<string, unknown>) || {};
    const readIds = new Set<string>(
      Array.isArray(prefs.mobileReadIds) ? (prefs.mobileReadIds as string[]) : []
    );

    // Fetch recent events in parallel
    const [
      recentSignings,
      recentSubmissions,
      overdueTasks,
      expiringCompliance,
      recentInvoices,
    ] = await Promise.all([
      // Client signing events (from audit logs) — scoped to agent
      prisma.signingAuditLog.findMany({
        where: {
          onboarding: {
            orgId,
            ...(isAdmin ? {} : agentId ? { agentId } : { agentId: "__none__" }),
          },
          action: { in: ["document_signed", "all_documents_signed", "invite_viewed"] },
          createdAt: { gte: thirtyDaysAgo },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          onboarding: {
            select: {
              id: true,
              clientFirstName: true,
              clientLastName: true,
              agentId: true,
            },
          },
        },
      }),

      // Recent deal submissions
      prisma.dealSubmission.findMany({
        where: {
          orgId,
          updatedAt: { gte: thirtyDaysAgo },
          status: { in: ["submitted", "approved", "rejected"] },
          ...agentFilter,
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: {
          id: true,
          propertyAddress: true,
          status: true,
          updatedAt: true,
        },
      }),

      // Overdue tasks
      prisma.task.findMany({
        where: {
          orgId,
          assignedTo: userId,
          status: { in: ["pending", "in_progress"] },
          dueAt: { lt: now },
        },
        orderBy: { dueAt: "asc" },
        take: 10,
        select: {
          id: true,
          title: true,
          dueAt: true,
        },
      }),

      // Expiring compliance docs (admin only)
      isAdmin
        ? prisma.complianceDocument.findMany({
            where: {
              orgId,
              expiryDate: {
                gte: now,
                lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
              },
            },
            orderBy: { expiryDate: "asc" },
            take: 5,
            include: {
              agent: { select: { firstName: true, lastName: true } },
            },
          })
        : Promise.resolve([]),

      // Recent invoice status changes
      prisma.invoice.findMany({
        where: {
          orgId,
          updatedAt: { gte: thirtyDaysAgo },
          ...agentFilter,
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          totalCommission: true,
          updatedAt: true,
          paidDate: true,
        },
      }),
    ]);

    // Build unified notification list
    const notifications: MobileNotification[] = [];

    // Signing events (already scoped to agent at query level)
    for (const log of recentSignings) {
      const clientName = `${log.onboarding.clientFirstName} ${log.onboarding.clientLastName}`;
      let type = "client_viewed";
      let body = `${clientName} viewed their documents`;

      if (log.action === "document_signed") {
        type = "client_signed";
        body = `${clientName} signed a document`;
      } else if (log.action === "all_documents_signed") {
        type = "deal_approved";
        body = `${clientName} completed all documents!`;
      }

      notifications.push({
        id: log.id,
        type,
        body,
        timestamp: log.createdAt.toISOString(),
        read: readIds.has(log.id),
        entityId: log.onboarding.id,
        entityType: "onboarding",
      });
    }

    // Deal submission events
    for (const sub of recentSubmissions) {
      const type =
        sub.status === "approved"
          ? "deal_approved"
          : sub.status === "rejected"
            ? "stage_change"
            : "new_lead";
      notifications.push({
        id: sub.id,
        type,
        body: `Deal at ${sub.propertyAddress || "Unknown"} — ${sub.status}`,
        timestamp: sub.updatedAt.toISOString(),
        read: readIds.has(sub.id) || sub.status !== "submitted",
        entityId: sub.id,
        entityType: "deal_submission",
      });
    }

    // Overdue tasks
    for (const task of overdueTasks) {
      notifications.push({
        id: task.id,
        type: "task_overdue",
        body: `Overdue: ${task.title}`,
        timestamp: task.dueAt?.toISOString() || now.toISOString(),
        read: readIds.has(task.id),
        entityId: task.id,
        entityType: "task",
      });
    }

    // Expiring compliance
    for (const doc of expiringCompliance) {
      const agentName =
        "agent" in doc && doc.agent
          ? `${(doc.agent as { firstName: string; lastName: string }).firstName} ${(doc.agent as { firstName: string; lastName: string }).lastName}`
          : "Agent";
      notifications.push({
        id: doc.id,
        type: "compliance_expiry",
        body: `${agentName}'s ${doc.docType} expires ${doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : "soon"}`,
        timestamp: now.toISOString(),
        read: readIds.has(doc.id),
        entityId: doc.id,
        entityType: "compliance",
      });
    }

    // Invoice events
    for (const inv of recentInvoices) {
      if (inv.status === "paid" && inv.paidDate) {
        notifications.push({
          id: inv.id,
          type: "deal_paid",
          body: `Invoice ${inv.invoiceNumber || ""} paid — $${Number(inv.totalCommission || 0).toLocaleString()}`,
          timestamp: inv.paidDate.toISOString(),
          read: readIds.has(inv.id),
          entityId: inv.id,
          entityType: "invoice",
        });
      }
    }

    // Sort by timestamp (newest first) and limit
    notifications.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return NextResponse.json(serialize(notifications.slice(0, 50)));
  } catch (error: unknown) {
    console.error("[mobile/notifications] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}
