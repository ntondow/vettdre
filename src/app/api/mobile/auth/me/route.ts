// ── GET /api/mobile/auth/me ──────────────────────────────────
// Returns the authenticated user's profile and org in a consistent shape.
// Used by the mobile auth context to hydrate user state after login.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMobileAuth, unauthorized, serialize } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        plan: true,
        title: true,
        phone: true,
        avatarUrl: true,
        orgId: true,
        isApproved: true,
        isActive: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const org = await prisma.organization.findUnique({
      where: { id: user.orgId },
      select: {
        id: true,
        name: true,
        slug: true,
        tier: true,
      },
    });

    return NextResponse.json(
      serialize({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          plan: user.plan,
          title: user.title,
          phone: user.phone,
          avatarUrl: user.avatarUrl,
          orgId: user.orgId,
          isApproved: user.isApproved,
          isActive: user.isActive,
        },
        org: org
          ? {
              id: org.id,
              name: org.name,
              slug: org.slug,
              tier: org.tier,
            }
          : null,
      })
    );
  } catch (error: unknown) {
    console.error("[mobile/auth/me] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    );
  }
}
