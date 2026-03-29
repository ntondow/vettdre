// ============================================================
// Comps Engine — NYC DOF Rolling Sales + PLUTO-Enhanced Analysis
// Searches comparable property sales for underwriting
// Two modes:
//   1. searchComps() — basic zip-centroid search (used by deal modeler)
//   2. findComparableSales() — PLUTO bounding box + similarity scoring + valuation
// ============================================================

import { findZipsWithinRadius, getZipCentroid, haversineDistance } from "./nyc-zip-centroids";

// ============================================================
// Shared types (used by basic search + enhanced search)
// ============================================================

const SALES_API = "https://data.cityofnewyork.us/resource/usep-8jbt.json";
const PLUTO_API = "https://data.cityofnewyork.us/resource/64uk-42ks.json";

export interface CompSale {
  address: string;
  borough: string;
  neighborhood: string;
  zip: string;
  buildingClass: string;
  totalUnits: number;
  residentialUnits: number;
  commercialUnits: number;
  landSqft: number;
  grossSqft: number;
  yearBuilt: number;
  salePrice: number;
  saleDate: string;
  pricePerUnit: number;
  pricePerSqft: number;
  distance: number; // miles from subject
}

export interface CompSearchParams {
  zip: string;
  borough?: string;       // 1-5 boro code
  radiusMiles?: number;   // default 2
  yearsBack?: number;     // default 5
  minUnits?: number;      // default 5
  minPrice?: number;      // default 500000
  limit?: number;         // default 50
}

export interface CompSummary {
  count: number;
  avgPricePerUnit: number;
  medianPricePerUnit: number;
  avgPricePerSqft: number;
  medianPricePerSqft: number;
  minPricePerUnit: number;
  maxPricePerUnit: number;
}

// ============================================================
// Enhanced types — similarity scoring + valuation
// ============================================================

export interface CompProperty {
  bbl: string;
  address: string;
  borough: string;
  salePrice: number;
  saleDate: string;
  units: number;
  sqft?: number;
  yearBuilt: number;
  buildingClass: string;
  pricePerUnit: number;
  pricePerSqft?: number;
  distanceMiles: number;
  similarityScore: number;
  lat: number;
  lng: number;
}

export interface CompValuation {
  estimatedValue: number;
  pricePerUnit: number;
  pricePerSqft?: number;
  confidence: "high" | "medium" | "low";
  confidenceScore: number;
  methodology: string;
}

export interface CompResult {
  subject: { bbl: string; address: string; units: number; sqft?: number; assessedValue?: number; lastSalePrice?: number; lastSaleDate?: string };
  comps: CompProperty[];
  valuation: CompValuation;
  searchParams: {
    radiusMiles: number;
    maxAgeDays: number;
    totalCandidates: number;
    totalComps: number;
  };
}

// ============================================================
// Constants
// ============================================================

const BORO_CODE_TO_NAME: Record<string, string> = {
  "1": "Manhattan", "2": "Bronx", "3": "Brooklyn", "4": "Queens", "5": "Staten Island",
};

const MULTIFAMILY_CLASSES = ["C", "D", "S"];

// ============================================================
// Cache — 24hr TTL, 100 max entries
// ============================================================

const cache = new Map<string, { data: CompResult; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;
const CACHE_MAX = 100;

function getCached(key: string): CompResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}

function setCache(key: string, data: CompResult) {
  if (cache.size >= CACHE_MAX) {
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [k, v] of cache) { if (v.ts < oldestTs) { oldestTs = v.ts; oldestKey = k; } }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { data, ts: Date.now() });
}

// ============================================================
// Basic search (preserved for backward compatibility)
// ============================================================

