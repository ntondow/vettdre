"use server";

// ============================================================
// Short-Term Rental (Airbnb) Projection Server Actions
// Pulls building data from PLUTO + HUD FMR, feeds into
// the STR income projection engine. No new API keys needed.
// ============================================================

import { projectSTRIncome, matchNeighborhood } from "@/lib/airbnb-market";
import type { STRProjection } from "@/lib/airbnb-market";

const NYC_BASE = "https://data.cityofnewyork.us/resource";
const PLUTO_ID = "64uk-42ks";

export async function fetchSTRProjection(bbl: string): Promise<STRProjection | null> {
  if (!bbl || bbl.length < 10) return null;

  const boroCode = bbl[0];
  const block = bbl.slice(1, 6);
  const lot = bbl.slice(6, 10);
  const token = process.env.NYC_OPEN_DATA_APP_TOKEN;
  const tokenParam = token ? `&$$app_token=${token}` : "";

  const boroughName = ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"][parseInt(boroCode)] || "Manhattan";

  try {
    // Fetch PLUTO data for building details
    const plutoRes = await fetch(
      `${NYC_BASE}/${PLUTO_ID}.json?$where=borocode='${boroCode}' AND block='${block}' AND lot='${lot}'&$limit=1&$select=unitsres,unitstotal,bldgarea,zipcode,address${tokenParam}`
    );
    if (!plutoRes.ok) return null;
    const plutoData = await plutoRes.json();
    const pluto = plutoData?.[0];
    if (!pluto) return null;

    const units = parseInt(pluto.unitsres || pluto.unitstotal || "0");
    if (units <= 0) return null;

    const sqft = parseInt(pluto.bldgarea || "0");
    const avgUnitSqft = units > 0 && sqft > 0 ? Math.round(sqft / units) : undefined;
    const zip = pluto.zipcode || "";
    const address = pluto.address || "";

    // Determine neighborhood from zip
    const neighborhood = matchNeighborhood(address, boroughName, zip) || boroughName;

    // Try to get HUD FMR for LTR comparison
    let hudFmr2BR: number | undefined;
    try {
      const { fetchFmrByZip } = await import("@/lib/hud");
      const fmr = await fetchFmrByZip(zip);
      if (fmr) hudFmr2BR = fmr.twoBr;
    } catch {
      // HUD API unavailable — projection will use fallback estimate
    }

    // Try to get census median rent (requires full address)
    let censusMedianRent: number | undefined;
    try {
      const fullAddr = `${address}, ${boroughName}, NY ${zip}`;
      const { fetchNeighborhoodProfile } = await import("./neighborhood-actions");
      const profile = await fetchNeighborhoodProfile(fullAddr);
      if (profile?.census?.medianRent) {
        censusMedianRent = profile.census.medianRent;
      }
    } catch {
      // Census unavailable — will use HUD or fallback
    }

    return projectSTRIncome({
      neighborhood,
      borough: boroughName,
      units,
      avgUnitSqft,
      censusMedianRent,
      hudFmr2BR,
    });
  } catch (err) {
    console.warn("STR projection error:", err);
    return null;
  }
}
