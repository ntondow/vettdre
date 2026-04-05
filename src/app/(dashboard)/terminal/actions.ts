"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// ── Auth Helper ─────────────────────────────────────────────

async function getAuthContext(): Promise<{ userId: string; orgId: string } | null> {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  let user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    select: { id: true, orgId: true },
  });
  if (!user && authUser.email) {
    user = await prisma.user.findFirst({
      where: { email: authUser.email },
      select: { id: true, orgId: true },
    });
  }
  return user ? { userId: user.id, orgId: user.orgId } : null;
}

function serialize<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ── Fetch Events ────────────────────────────────────────────

export async function getTerminalEvents(params: {
  boroughs: number[];
  categories: string[];
  ntas: string[];
  cursor?: string;
  cursorId?: string;
  limit?: number;
}): Promise<{ events: any[]; hasMore: boolean }> {
  const ctx = await getAuthContext();
  if (!ctx) return { events: [], hasMore: false };

  const limit = params.limit || 50;

  // Use Prisma cursor-based pagination for stable results across duplicate timestamps
  const where: any = {
    orgId: ctx.orgId,
    ...(params.boroughs.length > 0 && params.boroughs.length < 5
      ? { borough: { in: params.boroughs } }
      : {}),
    ...(params.categories.length > 0
      ? { eventType: { in: params.categories } }
      : {}),
    ...(params.ntas.length > 0
      ? { ntaCode: { in: params.ntas } }
      : {}),
  };

  const events = await prisma.terminalEvent.findMany({
    where,
    orderBy: { detectedAt: "desc" },
    take: limit + 1,
    ...(params.cursorId
      ? { skip: 1, cursor: { id: params.cursorId } }
      : {}),
  });

  const hasMore = events.length > limit;
  const trimmed = hasMore ? events.slice(0, limit) : events;

  return serialize({ events: trimmed, hasMore });
}

// ── User Preferences ────────────────────────────────────────

export async function getTerminalPreferences(): Promise<{
  enabledCategories: string[];
  enabledBoroughs: number[];
  selectedNtas: string[];
} | null> {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const prefs = await prisma.userTerminalPreferences.findUnique({
    where: { userId: ctx.userId },
  });

  if (!prefs) {
    // Create defaults: all categories enabled, all boroughs, no NTA filter
    const categories = await prisma.terminalEventCategory.findMany({
      where: { defaultEnabled: true },
      select: { eventType: true },
    });

    const defaults = {
      enabledCategories: categories.map(c => c.eventType),
      enabledBoroughs: [1, 2, 3, 4, 5],
      selectedNtas: [] as string[],
    };

    await prisma.userTerminalPreferences.create({
      data: {
        userId: ctx.userId,
        orgId: ctx.orgId,
        ...defaults,
      },
    });

    return defaults;
  }

  return serialize({
    enabledCategories: prefs.enabledCategories,
    enabledBoroughs: prefs.enabledBoroughs,
    selectedNtas: prefs.selectedNtas,
  });
}

export async function updateTerminalPreferences(prefs: {
  enabledCategories?: string[];
  enabledBoroughs?: number[];
  selectedNtas?: string[];
}): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) return;

  await prisma.userTerminalPreferences.upsert({
    where: { userId: ctx.userId },
    create: {
      userId: ctx.userId,
      orgId: ctx.orgId,
      enabledCategories: prefs.enabledCategories || [],
      enabledBoroughs: prefs.enabledBoroughs || [1, 2, 3, 4, 5],
      selectedNtas: prefs.selectedNtas || [],
    },
    update: {
      ...(prefs.enabledCategories !== undefined ? { enabledCategories: prefs.enabledCategories } : {}),
      ...(prefs.enabledBoroughs !== undefined ? { enabledBoroughs: prefs.enabledBoroughs } : {}),
      ...(prefs.selectedNtas !== undefined ? { selectedNtas: prefs.selectedNtas } : {}),
    },
  });
}

// ── Category Counts ─────────────────────────────────────────

export async function getEventCategoryCounts(
  boroughs: number[],
  sinceHours = 24,
): Promise<Record<string, number>> {
  const ctx = await getAuthContext();
  if (!ctx) return {};

  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  const counts = await prisma.terminalEvent.groupBy({
    by: ["eventType"],
    where: {
      orgId: ctx.orgId,
      detectedAt: { gte: since },
      ...(boroughs.length > 0 && boroughs.length < 5
        ? { borough: { in: boroughs } }
        : {}),
    },
    _count: { eventType: true },
  });

  const result: Record<string, number> = {};
  for (const c of counts) {
    result[c.eventType] = c._count.eventType;
  }
  return result;
}

// ── Event Categories ────────────────────────────────────────

export async function getEventCategories(): Promise<Array<{
  eventType: string;
  category: string;
  tier: number;
  displayLabel: string;
  defaultEnabled: boolean;
  sortOrder: number;
}>> {
  const categories = await prisma.terminalEventCategory.findMany({
    orderBy: { sortOrder: "asc" },
  });
  return serialize(categories);
}

// ── Event Detail ────────────────────────────────────────────

export async function getTerminalEventDetail(eventId: string): Promise<any | null> {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const event = await prisma.terminalEvent.findFirst({
    where: { id: eventId, orgId: ctx.orgId },
  });

  return event ? serialize(event) : null;
}
