/**
 * Webhook Idempotency — Prevent Duplicate Processing
 *
 * Tracks processed webhook event IDs in the ProcessedWebhook table.
 * Check before processing, mark after successful handling.
 *
 * Covers: Stripe, Plaid, CRS webhook events.
 */

import prisma from "@/lib/prisma";

type WebhookProvider = "stripe" | "plaid" | "crs";

/**
 * Check if a webhook event has already been processed.
 */
export async function isWebhookProcessed(
  provider: WebhookProvider,
  eventId: string,
): Promise<boolean> {
  const existing = await prisma.processedWebhook.findUnique({
    where: { provider_eventId: { provider, eventId } },
    select: { id: true },
  });
  return !!existing;
}

/**
 * Mark a webhook event as successfully processed.
 * Uses upsert for safety (idempotent itself).
 */
export async function markWebhookProcessed(
  provider: WebhookProvider,
  eventId: string,
  eventType: string,
): Promise<void> {
  await prisma.processedWebhook.upsert({
    where: { provider_eventId: { provider, eventId } },
    create: { provider, eventId, eventType },
    update: {}, // Already exists — no-op
  });
}

/**
 * Clean up old webhook records (call from cron).
 * Deletes records older than the specified number of days.
 */
export async function cleanupOldWebhooks(
  olderThanDays: number = 7,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const result = await prisma.processedWebhook.deleteMany({
    where: { processedAt: { lt: cutoff } },
  });
  return result.count;
}
