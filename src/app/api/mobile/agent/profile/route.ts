// ── GET/PATCH /api/mobile/agent/profile ────────────────────────
// GET: Returns the authenticated agent's profile, org info, and stats.
// PATCH: Updates editable profile fields (name, phone, title, license).

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMobileAuth, unauthorized, serialize } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    // If agent exists, fetch full agent record with stats
    if (ctx.agentId) {
      const agent = await prisma.brokerAgent.findUnique({
        where: { id: ctx.agentId },
        include: {
          organization: {
            select: { id: true, name: true, slug: true, tier: true },
          },
          user: {
            select: { id: true, email: true, fullName: true, title: true, phone: true },
          },
          badges: { orderBy: { earnedAt: "desc" }, take: 10 },
          goals: { orderBy: [{ year: "desc" }, { month: "desc" }], take: 3 },
        },
      });

      if (!agent) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      }

      return NextResponse.json(serialize(agent));
    }

    // Non-agent user (admin without agent record) — return user info
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        title: true,
        phone: true,
        organization: {
          select: { id: true, name: true, slug: true, tier: true },
        },
      },
    });

    return NextResponse.json(serialize(user));
  } catch (error: unknown) {
    console.error("[mobile/agent/profile] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
    const { fullName, phone, title, licenseNumber } = body;

    // Validate at least one field is being updated
    if (!fullName && !phone && !title && licenseNumber === undefined) {
      return NextResponse.json(
        { error: "At least one field must be provided" },
        { status: 400 }
      );
    }

    // Validate fullName if provided
    if (fullName !== undefined) {
      if (typeof fullName !== "string" || fullName.trim().length < 2) {
        return NextResponse.json(
          { error: "Full name must be at least 2 characters" },
          { status: 400 }
        );
      }
    }

    // Build User update payload
    const userUpdate: Record<string, unknown> = {};
    if (fullName) userUpdate.fullName = fullName.trim();
    if (phone !== undefined) userUpdate.phone = phone?.trim() || null;
    if (title !== undefined) userUpdate.title = title?.trim() || null;

    // Build BrokerAgent update payload (if agent exists)
    const agentUpdate: Record<string, unknown> = {};
    if (fullName) {
      const parts = fullName.trim().split(/\s+/);
      agentUpdate.firstName = parts[0];
      agentUpdate.lastName = parts.slice(1).join(" ") || "";
    }
    if (phone !== undefined) agentUpdate.phone = phone?.trim() || null;
    if (licenseNumber !== undefined)
      agentUpdate.licenseNumber = licenseNumber?.trim() || null;

    // Update in parallel
    const updates: Promise<unknown>[] = [];

    if (Object.keys(userUpdate).length > 0) {
      updates.push(
        prisma.user.update({
          where: { id: ctx.userId },
          data: userUpdate,
        })
      );
    }

    if (ctx.agentId && Object.keys(agentUpdate).length > 0) {
      updates.push(
        prisma.brokerAgent.update({
          where: { id: ctx.agentId },
          data: agentUpdate,
        })
      );
    }

    await Promise.all(updates);

    // Return updated profile (re-fetch to get fresh data)
    const freshUser = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        title: true,
        brokerAgent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            licenseNumber: true,
            phone: true,
          },
        },
      },
    });

    return NextResponse.json(serialize(freshUser));
  } catch (error: unknown) {
    console.error("[mobile/agent/profile] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}
