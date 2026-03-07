// ============================================================
// AI Leasing Agent — Follow-Up Scheduling & Templates
// ============================================================

import prisma from "@/lib/prisma";
import { checkFollowUpLimit, checkLeasingFeature } from "@/lib/leasing-limits";

// ── Constants ────────────────────────────────────────────────

const POST_INQUIRY_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours
const POST_SHOWING_DELAY_MS = 2 * 60 * 60 * 1000;  // 2 hours
const NURTURE_DELAY_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days
const COLD_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days since last message

// Dead statuses — no follow-ups
const DEAD_STATUSES = ["closed_won", "closed_lost", "stale", "escalated"];

// ── Cadence Types ────────────────────────────────────────────

export type CadenceType = "free" | "pro" | "showing" | "cold";

interface CadenceStep {
  type: "no_response" | "touch_1" | "touch_2" | "touch_3" | "showing_reminder" | "post_showing" | "app_nudge" | "re_engage";
  delayMs: number; // offset from anchor time
  position: number; // cadencePosition value
}

// ── Custom Cadence Types (stored in buildingKnowledge.cadences[]) ──

export interface CustomCadenceTouchPoint {
  delay: number;         // numeric value
  delayUnit: "hours" | "days"; // unit for delay
  messageTemplate: string; // message with {{name}}, {{building}}, {{unit}} tokens
  condition?: string;     // optional: "if_showing_not_booked", "if_no_reply"
}

export interface CustomCadence {
  id: string;
  name: string;
  active: boolean;
  touchPoints: CustomCadenceTouchPoint[];
}

const CADENCES: Record<CadenceType, CadenceStep[]> = {
  free: [
    { type: "no_response", delayMs: 24 * 60 * 60 * 1000, position: 1 }, // +24h
  ],
  pro: [
    { type: "touch_1", delayMs: 24 * 60 * 60 * 1000, position: 1 },        // +24h
    { type: "touch_2", delayMs: 3 * 24 * 60 * 60 * 1000, position: 2 },    // +72h
    { type: "touch_3", delayMs: 7 * 24 * 60 * 60 * 1000, position: 3 },    // +7d
  ],
  showing: [
    { type: "showing_reminder", delayMs: -24 * 60 * 60 * 1000, position: 1 }, // showingDate -24h
    { type: "post_showing", delayMs: 4 * 60 * 60 * 1000, position: 2 },       // showingDate +4h
    { type: "app_nudge", delayMs: 48 * 60 * 60 * 1000, position: 3 },         // showingDate +48h
  ],
  cold: [
    { type: "re_engage", delayMs: 30 * 24 * 60 * 60 * 1000, position: 1 }, // +30d
  ],
};

// ── Follow-Up Templates ─────────────────────────────────────

