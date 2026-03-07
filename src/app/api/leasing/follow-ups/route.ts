// ============================================================
// Leasing Follow-Up Cron Endpoint
//
// Called by Cloud Scheduler every 15 minutes.
// Processes: (1) due follow-ups, (2) queued messages from rate limiting.
//
// Cloud Scheduler setup:
// gcloud scheduler jobs create http leasing-follow-ups \
//   --schedule="*/15 * * * *" \
//   --uri="https://YOUR_DOMAIN/api/leasing/follow-ups" \
//   --http-method=GET \
//   --headers="Authorization=Bearer YOUR_CRON_SECRET" \
//   --time-zone="America/New_York" \
//   --attempt-deadline=60s
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getTwilio } from "@/lib/twilio";
import { checkMessageLimit } from "@/lib/leasing-limits";
import {
  getFollowUpTemplate,
  isWithinSendWindow,
  getNextSendWindow,
} from "@/lib/leasing-followups";
import {
  getTestsFromConfig,
  getActiveTest,
  getPromotedTemplate,
  assignVariant,
  replaceAbTokens,
  checkAndPromoteWinners,
} from "@/lib/leasing-ab";
import type { AbTest } from "@/lib/leasing-ab";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60s timeout

const MAX_FOLLOW_UPS = 50;
const MAX_QUEUED = 20;
const RECENT_SENT_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
const RECENT_SENT_THRESHOLD = 5;

// ── GET /api/leasing/follow-ups ──────────────────────────────

