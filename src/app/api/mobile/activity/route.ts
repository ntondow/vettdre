// ── GET /api/mobile/activity ───────────────────────────────────
// Returns recent activity feed for the agent.
// Query params:
//   limit=<number>  (optional, default 20, max 50)

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMobileAuth, unauthorized, serialize } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const { orgId, isAdmin, userId } = ctx;
    const url = new URL(req.url);
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10) || 20));

    // Fetch recent activities — agent sees own + system activities
    const activities = await prisma.activity.findMany({
      where: {
        orgId,
        ...(!isAdmin ? { OR: [{ userId }, { userId: null }] } : {}),
      },
      select: {
        id: true,
        type: true,
        direction: true,
        subject: true,
        body: true,
        isAiGenerated: true,
        occurredAt: true,
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        deal: {
          select: {
            id: true,
            dealValue: true,
          },
        },
      },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });

    return NextResponse.json(
      serialize({
        activities: activities.map((a) => ({
          id: a.id,
          type: a.type,
          direction: a.direction,
          subject: a.subject,
          body: a.body ? a.body.substring(0, 120) : null,
          isAi: a.isAiGenerated,
          occurredAt: a.occurredAt,
          contactId: a.contact?.id ?? null,
          contactName: a.contact
            ? `${a.contact.firstName} ${a.contact.lastName}`.trim()
            : null,
          dealValue: a.deal?.dealValue ? Number(a.deal.dealValue) : null,
        })),
      })
    );
  } catch (error: unknown) {
    console.error("[mobile/activity] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity" },
      { status: 500 }
    );
  }
}
