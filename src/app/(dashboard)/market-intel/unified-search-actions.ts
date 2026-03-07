"use server";

const BASE = "https://data.cityofnewyork.us/resource";
const PLUTO_ID = "64uk-42ks";

const BORO_NAME = ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"];

// ============================================================
// TYPES
// ============================================================

export type QueryType = "address" | "bbl" | "entity" | "name" | "fuzzy";

export interface SearchResult {
  address: string;
  borough: string;
  zip: string;
  units: number;
  floors: number;
  yearBuilt: number;
  sqft: number;
  lotArea: number;
  assessedValue: number;
  ownerName: string;
  bbl: string;
  boroCode: string;
  block: string;
  lot: string;
  lat: number;
  lng: number;
  buildingClass: string;
  zoning: string;
  builtFAR: number;
  residFAR: number;
  commFAR: number;
  facilFAR: number;
  matchType?: "address" | "owner"; // for fuzzy search labeling
}

export interface OwnerGroup {
  owner: string;
  properties: SearchResult[];
  totalAssessed: number;
  totalUnits: number;
}

export interface UnifiedSearchResult {
  results: SearchResult[];
  total: number;
  queryType: QueryType;
  groupedByOwner?: OwnerGroup[];
  suggestion?: string; // "Did you mean..." fallback hint
}

export interface UnifiedSearchFilters {
  borough?: string;       // borocode: '1','2','3','4','5'
  neighborhoodBounds?: { swLat: number; swLng: number; neLat: number; neLng: number };
  buildingClass?: string; // PLUTO bldgclass prefix
  zoning?: string;        // PLUTO zonedist1 prefix
  minUnits?: number;
  maxUnits?: number;
  yearBuiltAfter?: number;
  yearBuiltBefore?: number;
  minFloors?: number;
  minAssessedValue?: number;
  maxAssessedValue?: number;
  excludePublic?: boolean;
  sortBy?: "units" | "value" | "year" | "floors" | "address";
}

// ============================================================
// QUERY TYPE DETECTION
// ============================================================

const ENTITY_KEYWORDS = /\b(LLC|LP|INC|CORP|TRUST|ASSOCIATES|GROUP|PARTNERS|HOLDINGS|MANAGEMENT|REALTY|PROPERTIES|CO|LTD)\b/i;

export async function detectQueryType(query: string): Promise<QueryType> {
  const trimmed = query.trim();
  // BBL: X-XXXXX-XXXX or 10 digits
  if (/^\d{1}-\d{1,5}-\d{1,4}$/.test(trimmed) || /^\d{10}$/.test(trimmed)) return "bbl";
  // Entity keywords
  if (ENTITY_KEYWORDS.test(trimmed)) return "entity";
  // Starts with number → likely address
  if (/^\d/.test(trimmed)) return "address";
  // Two+ words, no numbers → likely a person's name
  if (trimmed.split(/\s+/).length >= 2 && !/\d/.test(trimmed)) return "name";
  return "fuzzy";
}

// ============================================================
// HELPERS
// ============================================================

