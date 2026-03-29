import webpush from "web-push";
import { Prisma } from "@prisma/client";
import prisma from "./prisma";

// ── Types ────────────────────────────────────────────────────

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

// ── Lazy VAPID init ──────────────────────────────────────────

let vapidInitialized = false;

function ensureVapid() {
  if (vapidInitialized) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:support@vettdre.com";

  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys not configured");
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidInitialized = true;
}

// ── Send to single user ─────────────────────────────────────

export async function sendPushNotification(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  try {
    ensureVapid();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pushSubscription: true },
    });

    if (!user?.pushSubscription) return;

    const subscription = user.pushSubscription as unknown as webpush.PushSubscription;

    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (error: any) {
    // 410 Gone — subscription expired, clean up
    if (error?.statusCode === 410) {
      await prisma.user
        .update({ where: { id: userId }, data: { pushSubscription: Prisma.DbNull } })
        .catch(() => {});
    }
    // Never throw — push failure must not block caller
    console.error(`[push] Failed to send to user=${userId}:`, error?.message || error);
  }
}

// ── Send to all users in org ────────────────────────────────

export async function sendPushToOrg(
  orgId: string,
  payload: PushPayload,
): Promise<void> {
  try {
    ensureVapid();

    const users = await prisma.user.findMany({
      where: { orgId, pushSubscription: { not: Prisma.DbNull } },
      select: { id: true },
    });

    if (users.length === 0) return;

    await Promise.allSettled(
      users.map((u) => sendPushNotification(u.id, payload)),
    );
  } catch (error: any) {
    console.error(`[push] Failed to send to org=${orgId}:`, error?.message || error);
  }
}
