"use server";

import { findComparableSales } from "@/lib/comps-engine";
import { deriveMarketCapRate } from "@/lib/cap-rate-engine";
import type { CapRateAnalysis } from "@/lib/cap-rate-engine";

const PLUTO_API = "https://data.cityofnewyork.us/resource/64uk-42ks.json";

// ── Fetch Market Cap Rate by BBL ────────────────────────────
// Auto-resolves subject from PLUTO, fetches comps, derives cap rate

export async function fetchMarketCapRate(
  bbl: string,
  options?: { radiusMiles?: number; maxAgeDays?: number },
): Promise<CapRateAnalysis | null> {
  try {
    if (!bbl || bbl.length < 10) return null;

    const boroCode = bbl[0];
    const block = bbl.slice(1, 6);
    const lot = bbl.slice(6, 10);
    const boroNames: Record<string, string> = {
      "1": "Manhattan", "2": "Bronx", "3": "Brooklyn",
      "4": "Queens", "5": "Staten Island",
    };
    const borough = boroNames[boroCode] || "Brooklyn";

    // Fetch subject from PLUTO
    const plutoWhere = `borocode='${boroCode}' AND block='${block}' AND lot='${lot}'`;
    const plutoUrl = `${PLUTO_API}?$where=${encodeURIComponent(plutoWhere)}&$select=address,unitsres,unitstotal,yearbuilt,bldgclass,bldgarea,numfloors,assesstot,latitude,longitude&$limit=1`;

    const plutoRes = await fetch(plutoUrl, {
      headers: { "X-App-Token": process.env.NYC_OPEN_DATA_TOKEN || "" },
    });

    if (!plutoRes.ok) return null;
    const plutoData = await plutoRes.json();
    if (!Array.isArray(plutoData) || plutoData.length === 0) return null;

    const p = plutoData[0];
    const lat = parseFloat(p.latitude || "0");
    const lng = parseFloat(p.longitude || "0");
    const unitsRes = parseInt(p.unitsres || p.unitstotal || "0");
    const yearBuilt = parseInt(p.yearbuilt || "0");
    const bldgClass = p.bldgclass || "";
    const bldgArea = parseInt(p.bldgarea || "0");
    const numFloors = parseInt(p.numfloors || "0");
    const assessedValue = parseInt(p.assesstot || "0");
    const address = p.address || "";
    const hasElevator = numFloors > 5 || bldgClass.startsWith("D");

    if (unitsRes < 2 || (lat === 0 && lng === 0)) return null;

    // Fetch comparable sales
    const compResult = await findComparableSales({
      bbl,
      borough,
      lat,
      lng,
      units: unitsRes,
      sqft: bldgArea,
      yearBuilt,
      buildingClass: bldgClass,
      assessedValue,
      address,
      radiusMiles: options?.radiusMiles ?? 0.5,
      maxAgeDays: options?.maxAgeDays ?? 730,
      maxComps: 20,
    });

    // Derive cap rate from comps
    return deriveMarketCapRate({
      subject: {
        yearBuilt,
        hasElevator,
        numFloors,
        bldgClass,
        bldgArea,
        unitsRes,
        borough,
      },
      comps: compResult.comps,
    });
  } catch (error) {
    console.error("fetchMarketCapRate error:", error);
    return null;
  }
}
