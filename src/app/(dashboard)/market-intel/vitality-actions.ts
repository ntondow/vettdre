"use server";

import { prisma } from "@/lib/prisma";
import { NYC_ZIP_CENTROIDS } from "@/lib/nyc-zip-centroids";
import { calculateVitalityScore, type VitalityScore, type POIResult } from "@/lib/vitality-engine";
import { fetchAllPOIsForZip } from "@/lib/vitality-data";

/* ------------------------------------------------------------------ */
/*  Read from cache                                                    */
/* ------------------------------------------------------------------ */

/**
 * Get vitality score for a single ZIP code.
 * Reads from DB cache. Returns null if no cached score exists.
 */
export async function getVitalityScore(zipCode: string): Promise<VitalityScore | null> {
  try {
    const row = await prisma.vitalitySnapshot.findUnique({
      where: { zipCode_market: { zipCode, market: "nyc" } },
    });
    if (!row) return null;

    // Check expiration — return stale data but mark it
    const isExpired = new Date(row.expiresAt) < new Date();

    const pois = (row.poiData as any[]) || [];
    const positiveIndicators = pois.filter((p: any) => p.signal === "positive") as POIResult[];
    const negativeIndicators = pois.filter((p: any) => p.signal === "negative") as POIResult[];

    return {
      zipCode: row.zipCode,
      score: row.score,
      level: row.level as VitalityScore["level"],
      momentum: "unknown",
      positiveIndicators,
      negativeIndicators,
      positiveCount: row.positiveCount,
      negativeCount: row.negativeCount,
      ratio: row.ratio,
      confidence: row.confidence as VitalityScore["confidence"],
      calculatedAt: row.calculatedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    };
  } catch (err) {
    console.error("getVitalityScore error:", err);
    return null;
  }
}

/**
 * Get vitality scores for all ZIPs whose centroids fall within map bounds.
 * Returns cached scores. Does not trigger refresh for expired scores.
 */
export async function getVitalityScoresForBounds(bounds: {
  north: number;
  south: number;
  east: number;
  west: number;
}): Promise<VitalityScore[]> {
  try {
    // Find all NYC ZIPs whose centroids fall within the viewport
    const zipsInBounds = NYC_ZIP_CENTROIDS.filter(
      (z) =>
        z.lat >= bounds.south &&
        z.lat <= bounds.north &&
        z.lng >= bounds.west &&
        z.lng <= bounds.east,
    );

    if (zipsInBounds.length === 0) return [];

    const zipCodes = zipsInBounds.map((z) => z.zip);

    // Batch query from DB
    const rows = await prisma.vitalitySnapshot.findMany({
      where: {
        zipCode: { in: zipCodes },
        market: "nyc",
      },
    });

    return rows.map((row) => {
      const pois = (row.poiData as any[]) || [];
      const positiveIndicators = pois.filter((p: any) => p.signal === "positive") as POIResult[];
      const negativeIndicators = pois.filter((p: any) => p.signal === "negative") as POIResult[];

      return {
        zipCode: row.zipCode,
        score: row.score,
        level: row.level as VitalityScore["level"],
        momentum: "unknown",
        positiveIndicators,
        negativeIndicators,
        positiveCount: row.positiveCount,
        negativeCount: row.negativeCount,
        ratio: row.ratio,
        confidence: row.confidence as VitalityScore["confidence"],
        calculatedAt: row.calculatedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      };
    });
  } catch (err) {
    console.error("getVitalityScoresForBounds error:", err);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Refresh / Compute scores                                           */
/* ------------------------------------------------------------------ */

/**
 * Refresh vitality score for a single ZIP code.
 * Fetches fresh POI data from Google Places + OSM, recalculates, and updates DB cache.
 */
export async function refreshVitalityScore(zipCode: string): Promise<VitalityScore | null> {
  try {
    // Fetch all POIs from both data sources
    const pois = await fetchAllPOIsForZip(zipCode);

    // Calculate score
    const score = calculateVitalityScore(zipCode, pois);

    // Upsert into DB
    await prisma.vitalitySnapshot.upsert({
      where: { zipCode_market: { zipCode, market: "nyc" } },
      update: {
        score: score.score,
        level: score.level,
        ratio: score.ratio,
        confidence: score.confidence,
        positiveCount: score.positiveCount,
        negativeCount: score.negativeCount,
        poiData: pois as any,
        calculatedAt: new Date(score.calculatedAt),
        expiresAt: new Date(score.expiresAt),
      },
      create: {
        zipCode,
        market: "nyc",
        score: score.score,
        level: score.level,
        ratio: score.ratio,
        confidence: score.confidence,
        positiveCount: score.positiveCount,
        negativeCount: score.negativeCount,
        poiData: pois as any,
        calculatedAt: new Date(score.calculatedAt),
        expiresAt: new Date(score.expiresAt),
      },
    });

    return score;
  } catch (err) {
    console.error("refreshVitalityScore error:", err);
    return null;
  }
}

/**
 * Batch refresh all NYC ZIP codes.
 * Rate-limited to respect OSM Overpass 1/sec limit.
 * Should be called from cron endpoint, not user-facing routes.
 */
export async function refreshAllVitalityScores(): Promise<{
  updated: number;
  errors: number;
  duration: number;
}> {
  const start = Date.now();
  let updated = 0;
  let errors = 0;

  // Process all NYC ZIPs
  for (const zip of NYC_ZIP_CENTROIDS) {
    try {
      const result = await refreshVitalityScore(zip.zip);
      if (result) {
        updated++;
      } else {
        errors++;
      }
    } catch {
      errors++;
    }

    // Rate limit: wait 1.5 seconds between ZIPs
    // (OSM Overpass 1/sec + buffer for Google Places)
    await new Promise((r) => setTimeout(r, 1500));
  }

  return {
    updated,
    errors,
    duration: Date.now() - start,
  };
}