export async function searchComps(params: CompSearchParams): Promise<{ comps: CompSale[]; summary: CompSummary }> {
  const {
    zip,
    radiusMiles = 2,
    yearsBack = 5,
    minUnits = 5,
    minPrice = 500000,
    limit = 50,
  } = params;

  const nearbyZips = findZipsWithinRadius(zip, radiusMiles);
  if (nearbyZips.length === 0) {
    return { comps: [], summary: emptySummary() };
  }

  const subjectCentroid = getZipCentroid(zip);
  const zipList = nearbyZips.map(z => z.zip);

  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsBack);
  const dateStr = cutoffDate.toISOString().split("T")[0];

  const zipFilter = zipList.map(z => `'${z}'`).join(",");
  const classFilter = MULTIFAMILY_CLASSES.map(c => `building_class_at_time_of_sale like '${c}%'`).join(" OR ");

  const where = [
    `zip_code in(${zipFilter})`,
    `(${classFilter})`,
    `sale_price > ${minPrice}`,
    `total_units >= ${minUnits}`,
    `sale_date >= '${dateStr}'`,
  ].join(" AND ");

  const url = `${SALES_API}?$where=${encodeURIComponent(where)}&$order=sale_date DESC&$limit=${limit * 2}`;

  try {
    const response = await fetch(url, {
      headers: { "X-App-Token": process.env.NYC_OPEN_DATA_TOKEN || "" },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      console.error("Comps API error:", response.status, await response.text());
      return { comps: [], summary: emptySummary() };
    }

    const rawData = await response.json();
    if (!Array.isArray(rawData)) return { comps: [], summary: emptySummary() };

    const comps: CompSale[] = [];

    for (const sale of rawData) {
      const salePrice = parseInt((sale.sale_price || "0").replace(/[,$]/g, ""));
      const totalUnits = parseInt(sale.total_units || "0");
      const grossSqft = parseInt(sale.gross_square_feet || "0");

      if (salePrice < minPrice || totalUnits < minUnits) continue;

      const saleZip = sale.zip_code || "";
      let distance = 0;
      if (subjectCentroid) {
        const saleCentroid = getZipCentroid(saleZip);
        if (saleCentroid) {
          distance = haversineDistance(subjectCentroid.lat, subjectCentroid.lng, saleCentroid.lat, saleCentroid.lng);
        }
      }

      if (distance > radiusMiles) continue;

      comps.push({
        address: formatAddress(sale.address || "", sale.apartment_number),
        borough: BORO_CODE_TO_NAME[sale.borough] || sale.borough || "",
        neighborhood: sale.neighborhood || "",
        zip: saleZip,
        buildingClass: sale.building_class_at_time_of_sale || "",
        totalUnits,
        residentialUnits: parseInt(sale.residential_units || "0"),
        commercialUnits: parseInt(sale.commercial_units || "0"),
        landSqft: parseInt(sale.land_square_feet || "0"),
        grossSqft,
        yearBuilt: parseInt(sale.year_built || "0"),
        salePrice,
        saleDate: sale.sale_date || "",
        pricePerUnit: totalUnits > 0 ? Math.round(salePrice / totalUnits) : 0,
        pricePerSqft: grossSqft > 0 ? Math.round(salePrice / grossSqft) : 0,
        distance: Math.round(distance * 10) / 10,
      });

      if (comps.length >= limit) break;
    }

    comps.sort((a, b) => a.distance - b.distance || new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime());
    return { comps, summary: calculateSummary(comps) };
  } catch (error) {
    console.error("Comps search error:", error);
    return { comps: [], summary: emptySummary() };
  }
}

// ============================================================
// Enhanced: Find Comparable Sales with Similarity Scoring
// Uses PLUTO bounding box → DOF Rolling Sales → scoring
// ============================================================

