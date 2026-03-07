// ============================================================
// AI Leasing Agent — Limits, Metering & Feature Gating
// ============================================================

import prisma from "@/lib/prisma";
import { getDailyLimit } from "@/lib/leasing-types";

// ── Tier Limits ──────────────────────────────────────────────

export const TIER_LIMITS = {
  free: { dailyMessages: 25, properties: 3, listings: 15, followUpsPerConv: 1 },
  pro: { dailyMessages: 200, properties: 10, listings: 100, followUpsPerConv: 5 },
  team: { dailyMessages: 1000, properties: 50, listings: 500, followUpsPerConv: 10 },
} as const;

function getTierLimits(tier: string) {
  return TIER_LIMITS[tier as keyof typeof TIER_LIMITS] || TIER_LIMITS.free;
}

// ── Message Limit ────────────────────────────────────────────

export interface MessageLimitResult {
  allowed: boolean;
  used: number;
  limit: number;
  resetsAt: Date;
}

export async function checkMessageLimit(configId: string): Promise<MessageLimitResult> {
  const config = await prisma.leasingConfig.findUnique({
    where: { id: configId },
    select: { tier: true },
  });
  const tier = config?.tier || "free";
  const limit = getDailyLimit(tier);

  // Today in ET
  const now = new Date();
  const today = new Date(now.toLocaleDateString("en-US", { timeZone: "America/New_York" }));

  const usage = await prisma.leasingDailyUsage.findUnique({
    where: { configId_date: { configId, date: today } },
  });

  const used = (usage?.messagesAi || 0) + (usage?.messagesInbound || 0);

  // Reset at midnight ET tomorrow
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return { allowed: used < limit, used, limit, resetsAt: tomorrow };
}

// ── Property Limit ───────────────────────────────────────────

export interface PropertyLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
}

export async function checkPropertyLimit(orgId: string): Promise<PropertyLimitResult> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { tier: true },
  });
  const limits = getTierLimits(org?.tier || "free");

  const current = await prisma.leasingConfig.count({
    where: { orgId, isActive: true },
  });

  return { allowed: current < limits.properties, current, limit: limits.properties };
}

// ── Listing Limit ────────────────────────────────────────────

export interface ListingLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
}

export async function checkListingLimit(orgId: string): Promise<ListingLimitResult> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { tier: true },
  });
  const limits = getTierLimits(org?.tier || "free");

  // Count listings across leasing-enabled properties
  const configPropertyIds = await prisma.leasingConfig.findMany({
    where: { orgId, isActive: true },
    select: { propertyId: true },
  });
  const propertyIds = configPropertyIds.map((c) => c.propertyId);

  const current = propertyIds.length > 0
    ? await prisma.bmsListing.count({
        where: { propertyId: { in: propertyIds }, status: { in: ["available", "showing"] } },
      })
    : 0;

  return { allowed: current < limits.listings, current, limit: limits.listings };
}

// ── Follow-Up Limit ─────────────────────────────────────────

export async function checkFollowUpLimit(
  conversationId: string,
  tier: string,
): Promise<{ allowed: boolean; sent: number; limit: number }> {
  const limits = getTierLimits(tier);

  const sent = await prisma.leasingFollowUp.count({
    where: { conversationId, status: { in: ["sent", "pending"] } },
  });

  return { allowed: sent < limits.followUpsPerConv, sent, limit: limits.followUpsPerConv };
}

// ── Queued Message Count ─────────────────────────────────────

export async function getQueuedMessageCount(orgId: string): Promise<number> {
  const configIds = await prisma.leasingConfig.findMany({
    where: { orgId },
    select: { id: true },
  });
  if (configIds.length === 0) return 0;

  return prisma.leasingMessage.count({
    where: {
      conversation: { configId: { in: configIds.map((c) => c.id) } },
      intentDetected: "__rate_limited__",
    },
  });
}

// ── Usage Stats (detailed for dashboard widget) ──────────────

export interface DetailedUsageStats {
  messagesToday: number;
  sentToday: number;
  receivedToday: number;
  dailyLimit: number;
  resetsAt: Date;
  newConversationsToday: number;
  showingsSuggestedToday: number;
  queuedMessages: number;
  weeklyMessages: number;
  weeklyConversations: number;
  weeklyShowings: number;
  weeklyLeases: number;
}