export function getFollowUpTemplate(
  type: string,
  context: { name?: string; bedrooms?: string; address?: string; price?: string; temperature?: string; amenity?: string; unit?: string },
): string {
  const name = context.name || "there";
  const beds = context.bedrooms === "0" || context.bedrooms === "studio" ? "studio" : `${context.bedrooms || ""}BR`;
  const addr = context.address || "the apartment";
  const price = context.price ? `$${Number(context.price).toLocaleString()}` : "";
  const temp = context.temperature || "cool";
  const unit = context.unit || "the unit";
  const amenity = context.amenity || "the space";

  switch (type) {
    // Legacy free-tier template
    case "no_response":
      return `Hi ${name}! Following up on the ${beds} at ${addr}${price ? ` for ${price}/mo` : ""}. It's still available! Would you like to come see it this week?`;

    // Pro cadence touch_1: temperature-aware
    case "touch_1":
      if (temp === "hot") return `Hey ${name}! Just following up — still interested in seeing ${addr}? I have a few slots this week that just opened up.`;
      if (temp === "warm") return `Hi ${name}, following up on your inquiry about ${addr}. Still looking for a ${beds}? Happy to answer any questions.`;
      return `Hi ${name}, just checking in about ${addr}. No pressure — let me know if you'd like to schedule a visit.`;

    // Pro cadence touch_2: social proof / value add
    case "touch_2":
      return `A few people toured ${addr} this week and really loved ${amenity}. Still want to come take a look?`;

    // Pro cadence touch_3: low pressure exit
    case "touch_3":
      return `No worries if the timing isn't right. If you're still in the market, I'm here — just reply anytime. 🏠`;

    // Showing cadence
    case "showing_reminder":
      return `Thanks for visiting ${addr} today! What did you think of the place? Happy to answer any questions.`;
    case "post_showing":
      return `How did the showing go? Any questions about ${unit} or next steps? Happy to help move things forward.`;
    case "app_nudge":
      return `Ready to apply? I can send over the application link and walk you through the process — takes about 10 minutes.`;

    // Cold re-engage
    case "re_engage":
      return `Hey ${name}, it's been a little while! We have some new availability at ${addr} that might be a great fit. Still in the market?`;

    // Legacy templates
    case "check_in":
      return `Hi ${name}, just wanted to let you know the ${beds} at ${addr} is still available${price ? ` at ${price}/mo` : ""}. If your plans have changed, I'm here to help!`;
    case "application_nudge":
      return `Hi ${name}! Just checking in — are you still interested in the ${beds} at ${addr}? Happy to help with the application if you have any questions.`;
    default:
      return `Hi ${name}, just following up about ${addr}. Let me know if you have any questions!`;
  }
}

// ── Schedule Follow-Ups ─────────────────────────────────────