export async function findComparableSales(params: {
  bbl: string;
  borough: string;
  lat: number;
  lng: number;
  units: number;
  sqft: number;
  yearBuilt: number;
  buildingClass: string;
  assessedValue: number;
  address?: string;
  lastSalePrice?: number;
  lastSaleDate?: string;
  radiusMiles?: number;
  maxAgeDays?: number;
  maxComps?: number;
}): Promise<CompResult> {
  const {
    bbl, borough, lat, lng, units, sqft, yearBuilt, buildingClass, assessedValue,
    address = "", lastSalePrice, lastSaleDate,
    radiusMiles = 0.5, maxAgeDays = 730, maxComps = 15,
  } = params;

  // Check cache
  const cacheKey = `comps:${bbl}:${radiusMiles}:${maxAgeDays}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const emptyResult: CompResult = {
    subject: { bbl, address, units, sqft: sqft || undefined, assessedValue, lastSalePrice, lastSaleDate },
    comps: [],
    valuation: { estimatedValue: 0, pricePerUnit: 0, confidence: "low", confidenceScore: 0, methodology: "Insufficient comparable sales data" },
    searchParams: { radiusMiles, maxAgeDays, totalCandidates: 0, totalComps: 0 },
  };

  if (!lat || !lng) return emptyResult;

  try {
    // Step 1: Build bounding box from radius
    // ~1 degree latitude ≈ 69 miles, ~1 degree longitude ≈ 52.5 miles at NYC latitude
    const latDelta = radiusMiles / 69;
    const lngDelta = radiusMiles / 52.5;
    const swLat = lat - latDelta;
    const neLat = lat + latDelta;
    const swLng = lng - lngDelta;
    const neLng = lng + lngDelta;

    // Step 2: Query PLUTO for nearby multifamily properties with lat/lng
    const classPrefix = buildingClass ? buildingClass[0] : "";
    const classFilter = MULTIFAMILY_CLASSES.map(c => `bldgclass like '${c}%'`).join(" OR ");

    const plutoWhere = [
      `latitude > ${swLat}`,
      `latitude < ${neLat}`,
      `longitude > ${swLng}`,
      `longitude < ${neLng}`,
      `unitsres >= 2`,
      `(${classFilter})`,
    ].join(" AND ");

    const plutoUrl = `${PLUTO_API}?$where=${encodeURIComponent(plutoWhere)}&$select=borocode,block,lot,address,unitsres,unitstotal,yearbuilt,bldgclass,bldgarea,assesstot,latitude,longitude,zipcode&$limit=500`;

    // Step 3: Query DOF Rolling Sales for the same bounding box area
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
    const dateStr = cutoffDate.toISOString().split("T")[0];

    // DOF Rolling Sales has zip_code — get zip codes from the bounding box
    // We'll use the same zip-based approach but with all zips in the bounding box
    const salesClassFilter = MULTIFAMILY_CLASSES.map(c => `building_class_at_time_of_sale like '${c}%'`).join(" OR ");
    const salesWhere = [
      `(${salesClassFilter})`,
      `sale_price > 500000`,
      `total_units >= 2`,
      `sale_date >= '${dateStr}'`,
    ].join(" AND ");

    const salesUrl = `${SALES_API}?$where=${encodeURIComponent(salesWhere)}&$order=sale_date DESC&$limit=500`;

    // Fetch both in parallel
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const [plutoRes, salesRes] = await Promise.allSettled([
      fetch(plutoUrl, {
        headers: { "X-App-Token": process.env.NYC_OPEN_DATA_TOKEN || "" },
        signal: controller.signal,
      }).then(r => r.ok ? r.json() : []),
      fetch(salesUrl, {
        headers: { "X-App-Token": process.env.NYC_OPEN_DATA_TOKEN || "" },
        signal: controller.signal,
      }).then(r => r.ok ? r.json() : []),
    ]);

    clearTimeout(timeout);

    const plutoProperties = Array.isArray(plutoRes.status === "fulfilled" ? plutoRes.value : [])
      ? (plutoRes.status === "fulfilled" ? plutoRes.value : [])
      : [];
    const salesData = Array.isArray(salesRes.status === "fulfilled" ? salesRes.value : [])
      ? (salesRes.status === "fulfilled" ? salesRes.value : [])
      : [];

    // Step 4: Build a map of PLUTO properties by BBL for lat/lng lookup
    const plutoByBbl = new Map<string, { lat: number; lng: number; units: number; sqft: number; yearBuilt: number; bldgClass: string; address: string }>();
    for (const p of plutoProperties) {
      const pLat = parseFloat(p.latitude || "0");
      const pLng = parseFloat(p.longitude || "0");
      if (pLat === 0 || pLng === 0) continue;
      const pBbl = (p.borocode || "") + (p.block || "").padStart(5, "0") + (p.lot || "").padStart(4, "0");
      if (pBbl === bbl) continue; // Skip subject property
      plutoByBbl.set(pBbl, {
        lat: pLat, lng: pLng,
        units: parseInt(p.unitsres || p.unitstotal || "0"),
        sqft: parseInt(p.bldgarea || "0"),
        yearBuilt: parseInt(p.yearbuilt || "0"),
        bldgClass: p.bldgclass || "",
        address: p.address || "",
      });
    }

    // Step 5: Match sales to PLUTO data, compute distance + similarity
    const candidates: CompProperty[] = [];
    let totalCandidates = 0;

    for (const sale of salesData) {
      const salePrice = parseInt((sale.sale_price || "0").replace(/[,$]/g, ""));
      const saleTotalUnits = parseInt(sale.total_units || "0");
      if (salePrice < 500000 || saleTotalUnits < 2) continue;

      totalCandidates++;

      // Try to match to PLUTO property for lat/lng
      const saleBoro = sale.borough || "";
      const saleBlock = (sale.block || "").padStart(5, "0");
      const saleLot = (sale.lot || "").padStart(4, "0");
      const saleBbl = saleBoro + saleBlock + saleLot;
      if (saleBbl === bbl) continue; // Skip subject

      const plutoInfo = plutoByBbl.get(saleBbl);

      // Calculate distance
      let compLat = 0, compLng = 0, distanceMiles = 0;
      if (plutoInfo) {
        compLat = plutoInfo.lat;
        compLng = plutoInfo.lng;
        distanceMiles = haversineDistance(lat, lng, compLat, compLng);
      } else {
        // Fallback: use zip centroid distance
        const saleZip = sale.zip_code || "";
        const centroid = getZipCentroid(saleZip);
        if (centroid) {
          compLat = centroid.lat;
          compLng = centroid.lng;
          distanceMiles = haversineDistance(lat, lng, compLat, compLng);
        }
      }

      // Filter by radius
      if (distanceMiles > radiusMiles) continue;

      const grossSqft = parseInt(sale.gross_square_feet || "0");
      const compYearBuilt = plutoInfo?.yearBuilt || parseInt(sale.year_built || "0");
      const compClass = plutoInfo?.bldgClass || sale.building_class_at_time_of_sale || "";
      const compUnits = plutoInfo?.units || saleTotalUnits;

      // Calculate similarity score
      const score = calculateSimilarity(
        { units, yearBuilt, buildingClass, distanceMiles: 0, saleDate: "" },
        { units: compUnits, yearBuilt: compYearBuilt, buildingClass: compClass, distanceMiles, saleDate: sale.sale_date || "" },
      );

      candidates.push({
        bbl: saleBbl,
        address: plutoInfo?.address || formatAddress(sale.address || "", sale.apartment_number),
        borough: BORO_CODE_TO_NAME[saleBoro] || saleBoro,
        salePrice,
        saleDate: sale.sale_date || "",
        units: compUnits,
        sqft: plutoInfo?.sqft || grossSqft || undefined,
        yearBuilt: compYearBuilt,
        buildingClass: compClass,
        pricePerUnit: compUnits > 0 ? Math.round(salePrice / compUnits) : 0,
        pricePerSqft: (plutoInfo?.sqft || grossSqft) > 0 ? Math.round(salePrice / (plutoInfo?.sqft || grossSqft)) : undefined,
        distanceMiles: Math.round(distanceMiles * 100) / 100,
        similarityScore: score,
        lat: compLat,
        lng: compLng,
      });
    }

    // Step 6: Sort by similarity score descending, take top N
    candidates.sort((a, b) => b.similarityScore - a.similarityScore);
    const topComps = candidates.slice(0, maxComps);

    // Step 7: Calculate valuation
    const valuation = calculateValuation(topComps, units, sqft, radiusMiles, maxAgeDays);

    const result: CompResult = {
      subject: { bbl, address, units, sqft: sqft || undefined, assessedValue, lastSalePrice, lastSaleDate },
      comps: topComps,
      valuation,
      searchParams: { radiusMiles, maxAgeDays, totalCandidates, totalComps: topComps.length },
    };

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Enhanced comps search error:", error);
    return emptyResult;
  }
}

// ============================================================
// Similarity Scoring (0-100)
// ============================================================

function calculateSimilarity(
  subject: { units: number; yearBuilt: number; buildingClass: string; distanceMiles: number; saleDate: string },
  comp: { units: number; yearBuilt: number; buildingClass: string; distanceMiles: number; saleDate: string },
): number {
  let score = 0;

  // Distance (max 25 pts)
  if (comp.distanceMiles <= 0.1) score += 25;
  else if (comp.distanceMiles <= 0.25) score += 20;
  else if (comp.distanceMiles <= 0.5) score += 15;
  else if (comp.distanceMiles <= 1) score += 10;
  else score += 5;

  // Unit count similarity (max 20 pts)
  if (subject.units > 0 && comp.units > 0) {
    const ratio = Math.abs(subject.units - comp.units) / Math.max(subject.units, 1);
    if (ratio <= 0.1) score += 20;
    else if (ratio <= 0.25) score += 15;
    else if (ratio <= 0.5) score += 10;
    else score += 5;
  }

  // Building class match (max 20 pts)
  if (subject.buildingClass && comp.buildingClass) {
    if (subject.buildingClass === comp.buildingClass) score += 20;
    else if (subject.buildingClass[0] === comp.buildingClass[0]) score += 15;
    else score += 5;
  }

  // Year built proximity (max 15 pts)
  if (subject.yearBuilt > 0 && comp.yearBuilt > 0) {
    const yearDiff = Math.abs(subject.yearBuilt - comp.yearBuilt);
    if (yearDiff <= 10) score += 15;
    else if (yearDiff <= 25) score += 10;
    else score += 5;
  }

  // Recency of sale (max 20 pts)
  if (comp.saleDate) {
    const months = Math.max(0, (Date.now() - new Date(comp.saleDate).getTime()) / (30.44 * 24 * 60 * 60 * 1000));
    if (months <= 6) score += 20;
    else if (months <= 12) score += 15;
    else if (months <= 18) score += 10;
    else score += 5;
  }

  return score;
}

// ============================================================
// Valuation Calculator
// ============================================================

function calculateValuation(
  comps: CompProperty[],
  subjectUnits: number,
  subjectSqft: number,
  radiusMiles: number,
  maxAgeDays: number,
): CompValuation {
  if (comps.length === 0) {
    return { estimatedValue: 0, pricePerUnit: 0, confidence: "low", confidenceScore: 0, methodology: "No comparable sales found" };
  }

  // Weighted average price/unit (weighted by similarity score)
  const ppuComps = comps.filter(c => c.pricePerUnit > 0);
  let weightedPpu = 0;
  let totalWeight = 0;
  for (const c of ppuComps) {
    weightedPpu += c.pricePerUnit * c.similarityScore;
    totalWeight += c.similarityScore;
  }
  const avgPpu = totalWeight > 0 ? Math.round(weightedPpu / totalWeight) : 0;

  // Weighted average price/sqft
  const ppsComps = comps.filter(c => c.pricePerSqft && c.pricePerSqft > 0);
  let weightedPps = 0;
  let totalPpsWeight = 0;
  for (const c of ppsComps) {
    weightedPps += c.pricePerSqft! * c.similarityScore;
    totalPpsWeight += c.similarityScore;
  }
  const avgPps = totalPpsWeight > 0 ? Math.round(weightedPps / totalPpsWeight) : 0;

  // Estimate value via unit method
  const unitEstimate = avgPpu > 0 ? avgPpu * subjectUnits : 0;

  // Estimate value via sqft method
  const sqftEstimate = avgPps > 0 && subjectSqft > 0 ? avgPps * subjectSqft : 0;

  // Final estimate: average of both methods if both available
  let estimatedValue = 0;
  if (unitEstimate > 0 && sqftEstimate > 0) {
    estimatedValue = Math.round((unitEstimate + sqftEstimate) / 2);
  } else {
    estimatedValue = unitEstimate || sqftEstimate;
  }

  // Confidence scoring
  const avgSimilarity = comps.length > 0
    ? comps.reduce((s, c) => s + c.similarityScore, 0) / comps.length
    : 0;

  // Value spread (coefficient of variation)
  const ppuValues = ppuComps.map(c => c.pricePerUnit);
  const ppuMean = ppuValues.length > 0 ? ppuValues.reduce((s, v) => s + v, 0) / ppuValues.length : 0;
  const ppuStdDev = ppuValues.length > 1
    ? Math.sqrt(ppuValues.reduce((s, v) => s + (v - ppuMean) ** 2, 0) / (ppuValues.length - 1))
    : 0;
  const cv = ppuMean > 0 ? ppuStdDev / ppuMean : 1;

  let confidenceScore = 0;
  // Comp count contribution (max 30)
  if (comps.length >= 7) confidenceScore += 30;
  else if (comps.length >= 5) confidenceScore += 25;
  else if (comps.length >= 3) confidenceScore += 15;
  else confidenceScore += 5;

  // Similarity contribution (max 40)
  confidenceScore += Math.min(40, Math.round(avgSimilarity * 0.55));

  // Spread contribution (max 30 — lower CV = higher confidence)
  if (cv < 0.15) confidenceScore += 30;
  else if (cv < 0.25) confidenceScore += 25;
  else if (cv < 0.4) confidenceScore += 15;
  else confidenceScore += 5;

  confidenceScore = Math.min(100, confidenceScore);

  let confidence: "high" | "medium" | "low" = "low";
  if (confidenceScore >= 70) confidence = "high";
  else if (confidenceScore >= 45) confidence = "medium";

  const months = Math.round(maxAgeDays / 30);
  const methodology = `Based on ${comps.length} comparable sale${comps.length === 1 ? "" : "s"} within ${radiusMiles} mi over the past ${months} months (avg similarity: ${Math.round(avgSimilarity)}/100)`;

  return {
    estimatedValue,
    pricePerUnit: avgPpu,
    pricePerSqft: avgPps || undefined,
    confidence,
    confidenceScore,
    methodology,
  };
}

// ============================================================
// Helpers
// ============================================================

function formatAddress(address: string, apt?: string): string {
  const parts = [address.trim()];
  if (apt && apt.trim()) parts.push(`Apt ${apt.trim()}`);
  return parts.join(", ");
}

function calculateSummary(comps: CompSale[]): CompSummary {
  if (comps.length === 0) return emptySummary();

  const ppuValues = comps.map(c => c.pricePerUnit).filter(v => v > 0).sort((a, b) => a - b);
  const ppsValues = comps.map(c => c.pricePerSqft).filter(v => v > 0).sort((a, b) => a - b);

  return {
    count: comps.length,
    avgPricePerUnit: ppuValues.length > 0 ? Math.round(ppuValues.reduce((s, v) => s + v, 0) / ppuValues.length) : 0,
    medianPricePerUnit: median(ppuValues),
    avgPricePerSqft: ppsValues.length > 0 ? Math.round(ppsValues.reduce((s, v) => s + v, 0) / ppsValues.length) : 0,
    medianPricePerSqft: median(ppsValues),
    minPricePerUnit: ppuValues.length > 0 ? ppuValues[0] : 0,
    maxPricePerUnit: ppuValues.length > 0 ? ppuValues[ppuValues.length - 1] : 0,
  };
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 !== 0 ? arr[mid] : Math.round((arr[mid - 1] + arr[mid]) / 2);
}

function emptySummary(): CompSummary {
  return { count: 0, avgPricePerUnit: 0, medianPricePerUnit: 0, avgPricePerSqft: 0, medianPricePerSqft: 0, minPricePerUnit: 0, maxPricePerUnit: 0 };
}
