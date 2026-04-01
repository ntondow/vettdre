// ── GET /api/mobile/clients ────────────────────────────────────
// Returns client onboardings for the authenticated agent.
// Thin wrapper around the same Prisma queries as the web app.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMobileAuth, unauthorized, serialize } from "@/lib/mobile-auth";
import { hasPermission } from "@/lib/bms-permissions";
import type { BrokerageRoleType } from "@/lib/bms-types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const { orgId, brokerageRole, agentId } = ctx;
    const role = (brokerageRole || "agent") as BrokerageRoleType;

    const canViewAll = hasPermission(role, "client_onboarding_view_all");
    const canViewOwn = hasPermission(role, "client_onboarding_view_own");
    if (!canViewAll && !canViewOwn) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const where: Record<string, unknown> = { orgId };
    if (!canViewAll && agentId) where.agentId = agentId;

    // Status filter from query params
    const status = req.nextUrl.searchParams.get("status");
    if (status) where.status = status;

    const onboardings = await prisma.clientOnboarding.findMany({
      where,
      include: {
        agent: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        documents: {
          select: { id: true, docType: true, status: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Transform for mobile consumption
    const clients = onboardings.map((o) => ({
      id: o.id,
      clientFirstName: o.clientFirstName,
      clientLastName: o.clientLastName,
      clientEmail: o.clientEmail,
      clientPhone: o.clientPhone,
      status: o.status,
      sentVia: o.sentVia,
      sentAt: o.sentAt,
      completedAt: o.completedAt,
      createdAt: o.createdAt,
      agentName: o.agent
        ? `${o.agent.firstName} ${o.agent.lastName}`
        : null,
      documents: o.documents.map((d) => ({
        id: d.id,
        docType: d.docType,
        status: d.status,
      })),
      allDocsSigned: o.documents.every((d) => d.status === "signed"),
    }));

    return NextResponse.json(serialize(clients));
  } catch (error: unknown) {
    console.error("[mobile/clients] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch clients" },
      { status: 500 }
    );
  }
}
