/**
 * Terminal Alert Matching Engine
 *
 * Runs after each ingestion cycle to match new events against active watchlists.
 * Creates TerminalWatchlistAlert records for matching events.
 *
 * Match rules by WatchType:
 *   bbl   — exact match on event.bbl
 *   block — prefix match (e.g., watchValue "307265" matches BBLs on that block)
 *   owner — case-insensitive substring on enrichmentPackage.property_profile.ownerName
 *   nta   — exact match on event.ntaCode
 */

import prisma from "@/lib/prisma";

const MAX_EVENTS_PER_BATCH = 500;

export interface AlertMatchResult {
  eventsChecked: number;
  watchlistsChecked: number;
  alertsCreated: number;
  durationMs: number;
}

/**
 * Match recently-ingested events against active watchlists for an org.
 * Called at the end of each ingestion cycle.
 *
 * @param orgId - Organization whose watchlists to check
 * @param sinceMinutes - Look back window for new events (default: 20min to overlap with 15min cycle)
 */
export async function matchNewEventsToWatchlists(
  orgId: string,
  sinceMinutes = 20,
): Promise<AlertMatchResult> {
  const start = Date.now();
  const result: AlertMatchResult = {
    eventsChecked: 0,
    watchlistsChecked: 0,
    alertsCreated: 0,
    durationMs: 0,
  };

  try {
    const since = new Date(Date.now() - sinceMinutes * 60 * 1000);

    // Load recent events and active watchlists in parallel
    const [events, watchlists] = await Promise.all([
      prisma.terminalEvent.findMany({
        where: {
          orgId,
          detectedAt: { gte: since },
        },
        select: {
          id: true,
          bbl: true,
          ntaCode: true,
          tier: true,
          enrichmentPackage: true,
        },
        orderBy: { detectedAt: "desc" },
        take: MAX_EVENTS_PER_BATCH,
      }),
      prisma.terminalWatchlist.findMany({
        where: {
          orgId,
          isActive: true,
        },
        select: {
          id: true,
          userId: true,
          watchType: true,
          watchValue: true,
          notifyTiers: true,
        },
      }),
    ]);

    result.eventsChecked = events.length;
    result.watchlistsChecked = watchlists.length;

    if (events.length === 0 || watchlists.length === 0) {
      result.durationMs = Date.now() - start;
      return result;
    }

    // Load existing alerts for dedup (only for these events)
    const eventIds = events.map((e) => e.id);
    const existingAlerts = await prisma.terminalWatchlistAlert.findMany({
      where: { eventId: { in: eventIds } },
      select: { watchlistId: true, eventId: true },
    });
    const existingSet = new Set(
      existingAlerts.map((a) => `${a.watchlistId}:${a.eventId}`),
    );

    // Prepare watchlists by type for efficient matching
    const bblWatches = watchlists.filter((w) => w.watchType === "bbl");
    const blockWatches = watchlists.filter((w) => w.watchType === "block");
    const ownerWatches = watchlists.filter((w) => w.watchType === "owner");
    const ntaWatches = watchlists.filter((w) => w.watchType === "nta");

    // Pre-compute lowercase owner values for case-insensitive matching
    const ownerWatchesLower = ownerWatches.map((w) => ({
      ...w,
      valueLower: w.watchValue.toLowerCase(),
    }));

    // Match events to watchlists
    const alertsToCreate: Array<{
      watchlistId: string;
      eventId: string;
    }> = [];

    for (const event of events) {
      // BBL exact match
      for (const w of bblWatches) {
        if (event.bbl === w.watchValue && tierMatches(event.tier, w.notifyTiers)) {
          const key = `${w.id}:${event.id}`;
          if (!existingSet.has(key)) {
            alertsToCreate.push({ watchlistId: w.id, eventId: event.id });
            existingSet.add(key); // Prevent dupes within this batch
          }
        }
      }

      // Block prefix match (watchValue is boro+block, e.g. "307265")
      for (const w of blockWatches) {
        if (event.bbl.startsWith(w.watchValue) && tierMatches(event.tier, w.notifyTiers)) {
          const key = `${w.id}:${event.id}`;
          if (!existingSet.has(key)) {
            alertsToCreate.push({ watchlistId: w.id, eventId: event.id });
            existingSet.add(key);
          }
        }
      }

      // Owner case-insensitive substring match
      if (ownerWatchesLower.length > 0) {
        const ownerName = getOwnerName(event.enrichmentPackage);
        if (ownerName) {
          const ownerLower = ownerName.toLowerCase();
          for (const w of ownerWatchesLower) {
            if (ownerLower.includes(w.valueLower) && tierMatches(event.tier, w.notifyTiers)) {
              const key = `${w.id}:${event.id}`;
              if (!existingSet.has(key)) {
                alertsToCreate.push({ watchlistId: w.id, eventId: event.id });
                existingSet.add(key);
              }
            }
          }
        }
      }

      // NTA exact match
      if (event.ntaCode) {
        for (const w of ntaWatches) {
          if (event.ntaCode === w.watchValue && tierMatches(event.tier, w.notifyTiers)) {
            const key = `${w.id}:${event.id}`;
            if (!existingSet.has(key)) {
              alertsToCreate.push({ watchlistId: w.id, eventId: event.id });
              existingSet.add(key);
            }
          }
        }
      }
    }

    // Batch insert alerts
    // Note: No @@unique([watchlistId, eventId]) constraint exists, so dedup relies
    // entirely on the existingSet check above. Concurrent runs are unlikely but could
    // produce duplicate rows — acceptable for MVP.
    if (alertsToCreate.length > 0) {
      await prisma.terminalWatchlistAlert.createMany({
        data: alertsToCreate,
      });
      result.alertsCreated = alertsToCreate.length;
    }
  } catch (err) {
    console.error("[Terminal Alerts] Matching error:", err);
    // Non-fatal — don't crash the ingestion pipeline
  }

  result.durationMs = Date.now() - start;
  return result;
}

// ── Helpers ──────────────────────────────────────────────────

function tierMatches(eventTier: number, notifyTiers: number[]): boolean {
  // Empty notifyTiers means "all tiers"
  return notifyTiers.length === 0 || notifyTiers.includes(eventTier);
}

function getOwnerName(enrichmentPackage: any): string | null {
  if (!enrichmentPackage) return null;
  return enrichmentPackage.property_profile?.ownerName || null;
}
