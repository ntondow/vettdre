// ============================================================
// Comps Engine — NYC DOF Rolling Sales Data
// Searches comparable property sales for underwriting
// ============================================================

import { findZipsWithinRadius, getZipCentroid, haversineDistance } from "./nyc-zip-centroids";

const SALES_API = "https://data.cityofnewyork.us/resource/usep-8jbt.json";

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

// Map borough names from ACRIS sales data to codes
const BORO_NAME_TO_CODE: Record<string, string> = {
  "1": "1", "2": "2", "3": "3", "4": "4", "5": "5",
  "MANHATTAN": "1", "BRONX": "2", "BROOKLYN": "3", "QUEENS": "4", "STATEN ISLAND": "5",
};

const BORO_CODE_TO_NAME: Record<string, string> = {
  "1": "Manhattan", "2": "Bronx", "3": "Brooklyn", "4": "Queens", "5": "Staten Island",
};

// Building classes for multifamily: C (walk-up), D (elevator), S (mixed-use)
const MULTIFAMILY_CLASSES = ["C", "D", "S"];

export async function searchComps(params: CompSearchParams): Promise<{ comps: CompSale[]; summary: CompSummary }> {
  const {
    zip,
    radiusMiles = 2,
    yearsBack = 5,
    minUnits = 5,
    minPrice = 500000,
    limit = 50,
  } = params;

  // Find all zips within radius
  const nearbyZips = findZipsWithinRadius(zip, radiusMiles);
  if (nearbyZips.length === 0) {
    return { comps: [], summary: emptySummary() };
  }

  const subjectCentroid = getZipCentroid(zip);
  const zipList = nearbyZips.map(z => z.zip);

  // Build date filter
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsBack);
  const dateStr = cutoffDate.toISOString().split("T")[0];

  // Query NYC DOF Rolling Sales
  // Filter: multifamily classes (C, D, S prefix), min units, min price, within date range
  // We need to batch zip codes into the WHERE clause
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
      headers: {
        "X-App-Token": process.env.NYC_OPEN_DATA_TOKEN || "",
      },
      next: { revalidate: 3600 }, // cache for 1 hour
    });

    if (!response.ok) {
      console.error("Comps API error:", response.status, await response.text());
      return { comps: [], summary: emptySummary() };
    }

    const rawData = await response.json();
    if (!Array.isArray(rawData)) {
      return { comps: [], summary: emptySummary() };
    }

    // Parse and filter results
    const comps: CompSale[] = [];

    for (const sale of rawData) {
      const salePrice = parseInt((sale.sale_price || "0").replace(/[,$]/g, ""));
      const totalUnits = parseInt(sale.total_units || "0");
      const grossSqft = parseInt(sale.gross_square_feet || "0");

      // Skip non-arm's-length transactions ($0, very low prices)
      if (salePrice < minPrice || totalUnits < minUnits) continue;

      const saleZip = sale.zip_code || "";
      let distance = 0;
      if (subjectCentroid) {
        const saleCentroid = getZipCentroid(saleZip);
        if (saleCentroid) {
          distance = haversineDistance(subjectCentroid.lat, subjectCentroid.lng, saleCentroid.lat, saleCentroid.lng);
        }
      }

      // Filter by actual radius (zip centroid is approximate)
      if (distance > radiusMiles) continue;

      const resUnits = parseInt(sale.residential_units || "0");
      const comUnits = parseInt(sale.commercial_units || "0");

      comps.push({
        address: formatAddress(sale.address || "", sale.apartment_number),
        borough: BORO_CODE_TO_NAME[sale.borough] || sale.borough || "",
        neighborhood: sale.neighborhood || "",
        zip: saleZip,
        buildingClass: sale.building_class_at_time_of_sale || "",
        totalUnits,
        residentialUnits: resUnits,
        commercialUnits: comUnits,
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

    // Sort by distance then date
    comps.sort((a, b) => a.distance - b.distance || new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime());

    return { comps, summary: calculateSummary(comps) };
  } catch (error) {
    console.error("Comps search error:", error);
    return { comps: [], summary: emptySummary() };
  }
}

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
