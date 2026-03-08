// ============================================================
// Comps Consolidation Engine — Merge ACRIS + Web Comps
//
// Combines official NYC ACRIS sales data with web-scraped comps
// (from Firecrawl/Brave) into a unified, deduplicated set with
// source provenance and confidence scoring.
// ============================================================

import type { CompProperty } from "./comps-engine";

// ── Types ────────────────────────────────────────────────────

export type CompSource = "acris" | "firecrawl" | "brave" | "manual";

export interface ConsolidatedComp extends CompProperty {
  /** Which data sources contributed to this comp */
  sources: CompSource[];
  /** Confidence in the data (higher when multiple sources agree) */
  dataConfidence: "high" | "medium" | "low";
  /** Whether the comp was verified across multiple sources */
  crossVerified: boolean;
  /** Source-specific metadata */
  sourceMetadata?: {
    acrisDocId?: string;
    webUrl?: string;
    scrapedAt?: string;
  };
}

export interface ConsolidationResult {
  /** Unified comp set, sorted by relevance */
  comps: ConsolidatedComp[];
  /** Stats about the consolidation */
  stats: {
    acrisCount: number;
    webCount: number;
    duplicatesRemoved: number;
    crossVerifiedCount: number;
    totalUnique: number;
  };
  /** Methodology note */
  methodology: string;
}

// ── Address Normalization ────────────────────────────────────

function normalizeAddress(addr: string): string {
  return addr
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[.,#]/g, "")
    .replace(/\bSTREET\b/g, "ST")
    .replace(/\bAVENUE\b/g, "AVE")
    .replace(/\bBOULEVARD\b/g, "BLVD")
    .replace(/\bDRIVE\b/g, "DR")
    .replace(/\bROAD\b/g, "RD")
    .replace(/\bPLACE\b/g, "PL")
    .replace(/\bCOURT\b/g, "CT")
    .replace(/\bLANE\b/g, "LN")
    .replace(/\bAPARTMENT\b/g, "APT")
    .replace(/\bSUITE\b/g, "STE")
    .replace(/\bNORTH\b/g, "N")
    .replace(/\bSOUTH\b/g, "S")
    .replace(/\bEAST\b/g, "E")
    .replace(/\bWEST\b/g, "W")
    .trim();
}

function extractStreetNumber(addr: string): string | null {
  const match = addr.match(/^(\d+[\-\d]*)/);
  return match ? match[1] : null;
}

// ── Duplicate Detection ──────────────────────────────────────

function areSameProperty(a: string, b: string, aPrice: number, bPrice: number): boolean {
  const normA = normalizeAddress(a);
  const normB = normalizeAddress(b);

  // Exact match after normalization
  if (normA === normB) return true;

  // Same street number + similar street name (fuzzy)
  const numA = extractStreetNumber(normA);
  const numB = extractStreetNumber(normB);
  if (!numA || !numB || numA !== numB) return false;

  // If street numbers match and prices are within 5%, likely same property
  if (aPrice > 0 && bPrice > 0) {
    const priceRatio = Math.min(aPrice, bPrice) / Math.max(aPrice, bPrice);
    if (priceRatio > 0.95) return true;
  }

  // Check if remaining street names are similar (Levenshtein-ish)
  const streetA = normA.replace(/^\d+[\-\d]*\s*/, "");
  const streetB = normB.replace(/^\d+[\-\d]*\s*/, "");
  if (streetA === streetB) return true;

  // One is a substring of the other (handles "123 MAIN ST" vs "123 MAIN ST APT 1")
  if (streetA.startsWith(streetB) || streetB.startsWith(streetA)) return true;

  return false;
}

// ── Main Consolidation ───────────────────────────────────────

export function consolidateComps(
  acrisComps: CompProperty[],
  webComps: CompProperty[],
  options?: {
    /** Maximum age of comps in months (default: 24) */
    maxAgeMonths?: number;
    /** Minimum sale price filter (default: 100000) */
    minPrice?: number;
    /** Maximum number of consolidated comps to return (default: 30) */
    maxResults?: number;
  },
): ConsolidationResult {
  const maxAge = options?.maxAgeMonths ?? 24;
  const minPrice = options?.minPrice ?? 100000;
  const maxResults = options?.maxResults ?? 30;

  const now = Date.now();
  const maxAgeMs = maxAge * 30.44 * 24 * 60 * 60 * 1000;

  // Tag each comp with its source
  const taggedAcris: (CompProperty & { _source: CompSource })[] = acrisComps
    .filter(c => c.salePrice >= minPrice)
    .map(c => ({ ...c, _source: "acris" as CompSource }));

  const taggedWeb: (CompProperty & { _source: CompSource })[] = webComps
    .filter(c => c.salePrice >= minPrice)
    .map(c => ({ ...c, _source: (c as any)._webSource === "firecrawl" ? "firecrawl" as CompSource : "brave" as CompSource }));

  // Filter by age
  const filterByAge = <T extends { saleDate: string }>(comps: T[]): T[] =>
    comps.filter(c => {
      if (!c.saleDate) return true; // Keep comps without dates
      const saleTime = new Date(c.saleDate).getTime();
      return (now - saleTime) <= maxAgeMs;
    });

  const freshAcris = filterByAge(taggedAcris);
  const freshWeb = filterByAge(taggedWeb);

  // Start with ACRIS comps (authoritative source)
  const consolidated: ConsolidatedComp[] = freshAcris.map(c => ({
    ...c,
    sources: ["acris" as CompSource],
    dataConfidence: "high" as const,
    crossVerified: false,
    sourceMetadata: {},
  }));

  let duplicatesRemoved = 0;
  let crossVerifiedCount = 0;

  // Merge web comps — deduplicate against ACRIS
  for (const webComp of freshWeb) {
    const existingIdx = consolidated.findIndex(existing =>
      areSameProperty(existing.address, webComp.address, existing.salePrice, webComp.salePrice)
    );

    if (existingIdx >= 0) {
      // Duplicate found — merge sources and cross-verify
      const existing = consolidated[existingIdx];
      if (!existing.sources.includes(webComp._source)) {
        existing.sources.push(webComp._source);
      }
      existing.crossVerified = true;
      existing.dataConfidence = "high";
      crossVerifiedCount++;
      duplicatesRemoved++;

      // If web comp has additional data ACRIS doesn't (e.g., unit count), fill in
      if ((!existing.units || existing.units === 0) && webComp.units > 0) {
        existing.units = webComp.units;
      }
    } else {
      // New comp from web only
      consolidated.push({
        ...webComp,
        sources: [webComp._source],
        dataConfidence: "medium",
        crossVerified: false,
        sourceMetadata: {},
      });
    }
  }

  // Score and sort: cross-verified first, then by similarity * recency
  consolidated.sort((a, b) => {
    // Cross-verified comps first
    if (a.crossVerified !== b.crossVerified) return a.crossVerified ? -1 : 1;
    // Then by source count (more sources = better)
    if (a.sources.length !== b.sources.length) return b.sources.length - a.sources.length;
    // Then by similarity score
    return (b.similarityScore || 0) - (a.similarityScore || 0);
  });

  const result = consolidated.slice(0, maxResults);

  return {
    comps: result,
    stats: {
      acrisCount: freshAcris.length,
      webCount: freshWeb.length,
      duplicatesRemoved,
      crossVerifiedCount,
      totalUnique: result.length,
    },
    methodology: `Consolidated ${freshAcris.length} ACRIS sales + ${freshWeb.length} web comps → ${result.length} unique (${crossVerifiedCount} cross-verified, ${duplicatesRemoved} duplicates merged)`,
  };
}