/** Escape single quotes for Socrata SoQL */
function esc(s: string): string {
  return s.replace(/'/g, "''");
}

const PLUTO_SELECT = [
  "address", "ownername", "unitsres", "unitstotal", "yearbuilt",
  "numfloors", "assesstot", "bldgclass", "zonedist1", "borocode",
  "block", "lot", "latitude", "longitude", "bldgarea", "lotarea",
  "zipcode", "builtfar", "residfar", "commfar", "facilfar",
].join(",");

function parsePLUTO(p: any): SearchResult {
  return {
    address: p.address || "",
    borough: BORO_NAME[parseInt(p.borocode)] || "",
    zip: p.zipcode || "",
    units: parseInt(p.unitsres || "0"),
    floors: parseInt(p.numfloors || "0"),
    yearBuilt: parseInt(p.yearbuilt || "0"),
    sqft: parseInt(p.bldgarea || "0"),
    lotArea: parseInt(p.lotarea || "0"),
    assessedValue: parseInt(p.assesstot || "0"),
    ownerName: p.ownername || "",
    bbl: `${p.borocode}-${(p.block || "").padStart(5, "0")}-${(p.lot || "").padStart(4, "0")}`,
    boroCode: p.borocode || "",
    block: p.block || "",
    lot: p.lot || "",
    lat: parseFloat(p.latitude || "0"),
    lng: parseFloat(p.longitude || "0"),
    buildingClass: p.bldgclass || "",
    zoning: p.zonedist1 || "",
    builtFAR: parseFloat(p.builtfar || "0"),
    residFAR: parseFloat(p.residfar || "0"),
    commFAR: parseFloat(p.commfar || "0"),
    facilFAR: parseFloat(p.facilfar || "0"),
  };
}

const SORT_MAP: Record<string, string> = {
  units: "unitsres DESC",
  value: "assesstot DESC",
  year: "yearbuilt DESC",
  floors: "numfloors DESC",
  address: "address ASC",
};

// ============================================================
// MAIN UNIFIED SEARCH
// ============================================================

export async function unifiedSearch(
  query: string,
  filters: UnifiedSearchFilters = {},
  offset = 0,
  limit = 50,
): Promise<UnifiedSearchResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2 && !filters.borough && !filters.neighborhoodBounds) {
    return { results: [], total: 0, queryType: "fuzzy" };
  }

  const queryType = await detectQueryType(trimmed);

  switch (queryType) {
    case "bbl":
      return searchByBBL(trimmed);
    case "address":
      return searchByAddress(trimmed, filters, offset, limit);
    case "entity":
      return searchByOwnerName(trimmed, filters, offset, limit, true);
    case "name":
      return searchByOwnerName(trimmed, filters, offset, limit, false);
    case "fuzzy":
    default:
      if (trimmed.length >= 2) {
        return fuzzySearch(trimmed, filters, offset, limit);
      }
      return searchByFiltersOnly(filters, offset, limit);
  }
}

// ============================================================
// BBL SEARCH — direct PLUTO fetch
// ============================================================

async function searchByBBL(query: string): Promise<UnifiedSearchResult> {
  const bblMatch = query.match(/^(\d)[\s-]?(\d{1,5})[\s-]?(\d{1,4})$/);
  const bbl10 = query.match(/^(\d)(\d{5})(\d{4})$/);
  const m = bblMatch || bbl10;
  if (!m) return { results: [], total: 0, queryType: "bbl" };

  const boro = m[1];
  const block = m[2].replace(/^0+/, "");
  const lot = m[3].replace(/^0+/, "");

  const results = await queryPLUTO(
    [`borocode='${boro}'`, `block='${block}'`, `lot='${lot}'`],
    {}, 0, 10,
  );
  return { results, total: results.length, queryType: "bbl" };
}

// ============================================================
// ADDRESS SEARCH — GeoSearch geocode → BBL, with LIKE fallback
// ============================================================

