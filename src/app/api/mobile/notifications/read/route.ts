// ── POST /api/mobile/notifications/read ────────────────────────
// Mark notifications as read. Persists read IDs in the user's
// notificationPrefs JSON field under "mobileReadIds".
// Keeps a rolling window of the last 200 IDs to prevent unbounded growth.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMobileAuth, unauthorized } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

const MAX_READ_IDS = 200;

export async function POST(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
    const { ids } = body;

    if (
      !Array.isArray(ids) ||
      ids.length === 0 ||
      !ids.every((id: unknown) => typeof id === "string" && id.length > 0 && id.length < 200)
    ) {
      return NextResponse.json(
        { error: "ids must be a non-empty array of strings" },
        { status: 400 }
      );
    }

    // Fetch current prefs
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { notificationPrefs: true },
    });

    const prefs =
      (user?.notificationPrefs as Record<string, unknown>) || {};
    const existing = Array.isArray(prefs.mobileReadIds)
      ? (prefs.mobileReadIds as string[])
      : [];

    // Merge new IDs, deduplicate, and keep only the most recent MAX_READ_IDS
    const merged = [...new Set([...ids, ...existing])].slice(0, MAX_READ_IDS);

    await prisma.user.update({
      where: { id: ctx.userId },
      data: {
        notificationPrefs: { ...prefs, mobileReadIds: merged },
      },
    });

    return NextResponse.json({ success: true, marked: ids.length });
  } catch (error: unknown) {
    console.error("[mobile/notifications/read] POST error:", error);
    return NextResponse.json(
      { error: "Failed to mark notifications read" },
      { status: 500 }
    );
  }
}
