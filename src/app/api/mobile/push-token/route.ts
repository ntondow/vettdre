// ── POST /api/mobile/push-token ──────────────────────────────
// Stores the Expo push notification token for the authenticated user.
// Uses the User.pushSubscription JSON field to store mobile tokens.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getMobileAuth, unauthorized } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

const EXPO_TOKEN_REGEX = /^ExponentPushToken\[.+\]$/;

export async function POST(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const body = await req.json();
    const { token, platform } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Push token is required" },
        { status: 400 }
      );
    }

    if (!EXPO_TOKEN_REGEX.test(token)) {
      return NextResponse.json(
        { error: "Invalid Expo push token format" },
        { status: 400 }
      );
    }

    if (platform && !["ios", "android"].includes(platform)) {
      return NextResponse.json(
        { error: "platform must be 'ios' or 'android'" },
        { status: 400 }
      );
    }

    // Get existing push subscription data
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { pushSubscription: true },
    });

    // Merge mobile token into the pushSubscription JSON
    // Preserves existing web push data while adding/updating mobile
    const existing =
      (user?.pushSubscription as Record<string, unknown>) || {};

    const updated = {
      ...existing,
      mobile: {
        token,
        platform: platform || "unknown",
        registeredAt: new Date().toISOString(),
      },
    };

    await prisma.user.update({
      where: { id: ctx.userId },
      data: { pushSubscription: updated },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[mobile/push-token] POST error:", error);
    return NextResponse.json(
      { error: "Failed to register push token" },
      { status: 500 }
    );
  }
}

// ── DELETE /api/mobile/push-token ──────────────────────────────
// Removes the mobile push token (e.g., on logout).

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getMobileAuth(req);
    if (!ctx) return unauthorized();

    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { pushSubscription: true },
    });

    const existing = (user?.pushSubscription as Record<string, unknown>) || {};
    const { mobile, ...rest } = existing;

    await prisma.user.update({
      where: { id: ctx.userId },
      data: {
        pushSubscription: Object.keys(rest).length > 0 ? rest : null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[mobile/push-token] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to remove push token" },
      { status: 500 }
    );
  }
}
