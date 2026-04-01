// ── GET /api/mobile/clients/[id] ───────────────────────────────
// Returns detailed client onboarding record with documents and audit log.

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
            status: true,
            signedAt: true,
            fileUrl: true,
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