export async function GET(request: NextRequest) {
  // 1. Authenticate via Bearer token
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[LEASING CRON] CRON_SECRET not configured");
    return new NextResponse("Server configuration error", { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // 2. Idempotency check — skip if a recent run just completed
  const recentCutoff = new Date(Date.now() - RECENT_SENT_WINDOW_MS);
  const recentlySent = await prisma.leasingFollowUp.count({
    where: { status: "sent", sentAt: { gte: recentCutoff } },
  });

  if (recentlySent >= RECENT_SENT_THRESHOLD) {
    console.log("[LEASING CRON] Skipping — recent run detected", { recentlySent });
    return NextResponse.json({ ok: true, skipped: true, reason: "recent_run_detected", recentlySent });
  }

  // 3. Process
  const results = { followUpsSent: 0, followUpsSkipped: 0, followUpsRescheduled: 0, queuedProcessed: 0 };

  try {
    await processFollowUps(results);
    await processQueuedMessages(results);
  } catch (error) {
    console.error("[LEASING CRON] Error:", error);
  }

  console.log("[LEASING CRON] Complete", results);

  return NextResponse.json({ ok: true, ...results });
}

// ── Follow-Up Processing ─────────────────────────────────────

// Showing cadence types (processed first — time-sensitive)
const SHOWING_TYPES = ["showing_reminder", "post_showing", "app_nudge"];

async function processFollowUps(results: { followUpsSent: number; followUpsSkipped: number; followUpsRescheduled: number }) {
  const now = new Date();

  // Check time window (9 AM - 8 PM ET)
  if (!isWithinSendWindow()) {
    // Reschedule any due follow-ups to next send window
    const due = await prisma.leasingFollowUp.findMany({
      where: { status: "pending", scheduledFor: { lte: now } },
      take: MAX_FOLLOW_UPS,
    });
    if (due.length > 0) {
      const nextWindow = getNextSendWindow();
      await prisma.leasingFollowUp.updateMany({
        where: { id: { in: due.map((f) => f.id) } },
        data: { scheduledFor: nextWindow },
      });
      results.followUpsRescheduled += due.length;
    }
    return;
  }

  // Fetch due follow-ups, showing cadence first (time-sensitive), then by scheduledFor
  const dueFollowUps = await prisma.leasingFollowUp.findMany({
    where: { status: "pending", scheduledFor: { lte: now } },
    include: {
      conversation: {
        include: {
          config: {
            include: {
              twilioNumber: true,
              property: { select: { address: true, name: true } },
            },
          },
          listing: { select: { unit: true, bedrooms: true, rentPrice: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 3, select: { sender: true, createdAt: true } },
        },
      },
    },
    take: MAX_FOLLOW_UPS,
    orderBy: [{ cadencePosition: "asc" }, { scheduledFor: "asc" }],
  });

  // Sort: showing cadence first, then by scheduledFor
  const sorted = [...dueFollowUps].sort((a, b) => {
    const aIsShowing = SHOWING_TYPES.includes(a.type) ? 0 : 1;
    const bIsShowing = SHOWING_TYPES.includes(b.type) ? 0 : 1;
    if (aIsShowing !== bIsShowing) return aIsShowing - bIsShowing;
    return a.scheduledFor.getTime() - b.scheduledFor.getTime();
  });

  for (const followUp of sorted) {
    const conv = followUp.conversation;

    // Skip if conversation is dead/escalated/leased
    if (["closed_won", "closed_lost", "stale", "escalated"].includes(conv.status)) {
      await prisma.leasingFollowUp.update({
        where: { id: followUp.id },
        data: { status: "canceled" },
      });
      results.followUpsSkipped++;
      continue;
    }

    // Skip if prospect replied since follow-up was scheduled
    const recentProspectMsg = conv.messages.find((m) => m.sender === "prospect");
    if (recentProspectMsg && recentProspectMsg.createdAt > followUp.createdAt) {
      await prisma.leasingFollowUp.update({
        where: { id: followUp.id },
        data: { status: "canceled" },
      });
      results.followUpsSkipped++;
      continue;
    }

    // Check custom cadence conditions (stored as "condition:<type>" in variantId)
    if (followUp.variantId?.startsWith("condition:")) {
      const condition = followUp.variantId.replace("condition:", "");
      if (condition === "if_showing_not_booked" && conv.status === "showing_scheduled") {
        // Showing already booked — skip this follow-up
        await prisma.leasingFollowUp.update({
          where: { id: followUp.id },
          data: { status: "canceled" },
        });
        results.followUpsSkipped++;
        continue;
      }
      if (condition === "if_no_reply") {
        // Check if prospect replied since the follow-up was created
        if (recentProspectMsg) {
          await prisma.leasingFollowUp.update({
            where: { id: followUp.id },
            data: { status: "canceled" },
          });
          results.followUpsSkipped++;
          continue;
        }
      }
    }

    // Cadence ordering: don't send touch_2+ if earlier positions haven't been sent
    if (followUp.cadencePosition > 1) {
      const unsent = await prisma.leasingFollowUp.count({
        where: {
          conversationId: conv.id,
          cadencePosition: { lt: followUp.cadencePosition },
          status: { not: "sent" },
          id: { not: followUp.id },
        },
      });
      if (unsent > 0) {
        // Previous touch not yet sent — skip for now (will be picked up on next cron run)
        continue;
      }
    }

    // Check daily message limit
    const limitCheck = await checkMessageLimit(conv.configId);
    if (!limitCheck.allowed) {
      // Reschedule for next day 9 AM ET
      const nextDay9AM = getNextSendWindow();
      nextDay9AM.setDate(nextDay9AM.getDate() + 1);
      nextDay9AM.setHours(9, 0, 0, 0);
      await prisma.leasingFollowUp.update({
        where: { id: followUp.id },
        data: { scheduledFor: nextDay9AM },
      });
      results.followUpsRescheduled++;
      continue;
    }

    // Get AI number
    const aiNumber = conv.config.twilioNumber?.number;
    if (!aiNumber) {
      results.followUpsSkipped++;
      continue;
    }

    // Generate message from template (with A/B testing)
    let messageBody = followUp.messageBody || "";
    let variantId: string | null = followUp.variantId || null;

    if (!messageBody) {
      const buildingName = conv.config.property.address || conv.config.property.name || "the apartment";
      const bk = (conv.config.buildingKnowledge && typeof conv.config.buildingKnowledge === "object")
        ? conv.config.buildingKnowledge as Record<string, any>
        : {};
      const amenity = Array.isArray(bk.amenities) && bk.amenities.length > 0 ? bk.amenities[0] : undefined;

      // Check for A/B test
      const tests = getTestsFromConfig(conv.config.buildingKnowledge);
      const promotedTemplate = getPromotedTemplate(tests, followUp.type);

      if (promotedTemplate) {
        // Winner already declared — use winning template
        messageBody = replaceAbTokens(promotedTemplate, {
          name: conv.prospectName || undefined,
          building: buildingName,
          unit: conv.listing?.unit ? `Unit ${conv.listing.unit}` : undefined,
          amenity,
        });
      } else {
        const activeTest = getActiveTest(tests, followUp.type);
        if (activeTest && !variantId) {
          // Active A/B test — assign variant
          const variant = assignVariant(conv.id, activeTest.id);
          variantId = `${activeTest.id}_${variant}`;
          const template = variant === "A" ? activeTest.templateA : activeTest.templateB;
          messageBody = replaceAbTokens(template, {
            name: conv.prospectName || undefined,
            building: buildingName,
            unit: conv.listing?.unit ? `Unit ${conv.listing.unit}` : undefined,
            amenity,
          });
        } else {
          // No A/B test — use default templates
          messageBody = getFollowUpTemplate(followUp.type, {
            name: conv.prospectName || undefined,
            bedrooms: conv.listing?.bedrooms || undefined,
            address: buildingName,
            price: conv.listing?.rentPrice ? String(conv.listing.rentPrice) : undefined,
            temperature: conv.temperature || undefined,
            unit: conv.listing?.unit ? `Unit ${conv.listing.unit}` : undefined,
          });
        }
      }
    }

    // Send via Twilio
    try {
      const twilio = getTwilio();
      const sent = await twilio.messages.create({
        body: messageBody,
        from: aiNumber,
        to: conv.prospectPhone,
      });

      // Save as AI message
      await prisma.leasingMessage.create({
        data: {
          conversationId: conv.id,
          sender: "ai",
          body: messageBody,
          twilioSid: sent.sid,
          intentDetected: `follow_up:${followUp.type}`,
        },
      });

      // Mark follow-up as sent (with variantId)
      await prisma.leasingFollowUp.update({
        where: { id: followUp.id },
        data: { status: "sent", sentAt: new Date(), messageBody, variantId },
      });

      // Increment daily usage
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await prisma.leasingDailyUsage.upsert({
        where: { configId_date: { configId: conv.configId, date: today } },
        create: { configId: conv.configId, date: today, messagesAi: 1 },
        update: { messagesAi: { increment: 1 } },
      });

      results.followUpsSent++;
    } catch (err) {
      console.error(`[LEASING CRON] Failed to send follow-up ${followUp.id}:`, err);
      results.followUpsSkipped++;
    }
  }

  // After processing all follow-ups: check for A/B test winners to promote
  const processedConfigIds = new Set(sorted.map((f) => f.conversation.configId));
  for (const cId of processedConfigIds) {
    try {
      await checkAndPromoteWinners(cId);
    } catch (err) {
      console.error(`[LEASING CRON] A/B promotion check failed for ${cId}:`, err);
    }
  }
}

// ── Queued Message Processing ────────────────────────────────
// Messages saved with __rate_limited__ intent when daily limit was hit.
// Process oldest first when limit resets.

async function processQueuedMessages(results: { queuedProcessed: number }) {
  // Find all rate-limited messages grouped by conversation
  const queuedMessages = await prisma.leasingMessage.findMany({
    where: { intentDetected: "__rate_limited__" },
    include: {
      conversation: {
        include: {
          config: {
            include: {
              twilioNumber: true,
              property: { include: { listings: { orderBy: { createdAt: "desc" } } } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_QUEUED,
  });

  for (const msg of queuedMessages) {
    const conv = msg.conversation;
    const config = conv.config;

    // Check if limit has reset (new day)
    const limitCheck = await checkMessageLimit(config.id);
    if (!limitCheck.allowed) break; // Still at limit, stop processing

    // Skip dead conversations
    if (["closed_won", "closed_lost", "stale"].includes(conv.status)) {
      await prisma.leasingMessage.update({
        where: { id: msg.id },
        data: { intentDetected: "__rate_limited_expired__" },
      });
      continue;
    }

    // Re-process through the engine: import and call processInboundMessage
    // To avoid circular deps, we just generate a simple response for queued messages
    const aiNumber = config.twilioNumber?.number;
    if (!aiNumber) continue;

    // Simple delayed response acknowledging the wait
    const delayedResponse = `Hi! Sorry for the delayed response. I'm here now — how can I help you with ${config.property.address || config.property.name}?`;

    try {
      const twilio = getTwilio();
      const sent = await twilio.messages.create({
        body: delayedResponse,
        from: aiNumber,
        to: conv.prospectPhone,
      });

      // Save AI response
      await prisma.leasingMessage.create({
        data: {
          conversationId: conv.id,
          sender: "ai",
          body: delayedResponse,
          twilioSid: sent.sid,
          intentDetected: "queued_response",
        },
      });

      // Clear rate-limited flag on original message
      await prisma.leasingMessage.update({
        where: { id: msg.id },
        data: { intentDetected: "__rate_limited_processed__" },
      });

      // Increment usage
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await prisma.leasingDailyUsage.upsert({
        where: { configId_date: { configId: config.id, date: today } },
        create: { configId: config.id, date: today, messagesAi: 1, messagesInbound: 1 },
        update: { messagesAi: { increment: 1 } },
      });

      results.queuedProcessed++;
    } catch (err) {
      console.error(`[LEASING CRON] Failed to process queued message ${msg.id}:`, err);
    }
  }
}