async function searchByAddress(
  query: string, filters: UnifiedSearchFilters, offset: number, limit: number,
): Promise<UnifiedSearchResult> {
  // Step 1: Try NYC GeoSearch for exact geocoding
  const geoResults = await geocodeNYC(query);

  if (geoResults.length > 0) {
    // Exact geocode hit(s) — fetch PLUTO by BBL for each
    const bblConditions = geoResults.slice(0, 5).map(g => {
      const boro = g.bbl.substring(0, 1);
      const block = g.bbl.substring(1, 6).replace(/^0+/, "");
      const lot = g.bbl.substring(6, 10).replace(/^0+/, "");
      return `(borocode='${boro}' AND block='${block}' AND lot='${lot}')`;
    });
    const condition = bblConditions.length === 1 ? bblConditions[0] : `(${bblConditions.join(" OR ")})`;
    const results = await queryPLUTO([condition], filters, 0, 50);
    if (results.length > 0) {
      return { results, total: results.length, queryType: "address" };
    }
  }

  // Step 2: PLUTO address LIKE query with normalization
  const variants = normalizeAddressVariants(query);
  const normalized = variants[0]; // primary normalized form
  const parts = normalized.split(/\s+/);
  const houseNum = parts[0];
  const streetWords = parts.slice(1);

  const STREET_TYPES = new Set([
    "STREET", "AVENUE", "BOULEVARD", "DRIVE", "PLACE", "COURT",
    "ROAD", "LANE", "TERRACE", "PARKWAY", "WAY", "CIRCLE",
    "HIGHWAY", "SQUARE", "EXPRESSWAY", "TURNPIKE",
  ]);

  // Pass 2a: Full normalized address prefix match (all variants)
  if (/^\d+$/.test(houseNum) && streetWords.length > 0) {
    // Build LIKE conditions for primary + ordinal variant
    const likeConditions = variants.map(v => {
      const vParts = v.split(/\s+/);
      const vStreetWords = vParts.slice(1);
      const lastW = vStreetWords[vStreetWords.length - 1];
      // Keep the full normalized form (including street type) for precise matching
      return `upper(address) like '${esc(v)}%'`;
    });

    const addressCondition = likeConditions.length === 1
      ? likeConditions[0]
      : `(${likeConditions.join(" OR ")})`;

    console.log("[address-search] Pass 2a query:", addressCondition);
    const { results, total } = await queryPLUTOWithCount([addressCondition], filters, offset, limit);
    console.log("[address-search] Pass 2a results:", results.length);

    if (results.length > 0) {
      return { results: rankAddressResults(results, normalized), total, queryType: "address" };
    }

    // Pass 2b: Try with street type stripped (broader match)
    const lastWord = streetWords[streetWords.length - 1];
    if (STREET_TYPES.has(lastWord) && streetWords.length > 1) {
      const coreStreet = streetWords.slice(0, -1).join(" ");
      // Also try ordinal variant of the core street
      const coreConditions = [`upper(address) like '${esc(houseNum)} ${esc(coreStreet)}%'`];
      for (const v of variants.slice(1)) {
        const vParts = v.split(/\s+/);
        const vCore = vParts.slice(1, -1).join(" "); // strip house num and last (street type)
        if (vCore && vCore !== coreStreet) {
          coreConditions.push(`upper(address) like '${esc(houseNum)} ${esc(vCore)}%'`);
        }
      }
      const coreCondition = coreConditions.length === 1
        ? coreConditions[0]
        : `(${coreConditions.join(" OR ")})`;

      console.log("[address-search] Pass 2b query:", coreCondition);
      const r2 = await queryPLUTOWithCount([coreCondition], filters, offset, limit);
      console.log("[address-search] Pass 2b results:", r2.results.length);

      if (r2.results.length > 0) {
        return { results: rankAddressResults(r2.results, normalized), total: r2.total, queryType: "address" };
      }
    }

    // Pass 2c: contains LIKE on address field only (never use $q — it searches all columns)
    {
      const containsCondition = `upper(address) like '%${esc(normalized)}%'`;
      console.log("[address-search] Pass 2c contains fallback:", containsCondition);
      const r2c = await queryPLUTOWithCount([containsCondition], filters, offset, limit);
      console.log("[address-search] Pass 2c results:", r2c.results.length);
      if (r2c.results.length > 0) {
        return { results: rankAddressResults(r2c.results, normalized), total: r2c.total, queryType: "address" };
      }
    }
  } else {
    // Non-numeric leading search (street name only)
    const addressCondition = `upper(address) like '%${esc(normalized)}%'`;
    console.log("[address-search] non-numeric query:", addressCondition);
    const { results, total } = await queryPLUTOWithCount([addressCondition], filters, offset, limit);
    console.log("[address-search] non-numeric results:", results.length);
    if (results.length > 0) {
      return { results, total, queryType: "address" };
    }
  }

  // Step 3: If no results, try broader search and suggest
  if (/^\d+$/.test(houseNum) && streetWords.length > 0) {
    const streetOnly = streetWords.join(" ");
    const lastW = streetWords[streetWords.length - 1];
    const core = STREET_TYPES.has(lastW) && streetWords.length > 1
      ? streetWords.slice(0, -1).join(" ")
      : streetOnly;
    const broaderResults = await queryPLUTO(
      [`upper(address) like '%${esc(core)}%'`], filters, 0, 5,
    );
    if (broaderResults.length > 0) {
      return {
        results: [],
        total: 0,
        queryType: "address",
        suggestion: `No exact match for "${query}". Did you mean a building on ${core}?`,
      };
    }
  }

  return { results: [], total: 0, queryType: "address" };
}