export async function scheduleFollowUps(conversationId: string): Promise<void> {
  const conversation = await prisma.leasingConversation.findUnique({
    where: { id: conversationId },
    include: {
      config: { select: { tier: true } },
      listing: { select: { unit: true, bedrooms: true, rentPrice: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 5 },
      followUps: { where: { status: { in: ["pending", "sent"] } } },
    },
  });

  if (!conversation) return;

  // Don't schedule for dead/escalated conversations
  if (DEAD_STATUSES.includes(conversation.status)) return;

  // Check follow-up limit for tier
  const limitCheck = await checkFollowUpLimit(conversationId, conversation.config.tier);
  if (!limitCheck.allowed) return;

  // Don't double-follow-up: if last follow-up is pending, skip
  const hasPendingFollowUp = conversation.followUps.some((f) => f.status === "pending");
  if (hasPendingFollowUp) return;

  // Check if prospect replied to the last follow-up
  // If the last message was a follow-up (AI) and prospect hasn't replied, don't follow up again
  const lastMessages = conversation.messages;
  if (lastMessages.length >= 2) {
    const last = lastMessages[0]; // most recent
    const secondLast = lastMessages[1];
    // If last 2 messages are both from AI/agent, prospect hasn't replied — don't stack
    if (last.sender !== "prospect" && secondLast.sender !== "prospect") return;
  }

  const now = Date.now();
  const lastMessageAt = lastMessages[0]?.createdAt?.getTime() || conversation.createdAt.getTime();

  // Determine which follow-up to schedule
  if (conversation.status === "showing_scheduled" && conversation.showingAt) {
    // Post-showing follow-up: 2 hours after showing time
    const showingTime = new Date(conversation.showingAt).getTime();
    if (showingTime < now) {
      // Showing already happened — check if follow-up already sent
      const hasPostShowing = conversation.followUps.some((f) => f.type === "showing_reminder");
      if (!hasPostShowing) {
        await prisma.leasingFollowUp.create({
          data: {
            conversationId,
            type: "showing_reminder",
            scheduledFor: new Date(Math.max(showingTime + POST_SHOWING_DELAY_MS, now + 60000)),
          },
        });
        return;
      }
    }
  }

  // Cold lead nurture: no message in 7 days, was warm/hot
  const timeSinceLastMessage = now - lastMessageAt;
  if (
    timeSinceLastMessage >= COLD_THRESHOLD_MS &&
    ["hot", "warm"].includes(conversation.temperature) &&
    conversation.status !== "showing_scheduled"
  ) {
    const hasNurture = conversation.followUps.some((f) => f.type === "check_in");
    if (!hasNurture) {
      await prisma.leasingFollowUp.create({
        data: {
          conversationId,
          type: "check_in",
          scheduledFor: new Date(now + NURTURE_DELAY_MS),
        },
      });
      return;
    }
  }

  // Post-inquiry follow-up: new conversation, first AI response sent, prospect hasn't replied in 24h
  if (lastMessages.length <= 3 && timeSinceLastMessage < POST_INQUIRY_DELAY_MS) {
    const hasPostInquiry = conversation.followUps.some(
      (f) => f.type === "no_response" && f.status === "sent",
    );
    if (!hasPostInquiry) {
      // Schedule 24h from last AI message
      const lastAiMessage = lastMessages.find((m) => m.sender === "ai");
      const scheduleFrom = lastAiMessage?.createdAt?.getTime() || now;
      await prisma.leasingFollowUp.create({
        data: {
          conversationId,
          type: "no_response",
          scheduledFor: new Date(scheduleFrom + POST_INQUIRY_DELAY_MS),
        },
      });
    }
  }
}

// ── Cancel Pending Follow-Ups ────────────────────────────────

export async function cancelPendingFollowUps(conversationId: string): Promise<number> {
  const result = await prisma.leasingFollowUp.updateMany({
    where: { conversationId, status: "pending" },
    data: { status: "canceled" },
  });
  return result.count;
}

// ── Cancel Cadence (alias for external use) ──────────────────

export async function cancelCadence(conversationId: string): Promise<void> {
  await cancelPendingFollowUps(conversationId);
}

// ── Custom Cadence Token Replacement ─────────────────────────

function replaceCustomTokens(
  template: string,
  ctx: { name?: string; building?: string; unit?: string; bedrooms?: string; price?: string },
): string {
  return template
    .replace(/\{\{name\}\}/gi, ctx.name || "there")
    .replace(/\{\{building\}\}/gi, ctx.building || "the apartment")
    .replace(/\{\{unit\}\}/gi, ctx.unit || "the unit")
    .replace(/\{\{bedrooms\}\}/gi, ctx.bedrooms === "0" || ctx.bedrooms === "studio" ? "studio" : `${ctx.bedrooms || ""}BR`)
    .replace(/\{\{price\}\}/gi, ctx.price ? `$${Number(ctx.price).toLocaleString()}` : "");
}

function delayToMs(delay: number, unit: "hours" | "days"): number {
  return unit === "days" ? delay * 24 * 60 * 60 * 1000 : delay * 60 * 60 * 1000;
}

// ── Schedule Follow-Up Cadence (Pro/Team) ────────────────────

export async function scheduleFollowUpCadence(
  conversationId: string,
  cadenceType: CadenceType,
): Promise<void> {
  const conversation = await prisma.leasingConversation.findUnique({
    where: { id: conversationId },
    include: {
      config: {
        select: {
          id: true,
          tier: true,
          buildingKnowledge: true,
          property: { select: { address: true, name: true } },
        },
      },
      listing: { select: { unit: true, bedrooms: true, rentPrice: true } },
    },
  });

  if (!conversation) return;

  // Don't schedule for dead/escalated conversations
  if (DEAD_STATUSES.includes(conversation.status)) return;

  // Tier gate: if requesting pro/showing/cold cadence but not on Pro+, downgrade
  let effectiveCadence = cadenceType;
  if (cadenceType === "pro" || cadenceType === "showing" || cadenceType === "cold") {
    const hasCadenceFeature = await checkLeasingFeature(conversation.configId, "three_touch_cadence");
    if (!hasCadenceFeature) {
      console.log(`[leasing-followups] Downgrading cadence ${cadenceType} → free (feature gated)`);
      effectiveCadence = "free";
    }
  }

  // For showing cadence, validate showingAt exists
  if (effectiveCadence === "showing" && !conversation.showingAt) {
    console.log("[leasing-followups] Cannot schedule showing cadence — no showingAt");
    return;
  }

  // Cancel any existing pending follow-ups
  await cancelPendingFollowUps(conversationId);

  // Determine anchor time
  const now = new Date();
  let anchorTime: Date;

  if (effectiveCadence === "showing") {
    anchorTime = new Date(conversation.showingAt!);
  } else {
    anchorTime = now;
  }

  // Check for custom cadence (Team tier)
  const bk = (conversation.config.buildingKnowledge && typeof conversation.config.buildingKnowledge === "object")
    ? conversation.config.buildingKnowledge as Record<string, any>
    : {};
  const customCadences: CustomCadence[] = Array.isArray(bk.cadences) ? bk.cadences : [];
  const activeCustom = customCadences.find((c) => c.active && c.touchPoints.length > 0);

  if (activeCustom && effectiveCadence !== "showing") {
    const hasCustomFeature = await checkLeasingFeature(conversation.configId, "custom_cadences");
    if (hasCustomFeature) {
      // Use custom cadence
      const buildingName = conversation.config.property.address || conversation.config.property.name || "the apartment";
      const creates = [];

      for (let i = 0; i < activeCustom.touchPoints.length; i++) {
        const tp = activeCustom.touchPoints[i];
        const offsetMs = delayToMs(tp.delay, tp.delayUnit);
        const scheduledFor = new Date(anchorTime.getTime() + offsetMs);

        // Skip if in the past
        if (scheduledFor.getTime() < now.getTime() - 5 * 60 * 1000) continue;
        if (scheduledFor < now) scheduledFor.setTime(now.getTime() + 60 * 1000);

        const messageBody = replaceCustomTokens(tp.messageTemplate, {
          name: conversation.prospectName || undefined,
          building: buildingName,
          unit: conversation.listing?.unit ? `Unit ${conversation.listing.unit}` : undefined,
          bedrooms: conversation.listing?.bedrooms || undefined,
          price: conversation.listing?.rentPrice ? String(conversation.listing.rentPrice) : undefined,
        });

        creates.push(
          prisma.leasingFollowUp.create({
            data: {
              conversationId,
              type: "custom",
              cadencePosition: i + 1,
              scheduledFor,
              messageBody,
              // Store condition in the messageBody prefix for cron to check
              ...(tp.condition ? { variantId: `condition:${tp.condition}` } : {}),
            },
          }),
        );
      }

      if (creates.length > 0) await Promise.all(creates);
      return;
    }
  }

  // Create follow-up records for each step (standard cadence)
  const steps = CADENCES[effectiveCadence as keyof typeof CADENCES];
  if (!steps) return;
  const creates = [];

  for (const step of steps) {
    const scheduledFor = new Date(anchorTime.getTime() + step.delayMs);

    // Skip if scheduled time is in the past (except if it's within 5 minutes)
    if (scheduledFor.getTime() < now.getTime() - 5 * 60 * 1000) {
      continue;
    }

    // Ensure scheduled time is at least 1 minute from now
    if (scheduledFor < now) {
      scheduledFor.setTime(now.getTime() + 60 * 1000);
    }

    creates.push(
      prisma.leasingFollowUp.create({
        data: {
          conversationId,
          type: step.type,
          cadencePosition: step.position,
          scheduledFor,
        },
      }),
    );
  }

  if (creates.length > 0) {
    await Promise.all(creates);
  }
}

// ── Time Window Check ────────────────────────────────────────
// Follow-ups only sent 9 AM - 8 PM ET

export function isWithinSendWindow(): boolean {
  const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hour = nowET.getHours();
  return hour >= 9 && hour < 20;
}

export function getNextSendWindow(): Date {
  const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hour = nowET.getHours();

  if (hour >= 20) {
    // After 8 PM — next day 9 AM
    const next = new Date(nowET);
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    return next;
  }
  if (hour < 9) {
    // Before 9 AM — today 9 AM
    const next = new Date(nowET);
    next.setHours(9, 0, 0, 0);
    return next;
  }
  return nowET; // Within window
}
