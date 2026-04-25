"use server";

/**
 * Street Intelligence — viewport-based data fetching for street-level map layers.
 * All layers activate at zoom 16+ and fetch per-viewport from NYC Open Data APIs.
 */

const NYC = "https://data.cityofnewyork.us/resource";

// Run async tasks in parallel with bounded concurrency
async function parallelBatches(tasks: (() => Promise<void>)[], concurrency = 4): Promise<void> {
  for (let i = 0; i < tasks.length; i += concurrency) {
    await Promise.allSettled(tasks.slice(i, i + concurrency).map(fn => fn()));
  }
}

// Dataset IDs
const DOB_PERMITS = "ic3t-wcy2"; // DOB Job Applications
const ROLLING_SALES = "usep-8jbt"; // DOF Rolling Sales
const HPD_VIOLATIONS = "wvxf-dwi5"; // HPD Violations
const DOB_VIOLATIONS = "3h2n-5cm9"; // DOB Violations
const COMPLAINTS_311 = "erm2-nwe9"; // 311 Service Requests

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ConstructionActivity {
  address: string;
  jobType: string; // NB, A1, A2, DM, etc.
  jobStatus: string;
  description: string;
  estimatedCost: number;
  ownerName: string;
  filingDate: string;
  permitType: string;
  stories: number;
  units: number;
  lat: number;
  lng: number;
  block: string;
  lot: string;
  boroCode: string;
}

export interface RecentSale {
  address: string;
  salePrice: number;
  saleDate: string;
  buildingClass: string;
  units: number;
  sqFt: number;
  pricePerSqFt: number;
  borough: string;
  block: string;
  lot: string;
  lat: number;
  lng: number;
}

export interface ViolationPoint {
  address: string;
  violationClass: string; // A, B, C (HPD) or severity level
  source: "hpd" | "dob";
  status: string;
  description: string;
  date: string;
  lat: number;
  lng: number;
  block: string;
  lot: string;
}

export interface Complaint311 {
  complaintType: string;
  descriptor: string;
  status: string;
  createdDate: string;
  address: string;
  lat: number;
  lng: number;
  category: "noise" | "sanitary" | "pest" | "building" | "other";
}

export interface StreetViewData {
  imageUrl: string;
  fullUrl: string;
  lat: number;
  lng: number;
}

/* ------------------------------------------------------------------ */
/*  R1: Construction Activity (DOB Permits)                           */
/* ------------------------------------------------------------------ */