// ============================================================
// OWNER NAME / ENTITY SEARCH (with portfolio grouping)
// ============================================================

async function searchByOwnerName(
  query: string, filters: UnifiedSearchFilters, offset: number, limit: number,
  isEntity: boolean,
): Promise<UnifiedSearchResult> {
  const upper = query.toUpperCase().trim();
  const ownerCondition = `upper(ownername) like '%${esc(upper)}%'`;
  const { results, total } = await queryPLUTOWithCount([ownerCondition], filters, offset, limit);

  // Group by owner
  const ownerMap = new Map<string, SearchResult[]>();
  for (const r of results) {
    const key = r.ownerName.toUpperCase().trim() || "UNKNOWN";
    if (!ownerMap.has(key)) ownerMap.set(key, []);
    ownerMap.get(key)!.push(r);
  }

  const groupedByOwner: OwnerGroup[] = Array.from(ownerMap.entries())
    .map(([owner, props]) => ({
      owner,
      properties: props.sort((a, b) => b.units - a.units),
      totalAssessed: props.reduce((sum, p) => sum + p.assessedValue, 0),
      totalUnits: props.reduce((sum, p) => sum + p.units, 0),
    }))
    .sort((a, b) => b.totalUnits - a.totalUnits);

  return {
    results,
    total,
    queryType: isEntity ? "entity" : "name",
    groupedByOwner,
  };
}

// ============================================================
// FUZZY SEARCH — address + owner simultaneously
// ============================================================

async function fuzzySearch(
  query: string, filters: UnifiedSearchFilters, offset: number, limit: number,
): Promise<UnifiedSearchResult> {
  const normalized = normalizeAddress(query);
  const upper = query.toUpperCase().trim();

  // Search both address and owner in parallel
  const halfLimit = Math.ceil(limit / 2);
  const [addressResults, ownerResults] = await Promise.all([
    queryPLUTO([`upper(address) like '%${esc(normalized)}%'`], filters, offset, halfLimit),
    queryPLUTO([`upper(ownername) like '%${esc(upper)}%'`], filters, offset, halfLimit),
  ]);

  // Tag match type and merge (deduplicate by BBL)
  const seen = new Set<string>();
  const merged: SearchResult[] = [];

  for (const r of addressResults) {
    if (!seen.has(r.bbl)) { seen.add(r.bbl); merged.push({ ...r, matchType: "address" }); }
  }
  for (const r of ownerResults) {
    if (!seen.has(r.bbl)) { seen.add(r.bbl); merged.push({ ...r, matchType: "owner" }); }
  }

  return { results: merged, total: merged.length, queryType: "fuzzy" };
}

// ============================================================
// FILTER-ONLY SEARCH
// ============================================================

async function searchByFiltersOnly(
  filters: UnifiedSearchFilters, offset: number, limit: number,
): Promise<UnifiedSearchResult> {
  const { results, total } = await queryPLUTOWithCount([], filters, offset, limit);
  return { results, total, queryType: "fuzzy" };
}

// ============================================================
// NYC GEOSEARCH GEOCODER
// ============================================================

