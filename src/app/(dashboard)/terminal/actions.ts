"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
// feature-gate imported dynamically to avoid module init issues in Node 20 Docker builds
// Types inlined to avoid cross-module issues with "use server" bundling
interface SearchResult {
  event: any;
  matchField: "bbl" | "address" | "owner" | "brief";
}

interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  hasMore: boolean;
}

interface WebIntelResult {
  articles: Array<{ title: string; url: string; snippet: string; source: string }>;
  listings: Array<{ address: string; price: string; beds?: number; url: string; source: string }>;
}

// ── Auth Helper ─────────────────────────────────────────────

async function getAuthContext(): Promise<{ userId: string; orgId: string; plan: string } | null> {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  let user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    select: { id: true, orgId: true, plan: true },
  });
  if (!user && authUser.email) {
    user = await prisma.user.findFirst({
      where: { email: authUser.email },
      select: { id: true, orgId: true, plan: true },
    });
  }
  if (!user) return null;
  return { userId: user.id, orgId: user.orgId, plan: user.plan || "free" };
}

async function requireTerminalAccess(ctx: { plan: string } | null): Promise<boolean> {
  if (!ctx) return false;
  const { hasPermission } = await import("@/lib/feature-gate");
  return hasPermission(ctx.plan as any, "terminal_access");
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
  if (!ctx || !await requireTerminalAccess(ctx)) return { events: [], hasMore: false };

  const limit = params.limit || 20;

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

// ── Neighborhood Counts ─────────────────────────────────────

export async function fetchNeighborhoodCounts(
  boroughs: number[],
  categories: string[],
): Promise<Array<{ nta: string; name: string; count: number }>> {
  const ctx = await getAuthContext();
  if (!ctx || !await requireTerminalAccess(ctx)) return [];

  const counts = await prisma.terminalEvent.groupBy({
    by: ["ntaCode"],
    where: {
      orgId: ctx.orgId,
      ntaCode: { not: null },
      ...(boroughs.length > 0 && boroughs.length < 5
        ? { borough: { in: boroughs } }
        : {}),
      ...(categories.length > 0
        ? { eventType: { in: categories } }
        : {}),
    },
    _count: { ntaCode: true },
    orderBy: { _count: { ntaCode: "desc" } },
  });

  // Map NTA codes to names using the neighborhoods lookup
  const { getNeighborhoodByZip, NYC_NEIGHBORHOODS } = await import("@/lib/neighborhoods");

  // Build NTA code → name map from the neighborhoods registry
  const ntaNameMap = new Map<string, string>();
  for (const nh of NYC_NEIGHBORHOODS) {
    if (nh.ntaCode && !ntaNameMap.has(nh.ntaCode)) {
      ntaNameMap.set(nh.ntaCode, nh.name);
    }
  }

  return counts
    .filter((c) => c.ntaCode && c._count.ntaCode > 0)
    .map((c) => ({
      nta: c.ntaCode!,
      name: ntaNameMap.get(c.ntaCode!) || c.ntaCode!,
      count: c._count.ntaCode,
    }));
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
  if (!ctx || !await requireTerminalAccess(ctx)) return null;

  const event = await prisma.terminalEvent.findFirst({
    where: { id: eventId, orgId: ctx.orgId },
  });

  return event ? serialize(event) : null;
}

// ── Search ─────────────────────────────────────────────────

const SEARCH_HARD_CAP = 100;

export async function searchTerminalEvents(params: {
  query: string;
  boroughs?: number[];
  limit?: number;
  offset?: number;
}): Promise<SearchResponse> {
  const ctx = await getAuthContext();
  if (!ctx || !await requireTerminalAccess(ctx)) return { results: [], totalCount: 0, hasMore: false };

  const query = params.query.trim();
  if (query.length < 2) return { results: [], totalCount: 0, hasMore: false };

  const limit = Math.min(params.limit || 30, SEARCH_HARD_CAP);
  const offset = params.offset || 0;
  const boroughs = params.boroughs;
  const ilikePat = `%${query}%`;
  const isDigitsOnly = /^\d+$/.test(query);

  // Build borough filter fragment
  const boroFilter = boroughs && boroughs.length > 0 && boroughs.length < 5
    ? boroughs
    : null;

  // Run 4 parallel searches via raw SQL (ILIKE on JSON fields not supported in Prisma).
  // Tagged template literals auto-parameterize values.
  // Borough filtering applied in the final Prisma findMany (simpler than conditional SQL).
  //
  // Performance note: For >50K events, consider adding a GIN index:
  //   CREATE INDEX idx_terminal_events_brief_tsvector
  //   ON terminal_events USING GIN (to_tsvector('english', COALESCE(ai_brief, '')));
  type RawHit = { id: string };

  const bblSearch = isDigitsOnly
    ? prisma.$queryRaw<RawHit[]>`
        SELECT id FROM terminal_events
        WHERE org_id = ${ctx.orgId}
          AND bbl LIKE ${query + "%"}
        ORDER BY detected_at DESC
        LIMIT ${SEARCH_HARD_CAP}
      `.catch(() => [] as RawHit[])
    : Promise.resolve([] as RawHit[]);

  const addressSearch = prisma.$queryRaw<RawHit[]>`
    SELECT id FROM terminal_events
    WHERE org_id = ${ctx.orgId}
      AND enrichment_package->'property_profile'->>'address' ILIKE ${ilikePat}
    ORDER BY detected_at DESC
    LIMIT ${SEARCH_HARD_CAP}
  `.catch(() => [] as RawHit[]);

  const ownerSearch = prisma.$queryRaw<RawHit[]>`
    SELECT id FROM terminal_events
    WHERE org_id = ${ctx.orgId}
      AND enrichment_package->'property_profile'->>'ownerName' ILIKE ${ilikePat}
    ORDER BY detected_at DESC
    LIMIT ${SEARCH_HARD_CAP}
  `.catch(() => [] as RawHit[]);

  const briefSearch = prisma.$queryRaw<RawHit[]>`
    SELECT id FROM terminal_events
    WHERE org_id = ${ctx.orgId}
      AND ai_brief ILIKE ${ilikePat}
    ORDER BY detected_at DESC
    LIMIT ${SEARCH_HARD_CAP}
  `.catch(() => [] as RawHit[]);

  const [bblHits, addressHits, ownerHits, briefHits] = await Promise.all([
    bblSearch,
    addressSearch,
    ownerSearch,
    briefSearch,
  ]);

  // Dedup and assign matchField (prefer bbl > address > owner > brief)
  const matchMap = new Map<string, SearchResult["matchField"]>();
  for (const h of bblHits) if (!matchMap.has(h.id)) matchMap.set(h.id, "bbl");
  for (const h of addressHits) if (!matchMap.has(h.id)) matchMap.set(h.id, "address");
  for (const h of ownerHits) if (!matchMap.has(h.id)) matchMap.set(h.id, "owner");
  for (const h of briefHits) if (!matchMap.has(h.id)) matchMap.set(h.id, "brief");

  const allIds = [...matchMap.keys()];
  const totalCount = allIds.length;

  if (totalCount === 0) return { results: [], totalCount: 0, hasMore: false };

  // Paginate the ID list, then fetch full events
  const pageIds = allIds.slice(offset, offset + limit);

  const events = await prisma.terminalEvent.findMany({
    where: {
      id: { in: pageIds },
      orgId: ctx.orgId,
      ...(boroFilter ? { borough: { in: boroFilter } } : {}),
    },
    orderBy: { detectedAt: "desc" },
  });

  const results: SearchResult[] = events.map((e) => ({
    event: e,
    matchField: matchMap.get(e.id) || "brief",
  }));

  return serialize({
    results,
    totalCount,
    hasMore: offset + limit < totalCount,
  });
}

// ── Batch Event Fetch (for Realtime) ───────────────────────

export async function getTerminalEventsByIds(eventIds: string[]): Promise<any[]> {
  const ctx = await getAuthContext();
  if (!ctx || !await requireTerminalAccess(ctx)) return [];

  if (eventIds.length === 0) return [];

  const events = await prisma.terminalEvent.findMany({
    where: {
      id: { in: eventIds.slice(0, 50) },
      orgId: ctx.orgId,
    },
    orderBy: { detectedAt: "desc" },
  });

  return serialize(events);
}

// ── Watchlists ─────────────────────────────────────────────

const MAX_WATCHLISTS_PER_USER = 25;

export async function createWatchlist(params: {
  watchType: "bbl" | "block" | "owner" | "nta";
  watchValue: string;
  label?: string;
  notifyTiers?: number[];
}): Promise<{ success: boolean; error?: string; watchlist?: any }> {
  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const { watchType, watchValue, label, notifyTiers } = params;

  if (!watchValue || watchValue.trim().length === 0) {
    return { success: false, error: "Watch value is required" };
  }

  // Enforce per-user limit
  const count = await prisma.terminalWatchlist.count({
    where: { userId: ctx.userId },
  });
  if (count >= MAX_WATCHLISTS_PER_USER) {
    return { success: false, error: `Maximum ${MAX_WATCHLISTS_PER_USER} watchlists allowed` };
  }

  // Check for duplicate
  const existing = await prisma.terminalWatchlist.findFirst({
    where: {
      userId: ctx.userId,
      watchType,
      watchValue: watchValue.trim(),
    },
  });
  if (existing) {
    return { success: false, error: "You already have a watchlist for this value" };
  }

  const watchlist = await prisma.terminalWatchlist.create({
    data: {
      userId: ctx.userId,
      orgId: ctx.orgId,
      watchType,
      watchValue: watchValue.trim(),
      label: label?.trim() || null,
      notifyTiers: notifyTiers || [],
    },
  });

  return { success: true, watchlist: serialize(watchlist) };
}

export async function getWatchlists(): Promise<any[]> {
  const ctx = await getAuthContext();
  if (!ctx) return [];

  const watchlists = await prisma.terminalWatchlist.findMany({
    where: { userId: ctx.userId },
    include: {
      _count: {
        select: {
          alerts: { where: { read: false } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return serialize(
    watchlists.map((w) => ({
      ...w,
      unreadCount: w._count.alerts,
      _count: undefined,
    })),
  );
}

export async function updateWatchlist(
  id: string,
  data: { label?: string; notifyTiers?: number[]; isActive?: boolean },
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const watchlist = await prisma.terminalWatchlist.findFirst({
    where: { id, userId: ctx.userId },
  });
  if (!watchlist) return { success: false, error: "Watchlist not found" };

  await prisma.terminalWatchlist.update({
    where: { id },
    data: {
      ...(data.label !== undefined ? { label: data.label?.trim() || null } : {}),
      ...(data.notifyTiers !== undefined ? { notifyTiers: data.notifyTiers } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });

  return { success: true };
}

export async function deleteWatchlist(id: string): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAuthContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const watchlist = await prisma.terminalWatchlist.findFirst({
    where: { id, userId: ctx.userId },
  });
  if (!watchlist) return { success: false, error: "Watchlist not found" };

  await prisma.terminalWatchlist.delete({ where: { id } });
  return { success: true };
}

// ── Alerts ─────────────────────────────────────────────────

export async function getUnreadAlertCount(): Promise<number> {
  const ctx = await getAuthContext();
  if (!ctx) return 0;

  return prisma.terminalWatchlistAlert.count({
    where: {
      read: false,
      watchlist: { userId: ctx.userId },
    },
  });
}

export async function getAlerts(params?: {
  watchlistId?: string;
  unreadOnly?: boolean;
  limit?: number;
}): Promise<any[]> {
  const ctx = await getAuthContext();
  if (!ctx) return [];

  const limit = Math.min(params?.limit || 20, 50);

  const where: any = {
    watchlist: { userId: ctx.userId },
  };
  if (params?.watchlistId) where.watchlistId = params.watchlistId;
  if (params?.unreadOnly) where.read = false;

  const alerts = await prisma.terminalWatchlistAlert.findMany({
    where,
    include: {
      watchlist: {
        select: { watchType: true, watchValue: true, label: true },
      },
      event: {
        select: {
          id: true,
          eventType: true,
          bbl: true,
          borough: true,
          aiBrief: true,
          detectedAt: true,
          enrichmentPackage: true,
        },
      },
    },
    orderBy: { notifiedAt: "desc" },
    take: limit,
  });

  return serialize(alerts);
}

export async function markAlertsRead(alertIds: string[]): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) return;

  // updateMany doesn't support relation filters without previewFeatures.
  // First find valid IDs owned by this user, then update.
  const valid = await prisma.terminalWatchlistAlert.findMany({
    where: {
      id: { in: alertIds },
      watchlist: { userId: ctx.userId },
    },
    select: { id: true },
  });

  if (valid.length > 0) {
    await prisma.terminalWatchlistAlert.updateMany({
      where: { id: { in: valid.map((a) => a.id) } },
      data: { read: true },
    });
  }
}

export async function markAllAlertsRead(): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx) return;

  // updateMany doesn't support relation filters without previewFeatures.
  // First find unread alert IDs for this user, then update.
  const unread = await prisma.terminalWatchlistAlert.findMany({
    where: {
      read: false,
      watchlist: { userId: ctx.userId },
    },
    select: { id: true },
  });

  if (unread.length > 0) {
    await prisma.terminalWatchlistAlert.updateMany({
      where: { id: { in: unread.map((a) => a.id) } },
      data: { read: true },
    });
  }
}

// ── Related Events (for inline expand) ───────────────────────

export async function getRelatedEvents(
  bbl: string,
  excludeEventId: string,
): Promise<Array<{ id: string; eventType: string; detectedAt: string; briefSnippet: string }>> {
  const ctx = await getAuthContext();
  if (!ctx || !await requireTerminalAccess(ctx)) return [];

  const events = await prisma.terminalEvent.findMany({
    where: {
      bbl,
      orgId: ctx.orgId,
      id: { not: excludeEventId },
    },
    orderBy: { detectedAt: "desc" },
    take: 5,
    select: {
      id: true,
      eventType: true,
      detectedAt: true,
      aiBrief: true,
    },
  });

  return events.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    detectedAt: e.detectedAt.toISOString(),
    briefSnippet: e.aiBrief ? e.aiBrief.slice(0, 100) + (e.aiBrief.length > 100 ? "..." : "") : "",
  }));
}

// ── Web Intel Research (Level 2 expand) ──────────────────────

// Simple server-side cache: Map<key, { data, expiresAt }>
const webIntelCache = new Map<string, { data: WebIntelResult; expiresAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function searchEventWebIntel(
  address: string,
  eventType: string,
): Promise<WebIntelResult> {
  const ctx = await getAuthContext();
  if (!ctx || !await requireTerminalAccess(ctx)) return { articles: [], listings: [] };

  if (!address || address.length < 3) return { articles: [], listings: [] };

  // Check cache
  const cacheKey = `${address}-${eventType}`;
  const cached = webIntelCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Build search query based on event type context
  const eventContext: Record<string, string> = {
    SALE_RECORDED: "sale sold",
    LOAN_RECORDED: "mortgage loan financing",
    NEW_BUILDING_PERMIT: "new building development construction",
    MAJOR_ALTERATION: "renovation alteration construction",
    HPD_VIOLATION: "HPD violation housing",
    DOB_STOP_WORK: "stop work order DOB",
    ECB_HIGH_PENALTY: "ECB penalty violation",
    STALLED_SITE: "stalled construction",
    FORECLOSURE_FILED: "foreclosure",
    TAX_LIEN_SOLD: "tax lien",
  };
  const context = eventContext[eventType] || "";
  const searchQuery = `${address} NYC ${context}`.trim();

  // Try Firecrawl first, fall back to Brave
  let articles: WebIntelResult["articles"] = [];
  let listings: WebIntelResult["listings"] = [];

  try {
    const { isFirecrawlAvailable } = await import("@/lib/firecrawl");
    const fcAvailable = await isFirecrawlAvailable();

    if (fcAvailable) {
      const { firecrawlSearch } = await import("@/lib/firecrawl");
      const fcResults = await firecrawlSearch(searchQuery, { limit: 5 });
      articles = fcResults.map((r) => ({
        title: r.title || r.metadata?.title || "",
        url: r.url,
        snippet: (r.description || r.metadata?.description || "").slice(0, 200),
        source: new URL(r.url).hostname.replace("www.", ""),
      }));
    }

    // Fall back to Brave if Firecrawl returned nothing
    if (articles.length === 0) {
      const { braveWebSearch, isBraveSearchAvailable } = await import("@/lib/brave-search");
      if (await isBraveSearchAvailable()) {
        const braveResult = await braveWebSearch(searchQuery, { count: 5, freshness: "py", country: "US" });
        articles = braveResult.results.slice(0, 5).map((r) => ({
          title: r.title,
          url: r.url,
          snippet: (r.description || "").slice(0, 200),
          source: r.domain.replace("www.", ""),
        }));
      }
    }
  } catch (err) {
    console.error("[Terminal WebIntel] Article search error:", err);
  }

  // Listings search
  try {
    const { searchPropertyListings } = await import("@/lib/brave-listings");
    const listingResult = await searchPropertyListings(address);
    listings = listingResult.listings.slice(0, 5).map((l) => ({
      address: l.address,
      price: l.priceStr || `$${l.price.toLocaleString()}`,
      beds: l.beds,
      url: l.url,
      source: l.source?.replace("www.", "") || "",
    }));
  } catch (err) {
    console.error("[Terminal WebIntel] Listing search error:", err);
  }

  const result: WebIntelResult = { articles, listings };

  // Cache result
  webIntelCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });

  return result;
}
