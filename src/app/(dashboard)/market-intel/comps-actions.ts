"use server";

// ============================================================
// Comps Server Actions — PLUTO-Enhanced Comparable Sales
// Looks up subject property, then finds comparable sales
// with similarity scoring and automated valuation
// ============================================================

import { findComparableSales } from "@/lib/comps-engine";
import type { CompResult } from "@/lib/comps-engine";

const PLUTO_API = "https://data.cityofnewyork.us/resource/64uk-42ks.json";
const SALES_API = "https://data.cityofnewyork.us/resource/usep-8jbt.json";

// ============================================================
// Fetch comps by BBL — auto-resolves subject property from PLUTO
// ============================================================

export async function fetchCompsWithValuation(
  bbl: string,
  options?: { radiusMiles?: number; maxAgeDays?: number },
): Promise<CompResult> {
  const emptyResult: CompResult = {
    subject: { bbl, address: "", units: 0 },
    comps: [],
    valuation: { estimatedValue: 0, pricePerUnit: 0, confidence: "low", confidenceScore: 0, methodology: "Could not look up subject property" },
    searchParams: { radiusMiles: options?.radiusMiles ?? 0.5, maxAgeDays: options?.maxAgeDays ?? 730, totalCandidates: 0, totalComps: 0 },
  };

  try {
    // Parse BBL
    const boroCode = bbl[0];
    const block = bbl.slice(1, 6);
    const lot = bbl.slice(6, 10);

    // Look up subject from PLUTO (get units, sqft, year, class, lat/lng)
    const plutoWhere = `borocode='${boroCode}' AND block='${block}' AND lot='${lot}'`;
    const plutoUrl = `${PLUTO_API}?$where=${encodeURIComponent(plutoWhere)}&$select=address,unitsres,unitstotal,yearbuilt,bldgclass,bldgarea,assesstot,latitude,longitude,zipcode&$limit=1`;

    const plutoRes = await fetch(plutoUrl, {
      headers: { "X-App-Token": process.env.NYC_OPEN_DATA_TOKEN || "" },
    });

    if (!plutoRes.ok) return emptyResult;
    const plutoData = await plutoRes.json();
    if (!Array.isArray(plutoData) || plutoData.length === 0) return emptyResult;

    const p = plutoData[0];
    const lat = parseFloat(p.latitude || "0");
    const lng = parseFloat(p.longitude || "0");
    const units = parseInt(p.unitsres || p.unitstotal || "0");
    const sqft = parseInt(p.bldgarea || "0");
    const yearBuilt = parseInt(p.yearbuilt || "0");
    const buildingClass = p.bldgclass || "";
    const assessedValue = parseInt(p.assesstot || "0");
    const address = p.address || "";

    if (units < 1) return emptyResult;

    // Look up last sale from DOF Rolling Sales
    const salesWhere = `borough='${boroCode}' AND block='${block}' AND lot='${lot}' AND sale_price > 10000`;
    const salesUrl = `${SALES_API}?$where=${encodeURIComponent(salesWhere)}&$order=sale_date DESC&$limit=1`;

    let lastSalePrice: number | undefined;
    let lastSaleDate: string | undefined;

    try {
      const salesRes = await fetch(salesUrl, {
        headers: { "X-App-Token": process.env.NYC_OPEN_DATA_TOKEN || "" },
      });
      if (salesRes.ok) {
        const salesData = await salesRes.json();
        if (Array.isArray(salesData) && salesData.length > 0) {
          const price = parseInt((salesData[0].sale_price || "0").replace(/[,$]/g, ""));
          if (price > 10000) {
            lastSalePrice = price;
            lastSaleDate = salesData[0].sale_date || undefined;
          }
        }
      }
    } catch {
      // Non-critical — continue without last sale
    }

    const boroNames: Record<string, string> = { "1": "Manhattan", "2": "Bronx", "3": "Brooklyn", "4": "Queens", "5": "Staten Island" };

    return findComparableSales({
      bbl,
      borough: boroNames[boroCode] || "",
      lat,
      lng,
      units,
      sqft,
      yearBuilt,
      buildingClass,
      assessedValue,
      address,
      lastSalePrice,
      lastSaleDate,
      radiusMiles: options?.radiusMiles,
      maxAgeDays: options?.maxAgeDays,
    });
  } catch (error) {
    console.error("fetchCompsWithValuation error:", error);
    return emptyResult;
  }
}

// ============================================================
// Fetch comps with explicit subject data (skip PLUTO lookup)
// Used when subject property data is already available
// ============================================================

export async function fetchCompsForSubject(params: {
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
}): Promise<CompResult> {
  return findComparableSales(params);
}