export async function getDetailedUsage(orgId: string, configId?: string): Promise<DetailedUsageStats> {
  const now = new Date();
  const todayET = new Date(now.toLocaleDateString("en-US", { timeZone: "America/New_York" }));
  const tomorrow = new Date(todayET);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Week start (Monday)
  const weekStart = new Date(todayET);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1));

  // Get config IDs
  let configIds: string[];
  if (configId) {
    configIds = [configId];
  } else {
    const configs = await prisma.leasingConfig.findMany({ where: { orgId }, select: { id: true } });
    configIds = configs.map((c) => c.id);
  }
  if (configIds.length === 0) {
    return {
      messagesToday: 0, sentToday: 0, receivedToday: 0, dailyLimit: 25,
      resetsAt: tomorrow, newConversationsToday: 0, showingsSuggestedToday: 0,
      queuedMessages: 0, weeklyMessages: 0, weeklyConversations: 0,
      weeklyShowings: 0, weeklyLeases: 0,
    };
  }

  // Get tier for limit
  const firstConfig = await prisma.leasingConfig.findFirst({
    where: { id: { in: configIds } },
    select: { tier: true },
  });
  const dailyLimit = getDailyLimit(firstConfig?.tier || "free");

  // Today's usage
  const todayUsage = await prisma.leasingDailyUsage.findMany({
    where: { configId: { in: configIds }, date: todayET },
  });
  const sentToday = todayUsage.reduce((s, u) => s + u.messagesAi, 0);
  const receivedToday = todayUsage.reduce((s, u) => s + u.messagesInbound, 0);

  // Weekly usage
  const weekUsage = await prisma.leasingDailyUsage.findMany({
    where: { configId: { in: configIds }, date: { gte: weekStart } },
  });
  const weeklyMessages = weekUsage.reduce((s, u) => s + u.messagesAi + u.messagesInbound, 0);

  // New conversations today
  const newConversationsToday = await prisma.leasingConversation.count({
    where: { configId: { in: configIds }, createdAt: { gte: todayET } },
  });

  // Showings suggested today (messages with suggest_showing intent)
  const showingsSuggestedToday = await prisma.leasingMessage.count({
    where: {
      conversation: { configId: { in: configIds } },
      createdAt: { gte: todayET },
      intentDetected: { contains: "suggest_showing" },
    },
  });

  // Queued messages
  const queuedMessages = await prisma.leasingMessage.count({
    where: {
      conversation: { configId: { in: configIds } },
      intentDetected: "__rate_limited__",
    },
  });

  // Weekly conversations
  const weeklyConversations = await prisma.leasingConversation.count({
    where: { configId: { in: configIds }, createdAt: { gte: weekStart } },
  });

  // Weekly showings
  const weeklyShowings = await prisma.leasingConversation.count({
    where: {
      configId: { in: configIds },
      status: "showing_scheduled",
      showingAt: { gte: weekStart },
    },
  });

  // Weekly leases
  const weeklyLeases = await prisma.leasingConversation.count({
    where: {
      configId: { in: configIds },
      status: "closed_won",
      updatedAt: { gte: weekStart },
    },
  });

  return {
    messagesToday: sentToday + receivedToday,
    sentToday,
    receivedToday,
    dailyLimit,
    resetsAt: tomorrow,
    newConversationsToday,
    showingsSuggestedToday,
    queuedMessages,
    weeklyMessages,
    weeklyConversations,
    weeklyShowings,
    weeklyLeases,
  };
}

// ============================================================
// Feature Gating
// ============================================================

export type LeasingFeature =
  | "auto_book_calendar"
  | "email_channel"
  | "three_touch_cadence"
  | "knowledge_editor_pro"
  | "spanish_language"
  | "analytics_full"
  | "web_chat"
  | "voice_channel"
  | "multi_language"
  | "custom_cadences";

// Features requiring Pro or higher
const PRO_FEATURES = new Set<LeasingFeature>([
  "auto_book_calendar",
  "email_channel",
  "three_touch_cadence",
  "knowledge_editor_pro",
  "spanish_language",
  "analytics_full",
]);

// Features requiring Team
const TEAM_FEATURES = new Set<LeasingFeature>([
  "web_chat",
  "voice_channel",
  "multi_language",
  "custom_cadences",
]);

// ── Tier cache (60s TTL) ─────────────────────────────────────

const _tierCache = new Map<string, { tier: string; cachedAt: number }>();
const CACHE_TTL_MS = 60_000;

async function getConfigTier(configId: string): Promise<string> {
  const cached = _tierCache.get(configId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.tier;
  }

  const config = await prisma.leasingConfig.findUnique({
    where: { id: configId },
    select: { tier: true },
  });

  const tier = config?.tier || "free";
  _tierCache.set(configId, { tier, cachedAt: Date.now() });
  return tier;
}

// Invalidate cache (call after webhook tier change)
export function invalidateLeasingTierCache(configId: string): void {
  _tierCache.delete(configId);
}

// ── Check feature access ─────────────────────────────────────

export async function checkLeasingFeature(
  configId: string,
  feature: LeasingFeature,
): Promise<boolean> {
  const tier = await getConfigTier(configId);

  if (TEAM_FEATURES.has(feature)) {
    return tier === "team";
  }
  if (PRO_FEATURES.has(feature)) {
    return tier === "pro" || tier === "team";
  }
  return true; // Free features
}

// ── Assert feature access (throws) ───────────────────────────

export class FeatureGatedError extends Error {
  feature: LeasingFeature;
  requiredTier: string;

  constructor(feature: LeasingFeature) {
    const requiredTier = TEAM_FEATURES.has(feature) ? "Team" : "Pro";
    super(`Feature "${feature}" requires ${requiredTier} tier`);
    this.name = "FeatureGatedError";
    this.feature = feature;
    this.requiredTier = requiredTier;
  }
}

export async function assertLeasingFeature(
  configId: string,
  feature: LeasingFeature,
): Promise<void> {
  const allowed = await checkLeasingFeature(configId, feature);
  if (!allowed) {
    throw new FeatureGatedError(feature);
  }
}
