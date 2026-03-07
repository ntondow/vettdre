"use server";

import { calculateMotivationScore, quickMotivationEstimate } from "@/lib/motivation-engine";
import type { MotivationScore, MotivationInput, SignalCategory } from "@/lib/motivation-engine";

// LRU cache for computed scores (avoids re-scoring on repeat views)
const scoreCache = new Map<string, { score: MotivationScore; ts: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCached(bbl: string): MotivationScore | null {
  const entry = scoreCache.get(bbl);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    scoreCache.delete(bbl);
    return null;
  }
  return entry.score;
}

function setCache(bbl: string, score: MotivationScore): void {
  // Keep cache size bounded
  if (scoreCache.size > 500) {
    const oldest = scoreCache.keys().next().value;
    if (oldest) scoreCache.delete(oldest);
  }
  scoreCache.set(bbl, { score, ts: Date.now() });
}

/**
 * Get motivation score for a single building using existing enrichment data.
 */
export async function getMotivationScore(bbl: string): Promise<MotivationScore | null> {
  try {
    // Check cache
    const cached = getCached(bbl);
    if (cached) return cached;

    // Dynamic import to avoid circular deps
    const { fetchBuildingIntelligence } = await import("@/lib/data-fusion-engine");
    const intel = await fetchBuildingIntelligence(bbl);
    if (!intel) return null;

    // Map BuildingIntelligence → MotivationInput
    const input: MotivationInput = {
      compliance: intel.compliance,
      energy: intel.energy,
      property: intel.property,
      financials: intel.financials,
      ownership: intel.ownership,
      distressSignals: intel.distressSignals,
      raw: intel.raw,
      dataSources: intel.dataSources,
    };

    const score = calculateMotivationScore(input);
    setCache(bbl, score);
    return score;
  } catch (err) {
    console.error("getMotivationScore error:", err);
    return null;
  }
}

/**
 * Calculate motivation score from already-loaded BuildingIntelligence data.
 * Avoids a second fetch when the building profile already has intel.
 */
export async function calculateMotivationFromIntel(intel: any): Promise<MotivationScore | null> {
  try {
    if (!intel) return null;

    const input: MotivationInput = {
      compliance: intel.compliance,
      energy: intel.energy,
      property: intel.property,
      financials: intel.financials,
      ownership: intel.ownership,
      distressSignals: intel.distressSignals,
      raw: intel.raw,
      dataSources: intel.dataSources,
    };

    return calculateMotivationScore(input);
  } catch (err) {
    console.error("calculateMotivationFromIntel error:", err);
    return null;
  }
}

/**
 * Batch scores for map viewport — processes up to 50 BBLs.
 */
export async function getBatchMotivationScores(
  bbls: string[],
): Promise<Record<string, MotivationScore>> {
  const results: Record<string, MotivationScore> = {};
  const toFetch: string[] = [];

  // Check cache first
  for (const bbl of bbls.slice(0, 50)) {
    const cached = getCached(bbl);
    if (cached) {
      results[bbl] = cached;
    } else {
      toFetch.push(bbl);
    }
  }

  // Fetch remaining in parallel (limited concurrency)
  const batchSize = 10;
  for (let i = 0; i < toFetch.length; i += batchSize) {
    const batch = toFetch.slice(i, i + batchSize);
    const scores = await Promise.allSettled(
      batch.map(async (bbl) => {
        const score = await getMotivationScore(bbl);
        return { bbl, score };
      }),
    );
    for (const result of scores) {
      if (result.status === "fulfilled" && result.value.score) {
        results[result.value.bbl] = result.value.score;
      }
    }
  }

  return results;
}

export interface HotLead {
  bbl: string;
  address: string;
  borough: string;
  score: MotivationScore;
  basicInfo: {
    units: number;
    yearBuilt: number;
    ownerName: string;
    assessedValue: number;
  };
}

/**
 * Get highest-motivation properties in a geographic area.
 * Uses PLUTO heuristic pre-scoring, then full-scores top candidates.
 */
export async function getHotLeads(
  bounds: { north: number; south: number; east: number; west: number },
  limit: number = 25,
  minScore: number = 50,
  categories?: SignalCategory[],
): Promise<HotLead[]> {
  try {
    // 1. Query PLUTO for properties in bounds
    const plutoUrl = new URL("https://data.cityofnewyork.us/resource/64uk-42ks.json");
    plutoUrl.searchParams.set(
      "$where",
      `latitude between '${bounds.south}' and '${bounds.north}' AND longitude between '${bounds.west}' and '${bounds.east}' AND unitsres > 0`,
    );
    plutoUrl.searchParams.set("$limit", "200");
    plutoUrl.searchParams.set(
      "$select",
      "bbl,address,borough,unitsres,yearbuilt,ownername,assesstot,numfloors,bldgclass,assessland,block,lot,borocode,latitude,longitude",
    );
    plutoUrl.searchParams.set("$order", "unitsres DESC");

    const resp = await fetch(plutoUrl.toString());
    if (!resp.ok) return [];
    const properties: any[] = await resp.json();
    if (!Array.isArray(properties) || properties.length === 0) return [];

    // 2. Quick pre-score using PLUTO-only heuristics
    const prescoredProps = properties
      .map((p) => ({
        ...p,
        quickScore: quickMotivationEstimate(p),
      }))
      .sort((a, b) => b.quickScore - a.quickScore);

    // 3. Full-score top 50 candidates
    const candidates = prescoredProps.slice(0, 50);
    const hotLeads: HotLead[] = [];

    // Process in batches of 10 for concurrency control
    for (let i = 0; i < candidates.length; i += 10) {
      const batch = candidates.slice(i, i + 10);
      const results = await Promise.allSettled(
        batch.map(async (p) => {
          const bbl = p.bbl || `${p.borocode}${String(p.block).padStart(5, "0")}${String(p.lot).padStart(4, "0")}`;
          const score = await getMotivationScore(bbl);
          if (!score || score.overall < minScore) return null;

          // Filter by categories if specified
          if (categories && categories.length > 0) {
            const hasMatchingCategory = score.signals.some((s) =>
              categories.includes(s.category),
            );
            if (!hasMatchingCategory) return null;
          }

          return {
            bbl,
            address: p.address || "",
            borough: p.borough || "",
            score,
            basicInfo: {
              units: parseInt(p.unitsres || "0", 10),
              yearBuilt: parseInt(p.yearbuilt || "0", 10),
              ownerName: p.ownername || "",
              assessedValue: parseFloat(p.assesstot || "0"),
            },
          } satisfies HotLead;
        }),
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          hotLeads.push(result.value);
        }
      }

      // Early exit if we have enough
      if (hotLeads.length >= limit) break;
    }

    // 4. Sort by score descending and limit
    hotLeads.sort((a, b) => b.score.overall - a.score.overall);
    return hotLeads.slice(0, limit);
  } catch (err) {
    console.error("getHotLeads error:", err);
    return [];
  }
}