export async function fetchConstructionInBounds(bounds: {
  south: number; west: number; north: number; east: number;
}): Promise<ConstructionActivity[]> {
  try {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const dateStr = twoYearsAgo.toISOString().split("T")[0];

    const url = new URL(`${NYC}/${DOB_PERMITS}.json`);
    url.searchParams.set("$where", [
      `latitude > ${bounds.south}`,
      `latitude < ${bounds.north}`,
      `longitude > ${bounds.west}`,
      `longitude < ${bounds.east}`,
      `latest_action_date > '${dateStr}'`,
      `job_type in('NB','A1','A2','DM')`,
    ].join(" AND "));
    url.searchParams.set("$select",
      "house__,street_name,job_type,job_status,job_description,total_est__fee," +
      "owner_s_business_name,owner_s_first_name,owner_s_last_name," +
      "latest_action_date,work_type,proposed_no_of_stories,proposed_dwelling_units," +
      "latitude,longitude,block,lot,community___board,borough"
    );
    url.searchParams.set("$limit", "300");
    url.searchParams.set("$order", "latest_action_date DESC");

    const res = await fetch(url.toString());
    if (!res.ok) return [];

    const data = await res.json();
    const boroCodeMap: Record<string, string> = {
      MANHATTAN: "1", BRONX: "2", BROOKLYN: "3", QUEENS: "4", "STATEN ISLAND": "5",
    };

    return data
      .map((d: any) => {
        const lat = parseFloat(d.latitude || "0");
        const lng = parseFloat(d.longitude || "0");
        if (!lat || !lng) return null;

        const ownerBiz = d.owner_s_business_name || "";
        const ownerPerson = [d.owner_s_first_name, d.owner_s_last_name]
          .filter(Boolean).join(" ").trim();

        return {
          address: [d.house__, d.street_name].filter(Boolean).join(" ").trim(),
          jobType: d.job_type || "",
          jobStatus: d.job_status || "",
          description: d.job_description || d.work_type || "",
          estimatedCost: parseInt(d.total_est__fee || "0"),
          ownerName: ownerBiz || ownerPerson || "",
          filingDate: d.latest_action_date || "",
          permitType: d.work_type || d.job_type || "",
          stories: parseInt(d.proposed_no_of_stories || "0"),
          units: parseInt(d.proposed_dwelling_units || "0"),
          lat,
          lng,
          block: (d.block || "").replace(/^0+/, ""),
          lot: (d.lot || "").replace(/^0+/, ""),
          boroCode: boroCodeMap[d.borough] || "",
        } as ConstructionActivity;
      })
      .filter(Boolean) as ConstructionActivity[];
  } catch (err) {
    console.error("Construction fetch error:", err);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  R2: Recent Sales (DOF Rolling Sales)                              */
/* ------------------------------------------------------------------ */

export async function fetchRecentSalesInBounds(bounds: {
  south: number; west: number; north: number; east: number;
}): Promise<RecentSale[]> {
  try {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const dateStr = twoYearsAgo.toISOString().split("T")[0];

    const url = new URL(`${NYC}/${ROLLING_SALES}.json`);
    url.searchParams.set("$where", [
      `latitude > ${bounds.south}`,
      `latitude < ${bounds.north}`,
      `longitude > ${bounds.west}`,
      `longitude < ${bounds.east}`,
      `sale_date > '${dateStr}'`,
      `sale_price > 100000`, // Filter out $0 and nominal transfers
    ].join(" AND "));
    url.searchParams.set("$select",
      "address,sale_price,sale_date,building_class_at_time_of_sale," +
      "residential_units,gross_square_feet,borough,block,lot,latitude,longitude"
    );
    url.searchParams.set("$limit", "200");
    url.searchParams.set("$order", "sale_date DESC");

    const res = await fetch(url.toString());
    if (!res.ok) return [];

    const data = await res.json();
    const boroNames: Record<string, string> = {
      "1": "Manhattan", "2": "Bronx", "3": "Brooklyn", "4": "Queens", "5": "Staten Island",
    };

    return data
      .map((d: any) => {
        const lat = parseFloat(d.latitude || "0");
        const lng = parseFloat(d.longitude || "0");
        if (!lat || !lng) return null;

        const price = parseInt(d.sale_price || "0");
        const sqFt = parseInt(d.gross_square_feet || "0");

        return {
          address: d.address || "",
          salePrice: price,
          saleDate: d.sale_date || "",
          buildingClass: d.building_class_at_time_of_sale || "",
          units: parseInt(d.residential_units || "0"),
          sqFt,
          pricePerSqFt: sqFt > 0 ? Math.round(price / sqFt) : 0,
          borough: boroNames[d.borough] || "",
          block: (d.block || "").replace(/^0+/, ""),
          lot: (d.lot || "").replace(/^0+/, ""),
          lat,
          lng,
        } as RecentSale;
      })
      .filter(Boolean) as RecentSale[];
  } catch (err) {
    console.error("Recent sales fetch error:", err);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  R3: Violation Density (HPD + DOB Violations)                      */
/* ------------------------------------------------------------------ */

export async function fetchViolationsInBounds(bounds: {
  south: number; west: number; north: number; east: number;
}): Promise<ViolationPoint[]> {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const dateStr = oneYearAgo.toISOString().split("T")[0];

  const results: ViolationPoint[] = [];

  // HPD Violations
  try {
    const url = new URL(`${NYC}/${HPD_VIOLATIONS}.json`);
    url.searchParams.set("$where", [
      `latitude > ${bounds.south}`,
      `latitude < ${bounds.north}`,
      `longitude > ${bounds.west}`,
      `longitude < ${bounds.east}`,
      `inspectiondate > '${dateStr}'`,
    ].join(" AND "));
    url.searchParams.set("$select",
      "boroid,block,lot,streetaddress,class,violationstatus,novdescription,inspectiondate,latitude,longitude"
    );
    url.searchParams.set("$limit", "400");
    url.searchParams.set("$order", "inspectiondate DESC");

    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json();
      for (const d of data) {
        const lat = parseFloat(d.latitude || "0");
        const lng = parseFloat(d.longitude || "0");
        if (!lat || !lng) continue;

        results.push({
          address: d.streetaddress || "",
          violationClass: d.class || "B",
          source: "hpd",
          status: d.violationstatus || "",
          description: d.novdescription || "",
          date: d.inspectiondate || "",
          lat,
          lng,
          block: (d.block || "").replace(/^0+/, ""),
          lot: (d.lot || "").replace(/^0+/, ""),
        });
      }
    }
  } catch (err) {
    console.error("HPD violations fetch error:", err);
  }

  // DOB Violations
  try {
    const url = new URL(`${NYC}/${DOB_VIOLATIONS}.json`);
    url.searchParams.set("$where", [
      `latitude > ${bounds.south}`,
      `latitude < ${bounds.north}`,
      `longitude > ${bounds.west}`,
      `longitude < ${bounds.east}`,
      `issue_date > '${dateStr}'`,
    ].join(" AND "));
    url.searchParams.set("$select",
      "house__,street,violation_type,violation_category,disposition_comments,issue_date,latitude,longitude,block,lot"
    );
    url.searchParams.set("$limit", "300");
    url.searchParams.set("$order", "issue_date DESC");

    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json();
      for (const d of data) {
        const lat = parseFloat(d.latitude || "0");
        const lng = parseFloat(d.longitude || "0");
        if (!lat || !lng) continue;

        results.push({
          address: [d.house__, d.street].filter(Boolean).join(" ").trim(),
          violationClass: d.violation_type || "DOB",
          source: "dob",
          status: d.violation_category || "",
          description: d.disposition_comments || "",
          date: d.issue_date || "",
          lat,
          lng,
          block: (d.block || "").replace(/^0+/, ""),
          lot: (d.lot || "").replace(/^0+/, ""),
        });
      }
    }
  } catch (err) {
    console.error("DOB violations fetch error:", err);
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  R4: 311 Quality-of-Life Heatmap                                   */
/* ------------------------------------------------------------------ */

const COMPLAINT_CATEGORIES: Record<string, Complaint311["category"]> = {
  "Noise - Residential": "noise",
  "Noise - Commercial": "noise",
  "Noise - Street/Sidewalk": "noise",
  "Noise - Vehicle": "noise",
  "Noise - Helicopter": "noise",
  "Noise": "noise",
  "HEAT/HOT WATER": "building",
  "PLUMBING": "building",
  "PAINT/PLASTER": "building",
  "ELEVATOR": "building",
  "DOOR/WINDOW": "building",
  "ELECTRIC": "building",
  "GENERAL CONSTRUCTION": "building",
  "FLOORING/STAIRS": "building",
  "WATER LEAK": "building",
  "Rodent": "pest",
  "Rat Sighting": "pest",
  "Mouse Sighting": "pest",
  "Mosquitoes": "pest",
  "Unsanitary Condition": "sanitary",
  "Dirty Conditions": "sanitary",
  "Sanitation Condition": "sanitary",
  "Missed Collection": "sanitary",
  "Litter Basket / Request": "sanitary",
  "Overflowing Litter Baskets": "sanitary",
};

function categorize311(complaintType: string): Complaint311["category"] {
  if (COMPLAINT_CATEGORIES[complaintType]) return COMPLAINT_CATEGORIES[complaintType];
  const upper = complaintType.toUpperCase();
  if (upper.includes("NOISE")) return "noise";
  if (upper.includes("RODENT") || upper.includes("RAT") || upper.includes("PEST") || upper.includes("MOUSE")) return "pest";
  if (upper.includes("SANIT") || upper.includes("DIRTY") || upper.includes("LITTER") || upper.includes("GARBAGE")) return "sanitary";
  if (upper.includes("HEAT") || upper.includes("PLUMB") || upper.includes("ELEV") || upper.includes("ELECTRIC") || upper.includes("PAINT")) return "building";
  return "other";
}

export async function fetch311InBounds(bounds: {
  south: number; west: number; north: number; east: number;
}): Promise<Complaint311[]> {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const dateStr = sixMonthsAgo.toISOString().split("T")[0];

    const url = new URL(`${NYC}/${COMPLAINTS_311}.json`);
    url.searchParams.set("$where", [
      `latitude > ${bounds.south}`,
      `latitude < ${bounds.north}`,
      `longitude > ${bounds.west}`,
      `longitude < ${bounds.east}`,
      `created_date > '${dateStr}'`,
    ].join(" AND "));
    url.searchParams.set("$select",
      "complaint_type,descriptor,status,created_date,incident_address,latitude,longitude"
    );
    url.searchParams.set("$limit", "500");
    url.searchParams.set("$order", "created_date DESC");

    const res = await fetch(url.toString());
    if (!res.ok) return [];

    const data = await res.json();
    return data
      .map((d: any) => {
        const lat = parseFloat(d.latitude || "0");
        const lng = parseFloat(d.longitude || "0");
        if (!lat || !lng) return null;

        return {
          complaintType: d.complaint_type || "",
          descriptor: d.descriptor || "",
          status: d.status || "",
          createdDate: d.created_date || "",
          address: d.incident_address || "",
          lat,
          lng,
          category: categorize311(d.complaint_type || ""),
        } as Complaint311;
      })
      .filter(Boolean) as Complaint311[];
  } catch (err) {
    console.error("311 complaints fetch error:", err);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  R6: Google Street View                                            */
/* ------------------------------------------------------------------ */

const GOOGLE_STREET_VIEW_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

export async function getStreetViewUrls(
  address: string,
  lat: number,
  lng: number,
): Promise<StreetViewData> {
  // Static image URL (600x300, heading toward building)
  const params = new URLSearchParams({
    size: "600x300",
    location: `${lat},${lng}`,
    fov: "90",
    pitch: "10",
    key: GOOGLE_STREET_VIEW_KEY,
  });
  const imageUrl = GOOGLE_STREET_VIEW_KEY
    ? `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`
    : "";

  // Full interactive Street View URL (opens in new tab)
  const fullUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;

  return { imageUrl, fullUrl, lat, lng };
}

/* ------------------------------------------------------------------ */
/*  Enrichment: Batch violation/complaint/permit counts by borough+block */
/* ------------------------------------------------------------------ */

/**
 * Fetch HPD violation counts grouped by block+lot for a set of borocode+block pairs.
 * Returns a Map keyed by "borocode-block-lot" → count.
 * Batches to avoid Socrata query limits.
 */
export async function fetchViolationCountsByBlocks(
  blocks: { boroCode: string; block: string }[],
): Promise<Record<string, number>> {
  if (blocks.length === 0) return {};
  const counts: Record<string, number> = {};

  // Group by boroCode
  const byBoro = new Map<string, Set<string>>();
  for (const b of blocks) {
    const key = b.boroCode;
    if (!byBoro.has(key)) byBoro.set(key, new Set());
    byBoro.get(key)!.add(b.block);
  }

  // Build all chunk fetches, then run in parallel (4 concurrent max)
  const fetches: (() => Promise<void>)[] = [];
  for (const [boroCode, blockSet] of byBoro) {
    const blockArr = Array.from(blockSet);
    for (let i = 0; i < blockArr.length; i += 50) {
      const chunk = blockArr.slice(i, i + 50);
      const blockIn = chunk.map(b => `'${b}'`).join(",");
      fetches.push(async () => {
        try {
          const url = `${NYC}/${HPD_VIOLATIONS}.json?$select=block,lot,count(*) as cnt&$group=block,lot&$where=boroid='${boroCode}' AND block IN(${blockIn})&$limit=5000`;
          const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (!res.ok) return;
          const data = await res.json();
          for (const row of data) {
            const key = `${boroCode}-${row.block}-${row.lot}`;
            counts[key] = parseInt(row.cnt || "0");
          }
        } catch { /* skip failed batch */ }
      });
    }
  }
  await parallelBatches(fetches, 4);

  return counts;
}

/**
 * Fetch 311 complaint counts grouped by block for a set of borocode+block pairs.
 * 311 data doesn't have block/lot — uses lat/lng proximity, so we aggregate by incident_address.
 * For performance, we count per borough in the current viewport bounds.
 */
export async function fetch311CountsByBounds(
  swLat: number, swLng: number, neLat: number, neLng: number,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  try {
    const url = `${NYC}/${COMPLAINTS_311}.json?$select=incident_address,count(*) as cnt&$group=incident_address&$where=latitude>${swLat} AND latitude<${neLat} AND longitude>${swLng} AND longitude<${neLng} AND complaint_type IN('HEAT/HOT WATER','PLUMBING','PAINT/PLASTER','WATER LEAK','ELEVATOR','NOISE - RESIDENTIAL','NOISE - COMMERCIAL','UNSANITARY CONDITION')&$limit=2000&$order=cnt DESC`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return counts;
    const data = await res.json();
    for (const row of data) {
      if (row.incident_address) {
        counts[row.incident_address.toUpperCase().trim()] = parseInt(row.cnt || "0");
      }
    }
  } catch { /* skip */ }
  return counts;
}

/**
 * Fetch active DOB permit counts grouped by block+lot.
 */
export async function fetchPermitCountsByBlocks(
  blocks: { boroCode: string; block: string }[],
): Promise<Record<string, number>> {
  if (blocks.length === 0) return {};
  const counts: Record<string, number> = {};

  const byBoro = new Map<string, Set<string>>();
  for (const b of blocks) {
    const key = b.boroCode;
    if (!byBoro.has(key)) byBoro.set(key, new Set());
    byBoro.get(key)!.add(b.block);
  }

  const boroNameMap: Record<string, string> = { "1": "MANHATTAN", "2": "BRONX", "3": "BROOKLYN", "4": "QUEENS", "5": "STATEN ISLAND" };

  const fetches: (() => Promise<void>)[] = [];
  for (const [boroCode, blockSet] of byBoro) {
    const boroName = boroNameMap[boroCode];
    if (!boroName) continue;
    const blockArr = Array.from(blockSet);
    for (let i = 0; i < blockArr.length; i += 50) {
      const chunk = blockArr.slice(i, i + 50);
      const blockIn = chunk.map(b => `'${b.replace(/^0+/, "")}'`).join(",");
      fetches.push(async () => {
        try {
          const url = `${NYC}/${DOB_PERMITS}.json?$select=block,lot,count(*) as cnt&$group=block,lot&$where=borough='${boroName}' AND block IN(${blockIn})&$limit=5000`;
          const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (!res.ok) return;
          const data = await res.json();
          for (const row of data) {
            const blk = (row.block || "").replace(/^0+/, "");
            const lt = (row.lot || "").replace(/^0+/, "");
            const key = `${boroCode}-${blk}-${lt}`;
            counts[key] = (counts[key] || 0) + parseInt(row.cnt || "0");
          }
        } catch { /* skip */ }
      });
    }
  }
  await parallelBatches(fetches, 4);

  return counts;
}

/**
 * Fetch most recent sale per block+lot from DOF Rolling Sales.
 */
export async function fetchRecentSalesByBlocks(
  blocks: { boroCode: string; block: string }[],
): Promise<Record<string, { date: string; price: number }>> {
  if (blocks.length === 0) return {};
  const results: Record<string, { date: string; price: number }> = {};

  const byBoro = new Map<string, Set<string>>();
  for (const b of blocks) {
    if (!byBoro.has(b.boroCode)) byBoro.set(b.boroCode, new Set());
    byBoro.get(b.boroCode)!.add(b.block);
  }

  const fetches: (() => Promise<void>)[] = [];
  for (const [boroCode, blockSet] of byBoro) {
    const blockArr = Array.from(blockSet);
    for (let i = 0; i < blockArr.length; i += 50) {
      const chunk = blockArr.slice(i, i + 50);
      const blockIn = chunk.map(b => `'${b}'`).join(",");
      fetches.push(async () => {
        try {
          const url = `${NYC}/${ROLLING_SALES}.json?$select=block,lot,sale_date,sale_price&$where=borough='${boroCode}' AND block IN(${blockIn}) AND sale_price>'0'&$order=sale_date DESC&$limit=5000`;
          const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (!res.ok) return;
          const data = await res.json();
          for (const row of data) {
            const key = `${boroCode}-${row.block}-${row.lot}`;
            if (!results[key]) {
              results[key] = {
                date: row.sale_date || "",
                price: parseInt(row.sale_price || "0"),
              };
            }
          }
        } catch { /* skip */ }
      });
    }
  }
  await parallelBatches(fetches, 4);

  return results;
}