interface GeoResult {
  bbl: string;
  label: string;
  borough: string;
  lat: number;
  lng: number;
}

async function geocodeNYC(query: string): Promise<GeoResult[]> {
  try {
    const url = `https://geosearch.planninglabs.nyc/v2/search?text=${encodeURIComponent(query)}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features || [])
      .filter((f: any) => f.properties?.pad_bbl)
      .map((f: any) => ({
        bbl: f.properties.pad_bbl,
        label: f.properties.label || "",
        borough: f.properties.borough || "",
        lat: f.geometry?.coordinates?.[1] || 0,
        lng: f.geometry?.coordinates?.[0] || 0,
      }));
  } catch {
    return [];
  }
}

// ============================================================
// PLUTO QUERY BUILDER
// ============================================================

const PUBLIC_OWNERS = [
  "NYC HOUSING AUTHORITY", "NYCHA", "NEW YORK CITY HOUSING AUTH",
  "DEPT OF HOUSING PRESERV", "NYC DEPT OF ED", "NYC DEPARTMENT OF EDUCATION",
  "BOARD OF EDUCATION", "NYC TRANSIT AUTHORITY", "METROPOLITAN TRANS AUTH",
  "NYC HEALTH & HOSPITALS", "HEALTH & HOSP CORP", "DEPARTMENT OF PARKS",
  "PARKS & RECREATION", "SCHOOL CONSTRUCTION AUTH", "FIRE DEPT CITY OF NY",
  "POLICE DEPT CITY OF NY", "DEPT OF CITYWIDE ADMIN",
];

function isPublicOwner(name: string): boolean {
  if (!name) return false;
  const upper = name.toUpperCase().trim();
  return PUBLIC_OWNERS.some(p => upper.includes(p)) ||
    upper.startsWith("CITY OF ") || upper.startsWith("STATE OF ") ||
    upper.startsWith("UNITED STATES") || upper.includes("HOUSING AUTHORITY");
}

const STREET_ABBREVS: Record<string, string> = {
  ST: "STREET", AVE: "AVENUE", AV: "AVENUE", BLVD: "BOULEVARD",
  DR: "DRIVE", PL: "PLACE", CT: "COURT", RD: "ROAD",
  LN: "LANE", TER: "TERRACE", PKWY: "PARKWAY", CIR: "CIRCLE",
  HWY: "HIGHWAY", SQ: "SQUARE", EXPY: "EXPRESSWAY", TPKE: "TURNPIKE",
};

const DIRECTIONAL_FULL: Record<string, string> = {
  N: "NORTH", S: "SOUTH", E: "EAST", W: "WEST",
};

/**
 * Normalize a user-typed address into the format PLUTO stores.
 * Handles abbreviations, directionals, and ordinal suffixes.
 *
 * "600 ave z"       → "600 AVENUE Z"
 * "300 w 57 st"     → "300 WEST 57 STREET"  (also tries "57TH" variant)
 * "1 fulton ave"    → "1 FULTON AVENUE"
 * "1 ave a"         → "1 AVENUE A"  (single-letter street name preserved)
 * "600 Madison"     → "600 MADISON" (no change needed)
 */
function normalizeAddress(raw: string): string {
  const words = raw.toUpperCase().trim().split(/\s+/);
  const result: string[] = [];

  // Find the house number (first word if numeric)
  const hasHouseNum = words.length > 0 && /^\d+$/.test(words[0]);

  for (let i = 0; i < words.length; i++) {
    const w = words[i];

    // Directional abbreviation — only expand single-letter N/S/E/W when:
    //   1. It's immediately after the house number (position 1)
    //   2. There are more words after it (not the last word — "AVENUE E" keeps E)
    // This prevents expanding single-letter street names like "Z" in "AVENUE Z"
    if (DIRECTIONAL_FULL[w] && w.length === 1) {
      if (hasHouseNum && i === 1 && i < words.length - 1) {
        result.push(DIRECTIONAL_FULL[w]);
      } else {
        result.push(w); // keep as-is (single-letter street name)
      }
      continue;
    }

    // Street type abbreviation
    if (STREET_ABBREVS[w]) {
      result.push(STREET_ABBREVS[w]);
      continue;
    }

    result.push(w);
  }

  return result.join(" ");
}

/**
 * Add ordinal suffix: 57 → 57TH, 1 → 1ST, 2 → 2ND, 3 → 3RD, 21 → 21ST, etc.
 */
function addOrdinal(num: string): string {
  const n = parseInt(num, 10);
  if (isNaN(n)) return num;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}TH`;
  switch (n % 10) {
    case 1: return `${n}ST`;
    case 2: return `${n}ND`;
    case 3: return `${n}RD`;
    default: return `${n}TH`;
  }
}

/**
 * Generate alternative normalized forms for PLUTO address matching.
 * Returns [primary, ...alternatives] where primary is the most likely form.
 * PLUTO stores e.g. "300 WEST 57 STREET" (no ordinal suffix on numbered streets).
 * But some addresses use "57TH STREET" form.
 */
function normalizeAddressVariants(raw: string): string[] {
  const primary = normalizeAddress(raw);
  const variants = [primary];

  // If address has a bare number between directional/house-num and street type,
  // generate an ordinal variant: "300 WEST 57 STREET" → "300 WEST 57TH STREET"
  const words = primary.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    if (/^\d+$/.test(words[i]) && !words[i].match(/^0/)) {
      const ordinal = addOrdinal(words[i]);
      if (ordinal !== words[i]) {
        const alt = [...words];
        alt[i] = ordinal;
        variants.push(alt.join(" "));
      }
    }
  }

  return variants;
}

