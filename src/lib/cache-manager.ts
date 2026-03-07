// 3-Tier Building Profile Cache Manager
// Tier 1: Full BuildingIntelligence LRU (500 entries, 30-min TTL)
// Tier 2: Per-source raw API response LRU (2000 entries, staggered TTLs)
// Tier 3: Supabase BuildingCache table (persistent, cross-container)

import prisma from "./prisma";
import type { BuildingIntelligence } from "./data-fusion-engine";

// ============================================================
// SOURCE CONFIGURATION REGISTRY — single source of truth for TTLs
// ============================================================

export const SOURCE_CONFIG: Record<string, { ttlSeconds: number; priority: "critical" | "standard" | "background"; timeoutMs: number }> = {
  PLUTO:          { ttlSeconds: 86400, priority: "critical",   timeoutMs: 5000 },  // 24h — updates quarterly
  HPD_REG:        { ttlSeconds: 43200, priority: "critical",   timeoutMs: 5000 },  // 12h — ownership
  HPD_CONTACTS:   { ttlSeconds: 43200, priority: "critical",   timeoutMs: 5000 },  // 12h — linked to registrations
  HPD_VIOLATIONS: { ttlSeconds: 7200,  priority: "standard",   timeoutMs: 6000 },  // 2h — updates daily
  HPD_COMPLAINTS: { ttlSeconds: 7200,  priority: "standard",   timeoutMs: 6000 },  // 2h — updates daily
  HPD_LITIGATION: { ttlSeconds: 21600, priority: "standard",   timeoutMs: 6000 },  // 6h — updates infrequently
  DOB_PERMITS:    { ttlSeconds: 14400, priority: "standard",   timeoutMs: 6000 },  // 4h — updates daily
  DOB_ECB:        { ttlSeconds: 14400, priority: "standard",   timeoutMs: 6000 },  // 4h — updates daily
  DOB_JOBS:       { ttlSeconds: 14400, priority: "standard",   timeoutMs: 6000 },  // 4h — updates daily
  DOB_NOW:        { ttlSeconds: 14400, priority: "standard",   timeoutMs: 6000 },  // 4h — updates daily
  RENT_STAB:      { ttlSeconds: 86400, priority: "background", timeoutMs: 8000 },  // 24h — updates annually
  SPECULATION:    { ttlSeconds: 86400, priority: "background", timeoutMs: 8000 },  // 24h — updates infrequently
  RPIE:           { ttlSeconds: 86400, priority: "background", timeoutMs: 8000 },  // 24h — updates annually
  LL84:           { ttlSeconds: 86400, priority: "background", timeoutMs: 8000 },  // 24h — updates annually
  ROLLING_SALES:  { ttlSeconds: 43200, priority: "background", timeoutMs: 8000 },  // 12h — updates monthly
  ACRIS_CHAIN:    { ttlSeconds: 43200, priority: "standard",   timeoutMs: 8000 },  // 12h — ACRIS updates monthly
  ENTITY_DEEP:    { ttlSeconds: 3600,  priority: "background", timeoutMs: 10000 }, // 1h — matches ny-corporations.ts
  PORTFOLIO_FULL: { ttlSeconds: 1800,  priority: "background", timeoutMs: 10000 }, // 30min — cross-source
  CONTACT_ENRICHMENT: { ttlSeconds: 604800, priority: "background", timeoutMs: 15000 }, // 7 days — save API credits
};

const TIER1_TTL_MS = 30 * 60 * 1000; // 30 minutes
const TIER1_MAX = 500;
const TIER2_MAX = 2000;

// ============================================================
// LRU CACHE — Map-based, O(1) eviction
// ============================================================

