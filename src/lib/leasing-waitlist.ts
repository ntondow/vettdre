// ============================================================
// AI Leasing Agent — Waitlist Management
//
// Handles prospect waitlist sign-ups and matching when units
// become available. Does NOT auto-notify — surfaces matches
// in the dashboard for landlord confirmation.
// ============================================================

import prisma from "@/lib/prisma";

// ── Types ───────────────────────────────────────────────────

export interface WaitlistEntry {
  conversationId: string;
  prospectPhone: string;
  prospectName: string | null;
  prospectEmail: string | null;
  preferredUnits: string[]; // e.g. ["1BR", "2BR"]
  budget: number | null;
  addedAt: string; // ISO
  temperature: string;
  aiSummary: string | null;
}

export interface WaitlistMatch {
  conversationId: string;
  prospectPhone: string;
  prospectName: string | null;
  prospectEmail: string | null;
  preferredUnits: string[];
  budget: number | null;
  matchScore: number; // 0-100
  matchReasons: string[];
}

// ── addToWaitlist ──────────────────────────────────────────

/**
 * Add a conversation to the waitlist.
 * Called from the AI tool when a prospect agrees to be notified.
 * Also creates a LeasingFollowUp of type waitlist_notify — not date-triggered,
 * but resolved when a matching unit becomes available.
 */
export async function addToWaitlist(
  conversationId: string,
  preferredUnits: string[] = [],
): Promise<void> {
  await prisma.leasingConversation.update({
    where: { id: conversationId },
    data: {
      onWaitlist: true,
      waitlistAddedAt: new Date(),
      waitlistUnits: preferredUnits,
    },
  });

  // Create a follow-up record — scheduledFor is far-future sentinel;
  // actual trigger is when a listing becomes available (notifyWaitlistMatch)
  await prisma.leasingFollowUp.create({
    data: {
      conversationId,
      type: "waitlist_notify",
      scheduledFor: new Date("2099-12-31T00:00:00Z"),
      messageBody: preferredUnits.length > 0
        ? `Waitlisted for: ${preferredUnits.join(", ")}`
        : "Waitlisted for any available unit",
    },
  });
}

// ── getWaitlist ────────────────────────────────────────────

/**
 * Get all waitlisted prospects for a config (property).
 * Optionally filter by configId; if null, returns all for the org.
 */
export async function getWaitlist(
  orgId: string,
  configId?: string,
): Promise<WaitlistEntry[]> {
  const where: Record<string, unknown> = {
    orgId,
    onWaitlist: true,
    status: { notIn: ["closed_won", "closed_lost"] },
  };

  if (configId) {
    where.configId = configId;
  }

  const conversations = await prisma.leasingConversation.findMany({
    where,
    orderBy: { waitlistAddedAt: "desc" },
    select: {
      id: true,
      prospectPhone: true,
      prospectName: true,
      prospectEmail: true,
      waitlistUnits: true,
      waitlistAddedAt: true,
      temperature: true,
      aiSummary: true,
      qualData: true,
    },
  });

  return conversations.map((c) => {
    const qual = (c.qualData && typeof c.qualData === "object") ? c.qualData as Record<string, unknown> : {};
    return {
      conversationId: c.id,
      prospectPhone: c.prospectPhone,
      prospectName: c.prospectName,
      prospectEmail: c.prospectEmail,
      preferredUnits: c.waitlistUnits,
      budget: typeof qual.budget === "number" ? qual.budget : null,
      addedAt: c.waitlistAddedAt?.toISOString() || new Date().toISOString(),
      temperature: c.temperature,
      aiSummary: c.aiSummary,
    };
  });
}

// ── getWaitlistCount ───────────────────────────────────────

/**
 * Quick count of waitlisted prospects (for dashboard badge).
 */
export async function getWaitlistCount(
  orgId: string,
  configId?: string,
): Promise<number> {
  const where: Record<string, unknown> = {
    orgId,
    onWaitlist: true,
    status: { notIn: ["closed_won", "closed_lost"] },
  };
  if (configId) where.configId = configId;

  return prisma.leasingConversation.count({ where });
}

// ── notifyWaitlistMatch ────────────────────────────────────

/**
 * When a listing is marked as available, find waitlisted prospects
 * whose preferences match. Returns matches for the dashboard to
 * display — does NOT auto-send notifications.
 */
export async function notifyWaitlistMatch(
  orgId: string,
  configId: string,
  listing: {
    id: string;
    bedrooms: string | null;
    rentPrice: number | null;
    unit: string | null;
  },
): Promise<WaitlistMatch[]> {
  const waitlisted = await prisma.leasingConversation.findMany({
    where: {
      orgId,
      configId,
      onWaitlist: true,
      status: { notIn: ["closed_won", "closed_lost"] },
    },
    select: {
      id: true,
      prospectPhone: true,
      prospectName: true,
      prospectEmail: true,
      waitlistUnits: true,
      qualData: true,
    },
  });

  if (waitlisted.length === 0) return [];

  const listingBeds = normalizeBedrooms(listing.bedrooms);

  return waitlisted
    .map((c) => {
      const qual = (c.qualData && typeof c.qualData === "object") ? c.qualData as Record<string, unknown> : {};
      const budget = typeof qual.budget === "number" ? qual.budget : null;
      const preferredUnits = c.waitlistUnits;

      let score = 50; // Base score for being on waitlist
      const reasons: string[] = [];

      // Bedroom match
      if (preferredUnits.length > 0 && listingBeds) {
        if (preferredUnits.some((u) => normalizeBedrooms(u) === listingBeds)) {
          score += 30;
          reasons.push(`Wants ${listingBeds}`);
        } else {
          score -= 10;
        }
      } else if (preferredUnits.length === 0) {
        score += 10; // No preference = open to anything
        reasons.push("Open to any unit type");
      }

      // Budget match
      if (budget && listing.rentPrice) {
        if (listing.rentPrice <= budget) {
          score += 20;
          reasons.push("Within budget");
        } else if (listing.rentPrice <= budget * 1.1) {
          score += 10;
          reasons.push("Slightly over budget");
        } else {
          score -= 10;
          reasons.push("Over budget");
        }
      }

      return {
        conversationId: c.id,
        prospectPhone: c.prospectPhone,
        prospectName: c.prospectName,
        prospectEmail: c.prospectEmail,
        preferredUnits,
        budget,
        matchScore: Math.max(0, Math.min(100, score)),
        matchReasons: reasons,
      };
    })
    .filter((m) => m.matchScore >= 40)
    .sort((a, b) => b.matchScore - a.matchScore);
}

// ── Helpers ────────────────────────────────────────────────

function normalizeBedrooms(input: string | null | undefined): string | null {
  if (!input) return null;
  const lower = input.toLowerCase().trim();
  if (lower === "0" || lower === "studio") return "Studio";
  const num = parseInt(lower, 10);
  if (!isNaN(num)) return `${num}BR`;
  if (lower.endsWith("br")) return `${lower.replace(/br$/i, "")}BR`;
  return input;
}