/**
 * Rank address results: exact match first, then Brooklyn/Manhattan/Queens
 * before Staten Island, then by unit count descending.
 */
function rankAddressResults(results: SearchResult[], normalized: string): SearchResult[] {
  // Borough priority: Manhattan(1), Brooklyn(3), Queens(4), Bronx(2), Staten Island(5)
  const BORO_PRIORITY: Record<string, number> = {
    "1": 1, "3": 2, "4": 3, "2": 4, "5": 5,
  };

  return [...results].sort((a, b) => {
    // 1. Exact address match first
    const aExact = a.address.toUpperCase() === normalized ? 0 : 1;
    const bExact = b.address.toUpperCase() === normalized ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;

    // 2. Starts-with match next (e.g. "600 AVENUE Z" before "600 AVENUE ZOE")
    const aStarts = a.address.toUpperCase().startsWith(normalized) ? 0 : 1;
    const bStarts = b.address.toUpperCase().startsWith(normalized) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;

    // 3. Borough priority
    const aBoro = BORO_PRIORITY[a.boroCode] || 5;
    const bBoro = BORO_PRIORITY[b.boroCode] || 5;
    if (aBoro !== bBoro) return aBoro - bBoro;

    // 4. Units descending (multifamily first)
    return (b.units || 0) - (a.units || 0);
  });
}