class LRUCache<T> {
  private cache = new Map<string, { data: T; expiresAt: number }>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data;
  }

  // Return data even if expired — for stale-on-error fallback
  getStale(key: string): T | null {
    const entry = this.cache.get(key);
    return entry ? entry.data : null;
  }

  set(key: string, data: T, ttlMs: number): void {
    this.cache.delete(key);
    // Evict LRU (first entry) while at capacity
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
      else break;
    }
    this.cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  // Delete all entries whose key contains `bbl` (for invalidation)
  deleteByBBL(bbl: string): number {
    let count = 0;
    for (const key of [...this.cache.keys()]) {
      if (key.includes(bbl)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  get size(): number {
    return this.cache.size;
  }
}

// ============================================================
// CACHE STATS
// ============================================================

export interface CacheStats {
  tier1Hits: number;
  tier1Misses: number;
  tier2Hits: number;
  tier2Misses: number;
  tier3Hits: number;
  tier3Misses: number;
  staleServed: number;
  tier1Size: number;
  tier2Size: number;
}

// ============================================================
// CACHE MANAGER — orchestrates all 3 tiers
// ============================================================

class CacheManager {
  private tier1: LRUCache<BuildingIntelligence>;
  private tier2: LRUCache<unknown>;
  private stats = {
    tier1Hits: 0, tier1Misses: 0,
    tier2Hits: 0, tier2Misses: 0,
    tier3Hits: 0, tier3Misses: 0,
    staleServed: 0,
  };

  constructor() {
    this.tier1 = new LRUCache(TIER1_MAX);
    this.tier2 = new LRUCache(TIER2_MAX);
  }

  // ---- Tier 1: Full BuildingIntelligence ----

  getBuilding(bbl: string): BuildingIntelligence | null {
    const result = this.tier1.get(bbl);
    if (result) {
      this.stats.tier1Hits++;
      return result;
    }
    this.stats.tier1Misses++;
    return null;
  }

  setBuilding(bbl: string, data: BuildingIntelligence): void {
    this.tier1.set(bbl, data, TIER1_TTL_MS);
  }

  // ---- Tier 2: Per-source data ----

  private sourceKey(bbl: string, source: string): string {
    return `${source}:${bbl}`;
  }

  getSource(bbl: string, source: string): unknown | null {
    const key = this.sourceKey(bbl, source);
    const result = this.tier2.get(key);
    if (result !== null) {
      this.stats.tier2Hits++;
      return result;
    }
    this.stats.tier2Misses++;
    return null;
  }

  setSource(bbl: string, source: string, data: unknown): void {
    const config = SOURCE_CONFIG[source];
    const ttlMs = config ? config.ttlSeconds * 1000 : 3600_000; // default 1h
    this.tier2.set(this.sourceKey(bbl, source), data, ttlMs);
  }

  getStaleSource(bbl: string, source: string): unknown | null {
    const result = this.tier2.getStale(this.sourceKey(bbl, source));
    if (result !== null) this.stats.staleServed++;
    return result;
  }

  // ---- Tier 3: Database (Supabase) ----

  // Batch read — single SQL query for all missing sources
  async getSourcesFromDB(bbl: string, sources: string[]): Promise<Map<string, unknown>> {
    const result = new Map<string, unknown>();
    if (sources.length === 0) return result;
    try {
      const rows = await prisma.buildingCache.findMany({
        where: {
          bbl,
          source: { in: sources },
          expiresAt: { gt: new Date() },
        },
      });
      for (const row of rows) {
        result.set(row.source, row.data);
        this.stats.tier3Hits++;
      }
      // Count misses for sources not found
      this.stats.tier3Misses += sources.length - rows.length;
    } catch (err) {
      console.warn("[Cache T3] DB batch read failed:", err);
      this.stats.tier3Misses += sources.length;
    }
    return result;
  }

  // Fire-and-forget write — never blocks the response
  setSourceInDB(bbl: string, source: string, data: unknown): void {
    const config = SOURCE_CONFIG[source];
    if (!config) return;
    const expiresAt = new Date(Date.now() + config.ttlSeconds * 1000);

    prisma.buildingCache.upsert({
      where: { bbl_source: { bbl, source } },
      update: { data: data as any, fetchedAt: new Date(), expiresAt },
      create: { bbl, source, data: data as any, fetchedAt: new Date(), expiresAt },
    }).catch((err) => {
      console.warn(`[Cache T3] Write failed ${source}:${bbl}:`, err);
    });
  }

  // ---- Invalidation ----

  invalidate(bbl: string): void {
    this.tier1.delete(bbl);
    this.tier2.deleteByBBL(bbl);
    // Fire-and-forget DB deletion
    prisma.buildingCache.deleteMany({ where: { bbl } }).catch(() => {});
  }

  // ---- Cleanup ----

  async cleanupExpiredDB(): Promise<number> {
    const result = await prisma.buildingCache.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }

  // ---- Stats ----

  getStats(): CacheStats {
    return {
      ...this.stats,
      tier1Size: this.tier1.size,
      tier2Size: this.tier2.size,
    };
  }

  resetStats(): void {
    this.stats = {
      tier1Hits: 0, tier1Misses: 0,
      tier2Hits: 0, tier2Misses: 0,
      tier3Hits: 0, tier3Misses: 0,
      staleServed: 0,
    };
  }
}

// ============================================================
// SINGLETON — globalThis pattern (mirrors prisma.ts)
// ============================================================

const globalForCache = globalThis as unknown as { cacheManager: CacheManager | undefined };
export const cacheManager = globalForCache.cacheManager ?? new CacheManager();
if (process.env.NODE_ENV !== "production") globalForCache.cacheManager = cacheManager;
