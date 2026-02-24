"use server";

// ============================================================
// Renovation Estimate Server Actions
// Pulls building data from existing sources, feeds into the
// renovation cost engine. No new API keys needed.
// ============================================================

import { estimateRenovationCost } from "@/lib/renovation-engine";
import type { RenovationEstimate, RenovationParams } from "@/lib/renovation-engine";

const NYC_BASE = "https://data.cityofnewyork.us/resource";
const PLUTO_ID = "64uk-42ks";

export async function fetchRenovationEstimate(bbl: string): Promise<RenovationEstimate | null> {
  if (!bbl || bbl.length < 10) return null;

  const boroCode = bbl[0];
  const block = bbl.slice(1, 6);
  const lot = bbl.slice(6, 10);
  const token = process.env.NYC_OPEN_DATA_APP_TOKEN;
  const tokenParam = token ? `&$$app_token=${token}` : "";

  try {
    // Fetch building data in parallel from existing APIs
    const [plutoResult, violResult, permitResult, ll84Result, compResult] = await Promise.allSettled([
      // PLUTO — units, sqft, year, class, floors
      fetch(`${NYC_BASE}/${PLUTO_ID}.json?$where=borocode='${boroCode}' AND block='${block}' AND lot='${lot}'&$limit=1${tokenParam}`)
        .then(r => r.ok ? r.json() : []),
      // HPD Violations — open count
      fetch(`${NYC_BASE}/wvxf-dwi5.json?$where=boroid='${boroCode}' AND block='${block}' AND lot='${lot}' AND currentstatus='OPEN'&$select=count(*) as cnt${tokenParam}`)
        .then(r => r.ok ? r.json() : []),
      // DOB Permits — recent (last 5 years)
      fetch(`${NYC_BASE}/ic3t-wcy2.json?$where=borough='${boroCode === "1" ? "MANHATTAN" : boroCode === "2" ? "BRONX" : boroCode === "3" ? "BROOKLYN" : boroCode === "4" ? "QUEENS" : "STATEN ISLAND"}' AND block='${block}' AND lot='${lot}' AND issuance_date>'${new Date().getFullYear() - 5}-01-01'&$select=count(*) as cnt,max(issuance_date) as latest${tokenParam}`)
        .then(r => r.ok ? r.json() : []),
      // LL84 Energy — latest grade
      fetch(`${NYC_BASE}/5zyy-y8am.json?$where=bbl_10_digits='${bbl}'&$order=order_number DESC&$limit=1&$select=energy_star_score,letter_grade${tokenParam}`)
        .then(r => r.ok ? r.json() : []),
      // Comp valuation
      import("./comps-actions").then(m => m.fetchCompsWithValuation(bbl)).catch(() => null),
    ]);

    const pluto = plutoResult.status === "fulfilled" ? plutoResult.value?.[0] : null;
    if (!pluto) return null; // Need at minimum PLUTO data

    const hpdViolations = violResult.status === "fulfilled"
      ? parseInt(violResult.value?.[0]?.cnt || "0")
      : 0;

    const permitData = permitResult.status === "fulfilled" ? permitResult.value?.[0] : null;
    const dobPermitsRecent = permitData ? parseInt(permitData.cnt || "0") : 0;
    const latestPermitDate = permitData?.latest;
    const lastRenovation = latestPermitDate ? new Date(latestPermitDate).getFullYear() : undefined;

    const ll84 = ll84Result.status === "fulfilled" ? ll84Result.value?.[0] : null;
    const ll84Grade = ll84?.letter_grade || undefined;

    const compData = compResult.status === "fulfilled" ? compResult.value : null;
    const currentValue = compData?.valuation?.estimatedValue || undefined;

    const units = parseInt(pluto.unitsres || pluto.unitstotal || "0");
    const sqft = parseInt(pluto.bldgarea || "0");
    const yearBuilt = parseInt(pluto.yearbuilt || "0");
    const buildingClass = pluto.bldgclass || "";
    const floors = parseInt(pluto.numfloors || "0");
    const hasElevator = floors > 5 || buildingClass.startsWith("D");
    const assessedValue = parseInt(pluto.assesstot || "0");

    if (units <= 0) return null; // Need units for per-unit costing

    const params: RenovationParams = {
      units,
      sqft,
      yearBuilt,
      buildingClass,
      floors,
      hasElevator,
      hpdViolations,
      dobPermitsRecent,
      ll84Grade,
      lastRenovation,
      currentValue,
      assessedValue,
    };

    return estimateRenovationCost(params);
  } catch (err) {
    console.warn("Renovation estimate error:", err);
    return null;
  }
}