function buildWhereClause(
  extraConditions: string[],
  filters: UnifiedSearchFilters,
): string {
  const conditions: string[] = [
    `address IS NOT NULL`,
    `address != ''`,
    `NOT starts_with(address, '0 ')`,
    ...extraConditions,
  ];

  if (filters.neighborhoodBounds) {
    const b = filters.neighborhoodBounds;
    conditions.push(
      `latitude > ${b.swLat}`, `latitude < ${b.neLat}`,
      `longitude > ${b.swLng}`, `longitude < ${b.neLng}`,
    );
  }

  if (filters.borough) conditions.push(`borocode='${esc(filters.borough)}'`);
  if (filters.minUnits) conditions.push(`unitsres >= ${Number(filters.minUnits)}`);
  if (filters.maxUnits) conditions.push(`unitsres <= ${Number(filters.maxUnits)}`);
  if (filters.yearBuiltAfter) conditions.push(`yearbuilt >= ${Number(filters.yearBuiltAfter)}`);
  if (filters.yearBuiltBefore) conditions.push(`yearbuilt <= ${Number(filters.yearBuiltBefore)}`);
  if (filters.minFloors) conditions.push(`numfloors >= ${Number(filters.minFloors)}`);
  if (filters.minAssessedValue) conditions.push(`assesstot >= ${Number(filters.minAssessedValue)}`);
  if (filters.maxAssessedValue) conditions.push(`assesstot <= ${Number(filters.maxAssessedValue)}`);
  if (filters.buildingClass) conditions.push(`bldgclass like '${esc(filters.buildingClass)}%'`);
  if (filters.zoning) conditions.push(`zonedist1 like '${esc(filters.zoning)}%'`);

  return conditions.join(" AND ");
}

/** Query PLUTO — returns results only (no count). Used for BBL and fallback queries. */
async function queryPLUTO(
  extraConditions: string[],
  filters: UnifiedSearchFilters,
  offset: number,
  limit: number,
): Promise<SearchResult[]> {
  const where = buildWhereClause(extraConditions, filters);
  const order = SORT_MAP[filters.sortBy || "units"] || "unitsres DESC";

  try {
    const url = new URL(`${BASE}/${PLUTO_ID}.json`);
    url.searchParams.set("$where", where);
    url.searchParams.set("$select", PLUTO_SELECT);
    url.searchParams.set("$limit", String(limit));
    url.searchParams.set("$offset", String(offset));
    url.searchParams.set("$order", order);

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error("PLUTO search error:", res.status, await res.text().catch(() => ""));
      return [];
    }

    const data = await res.json();
    return dedup(data.map(parsePLUTO), filters);
  } catch (err) {
    console.error("Unified search PLUTO error:", err);
    return [];
  }
}

/** Query PLUTO with a parallel count query for accurate total. */
async function queryPLUTOWithCount(
  extraConditions: string[],
  filters: UnifiedSearchFilters,
  offset: number,
  limit: number,
): Promise<{ results: SearchResult[]; total: number }> {
  const where = buildWhereClause(extraConditions, filters);
  const order = SORT_MAP[filters.sortBy || "units"] || "unitsres DESC";

  try {
    const dataUrl = new URL(`${BASE}/${PLUTO_ID}.json`);
    dataUrl.searchParams.set("$where", where);
    dataUrl.searchParams.set("$select", PLUTO_SELECT);
    dataUrl.searchParams.set("$limit", String(limit));
    dataUrl.searchParams.set("$offset", String(offset));
    dataUrl.searchParams.set("$order", order);

    const countUrl = new URL(`${BASE}/${PLUTO_ID}.json`);
    countUrl.searchParams.set("$select", "count(*) as total");
    countUrl.searchParams.set("$where", where);

    const [dataRes, countRes] = await Promise.all([
      fetch(dataUrl.toString()),
      fetch(countUrl.toString()),
    ]);

    if (!dataRes.ok) {
      console.error("PLUTO search error:", dataRes.status, await dataRes.text().catch(() => ""));
      return { results: [], total: 0 };
    }

    const data = await dataRes.json();
    const countData = countRes.ok ? await countRes.json() : [];
    const total = parseInt(countData[0]?.total || "0", 10);

    return { results: dedup(data.map(parsePLUTO), filters), total };
  } catch (err) {
    console.error("Unified search PLUTO error:", err);
    return { results: [], total: 0 };
  }
}

/** Deduplicate and filter results */
function dedup(results: SearchResult[], filters: UnifiedSearchFilters): SearchResult[] {
  const seen = new Set<string>();
  return results.filter(r => {
    const key = `${r.address}-${r.boroCode}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (filters.excludePublic && isPublicOwner(r.ownerName)) return false;
    return r.lat !== 0 && r.lng !== 0;
  });
}
