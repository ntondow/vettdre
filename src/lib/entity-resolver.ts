// ============================================================
// Entity Resolver — fuzzy matching, address normalization, and owner resolution
// Cross-references owners across PLUTO, ACRIS, HPD, DOB, DOF
// ============================================================

// ---- Types ----

export interface NormalizedAddress {
  number: string;
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  borough: string;
  raw: string;
}

export interface ResolvedEntity {
  entityName: string;        // best resolved name
  likelyPerson: string;      // individual behind LLC
  llcName: string;           // LLC/Corp name if applicable
  phone: string;
  email: string;
  mailingAddress: string;
  confidence: number;        // 0-100
  sources: string[];
  alternateNames: string[];  // all names seen across sources
}

export interface ResolvedContact {
  name: string;
  role: string;
  phone: string;
  email: string;
  source: string;
  score: number;
  address: string;
  linkedinUrl?: string;
  title?: string;
  photoUrl?: string;
}

export interface MatchResult {
  match: boolean;
  confidence: number;        // 0-100
  method: string;            // which algorithm matched
}

// ---- String Distance Algorithms ----

/** Levenshtein edit distance between two strings */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

/** Levenshtein similarity as percentage (0-100) */
export function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 100;
  return Math.round((1 - levenshtein(a, b) / maxLen) * 100);
}

/** Jaro similarity (0-1) — better for short strings */
function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length, len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;
  const matchWindow = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  let matches = 0, transpositions = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
}

/** Jaro-Winkler similarity (0-1) — gives bonus for common prefix */
export function jaroWinklerSimilarity(s1: string, s2: string): number {
  const jaro = jaroSimilarity(s1, s2);
  let prefixLen = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefixLen++;
    else break;
  }
  return jaro + prefixLen * 0.1 * (1 - jaro);
}

// ---- Name Normalization ----

const ENTITY_SUFFIXES = /\b(LLC|L\.L\.C|INC|INCORPORATED|CORP|CORPORATION|LTD|LIMITED|L\.P\.|LP|TRUST|COMPANY|CO|ASSOC|ASSOCIATES|HOLDINGS|PROPERTIES|REALTY|GROUP|ENTERPRISES|MGMT|MANAGEMENT|PARTNERS|PARTNERSHIP|ESTATE|FUND|CAPITAL|DEVELOPMENT|DEV|INVESTMENTS|VENTURES)\b\.?/gi;

const COMMON_PREFIXES = /^(THE|A|AN)\s+/i;

/** Remove LLC/INC/CORP suffixes and normalize for comparison */
export function normalizeName(raw: string): string {
  if (!raw) return "";
  let n = raw.toUpperCase().trim();
  // Remove common entity suffixes
  n = n.replace(ENTITY_SUFFIXES, "").trim();
  // Remove common prefixes
  n = n.replace(COMMON_PREFIXES, "").trim();
  // Normalize separators
  n = n.replace(/[,.\-_/\\]+/g, " ");
  // Remove extra whitespace
  n = n.replace(/\s+/g, " ").trim();
  // Remove possessives
  n = n.replace(/'S\b/g, "");
  // Remove trailing numbers (often address numbers in LLC names: "123 MAIN ST LLC")
  // Keep them — they're part of the identity
  return n;
}

/** Extract likely address from an LLC name (e.g., "123 NASSAU ST HOLDINGS LLC" → "123 NASSAU ST") */
export function extractAddressFromLLC(name: string): string | null {
  const m = name.match(/^(\d+\s+[A-Z]+(?:\s+(?:ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|PL|PLACE|RD|ROAD|WAY|CT|COURT|LN|LANE|TER|TERRACE))?)/i);
  return m ? m[1].trim() : null;
}

/** Check if a name looks like an LLC/Corp rather than an individual */
export function isEntityName(name: string): boolean {
  if (!name) return false;
  return /\b(LLC|L\.L\.C|INC|CORP|CORPORATION|LTD|L\.P\.|LP|TRUST|REALTY|HOLDINGS|PROPERTIES|MGMT|MANAGEMENT|ASSOCIATES|PARTNERS|FUND|CAPITAL|DEVELOPMENT|ENTERPRISES|VENTURES)\b/i.test(name);
}

/** Check if a name looks like an individual person */
export function isPersonName(name: string): boolean {
  if (!name || name.length < 3) return false;
  if (isEntityName(name)) return false;
  // Individual names usually have at least a space (first + last)
  return name.trim().includes(" ");
}

// ---- Address Normalization ----

const STREET_ABBREVS: Record<string, string> = {
  ST: "STREET", STREET: "STREET",
  AVE: "AVENUE", AVENUE: "AVENUE", AV: "AVENUE",
  BLVD: "BOULEVARD", BOULEVARD: "BOULEVARD",
  DR: "DRIVE", DRIVE: "DRIVE",
  PL: "PLACE", PLACE: "PLACE",
  RD: "ROAD", ROAD: "ROAD",
  WAY: "WAY",
  CT: "COURT", COURT: "COURT",
  LN: "LANE", LANE: "LANE",
  TER: "TERRACE", TERRACE: "TERRACE",
  CIR: "CIRCLE", CIRCLE: "CIRCLE",
  PKWY: "PARKWAY", PARKWAY: "PARKWAY",
  HWY: "HIGHWAY", HIGHWAY: "HIGHWAY",
  SQ: "SQUARE", SQUARE: "SQUARE",
};

const DIRECTIONALS: Record<string, string> = {
  N: "NORTH", NORTH: "NORTH",
  S: "SOUTH", SOUTH: "SOUTH",
  E: "EAST", EAST: "EAST",
  W: "WEST", WEST: "WEST",
  NE: "NORTHEAST", NW: "NORTHWEST",
  SE: "SOUTHEAST", SW: "SOUTHWEST",
};

const UNIT_PATTERNS = /\b(APT|APARTMENT|UNIT|STE|SUITE|FL|FLOOR|RM|ROOM|#)\s*\.?\s*(\S+)/i;

export function normalizeAddress(raw: string): NormalizedAddress {
  if (!raw) return { number: "", street: "", unit: "", city: "", state: "", zip: "", borough: "", raw: "" };

  const trimmed = raw.trim();
  let upper = trimmed.toUpperCase();

  // Extract unit/apt
  let unit = "";
  const unitMatch = upper.match(UNIT_PATTERNS);
  if (unitMatch) {
    unit = unitMatch[2];
    upper = upper.replace(UNIT_PATTERNS, "").trim();
  }

  // Extract zip code
  let zip = "";
  const zipMatch = upper.match(/\b(\d{5})(-\d{4})?\b/);
  if (zipMatch) {
    zip = zipMatch[1];
    upper = upper.replace(/\b\d{5}(-\d{4})?\b/, "").trim();
  }

  // Extract house number
  let number = "";
  const numMatch = upper.match(/^(\d+[\-\/]?\d*)\s+/);
  if (numMatch) {
    number = numMatch[1];
    upper = upper.slice(numMatch[0].length);
  }

  // Remove state
  let state = "";
  const stateMatch = upper.match(/\b(NY|NEW YORK|NJ|NEW JERSEY)\b/i);
  if (stateMatch) {
    state = stateMatch[1] === "NEW YORK" ? "NY" : stateMatch[1] === "NEW JERSEY" ? "NJ" : stateMatch[1];
    upper = upper.replace(stateMatch[0], "").trim();
  }

  // Detect borough
  let borough = "";
  const boroMatch = upper.match(/\b(MANHATTAN|BRONX|BROOKLYN|QUEENS|STATEN ISLAND)\b/i);
  if (boroMatch) {
    borough = boroMatch[1];
    upper = upper.replace(boroMatch[0], "").trim();
  }

  // Remove city (often borough name or "NEW YORK")
  let city = borough || "";
  upper = upper.replace(/,\s*/g, " ").replace(/\s+/g, " ").trim();

  // Normalize street type
  const words = upper.split(/\s+/);
  const normalized = words.map(w => {
    if (STREET_ABBREVS[w]) return STREET_ABBREVS[w];
    if (DIRECTIONALS[w]) return DIRECTIONALS[w];
    return w;
  });

  const street = normalized.join(" ").trim();

  return { number, street, unit, city, state, zip, borough, raw: trimmed };
}

/** Compare two addresses — returns confidence 0-100 */
export function addressSimilarity(a: string, b: string): number {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);

  // House number must match exactly
  if (na.number && nb.number && na.number !== nb.number) return 0;

  // If both have streets, compare them
  if (na.street && nb.street) {
    const streetSim = levenshteinSimilarity(na.street, nb.street);
    // House number match + high street similarity = high confidence
    if (na.number && nb.number && na.number === nb.number) {
      return streetSim >= 80 ? Math.min(100, streetSim + 5) : streetSim;
    }
    return streetSim;
  }

  // Fallback: raw similarity
  return levenshteinSimilarity(a.toUpperCase(), b.toUpperCase());
}

// ---- Entity Matching ----

/** Compare two entity names and determine if they refer to the same entity */
export function isSameEntity(name1: string, name2: string): MatchResult {
  if (!name1 || !name2) return { match: false, confidence: 0, method: "empty" };

  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  if (!n1 || !n2) return { match: false, confidence: 0, method: "empty_after_normalize" };

  // Exact match after normalization
  if (n1 === n2) return { match: true, confidence: 100, method: "exact" };

  // One contains the other (common with LLCs)
  if (n1.includes(n2) || n2.includes(n1)) {
    const shorter = Math.min(n1.length, n2.length);
    const longer = Math.max(n1.length, n2.length);
    const ratio = shorter / longer;
    if (ratio > 0.5) return { match: true, confidence: Math.round(85 + ratio * 15), method: "containment" };
  }

  // For short strings (< 15 chars), use Jaro-Winkler
  if (n1.length < 15 || n2.length < 15) {
    const jw = jaroWinklerSimilarity(n1, n2);
    if (jw >= 0.90) return { match: true, confidence: Math.round(jw * 100), method: "jaro_winkler" };
  }

  // For longer strings, use Levenshtein
  const lev = levenshteinSimilarity(n1, n2);
  if (lev >= 85) return { match: true, confidence: lev, method: "levenshtein" };

  // LLC address matching: both have same address prefix
  const addr1 = extractAddressFromLLC(name1);
  const addr2 = extractAddressFromLLC(name2);
  if (addr1 && addr2) {
    const addrSim = levenshteinSimilarity(addr1, addr2);
    if (addrSim >= 90) return { match: true, confidence: Math.round(addrSim * 0.9), method: "llc_address" };
  }

  // Last name matching for individuals
  if (isPersonName(name1) && isPersonName(name2)) {
    const last1 = n1.split(" ").pop() || "";
    const last2 = n2.split(" ").pop() || "";
    if (last1.length > 2 && last2.length > 2 && last1 === last2) {
      // Same last name — check first initial
      const first1 = n1.split(" ")[0]?.[0] || "";
      const first2 = n2.split(" ")[0]?.[0] || "";
      if (first1 === first2) return { match: true, confidence: 80, method: "last_name_first_initial" };
      return { match: false, confidence: 60, method: "last_name_only" };
    }
  }

  return { match: false, confidence: lev, method: "no_match" };
}

// ---- Owner Resolution ----

/** Resolve the most likely owner from multiple data sources */
export function resolveOwner(sources: {
  plutoOwner?: string;
  acrisParties?: { name: string; role: string; docDate?: string }[];
  hpdRegistration?: { owner?: string; agent?: string; agentPhone?: string; agentAddress?: string; individualOwners?: string[]; corpOwners?: string[] };
  dofOwner?: string;
}): ResolvedEntity {
  const result: ResolvedEntity = {
    entityName: "",
    likelyPerson: "",
    llcName: "",
    phone: "",
    email: "",
    mailingAddress: "",
    confidence: 0,
    sources: [],
    alternateNames: [],
  };

  const allNames: { name: string; source: string; priority: number }[] = [];

  // Collect all names with source priority
  if (sources.hpdRegistration?.owner) {
    allNames.push({ name: sources.hpdRegistration.owner, source: "HPD", priority: 1 });
  }
  if (sources.hpdRegistration?.corpOwners) {
    sources.hpdRegistration.corpOwners.forEach(n => allNames.push({ name: n, source: "HPD Corp", priority: 1 }));
  }
  if (sources.hpdRegistration?.individualOwners) {
    sources.hpdRegistration.individualOwners.forEach(n => allNames.push({ name: n, source: "HPD Individual", priority: 1 }));
  }
  if (sources.acrisParties) {
    // Most recent grantee (buyer) is current owner
    const grantees = sources.acrisParties.filter(p => p.role === "GRANTEE" || p.role === "BUYER");
    grantees.forEach(g => allNames.push({ name: g.name, source: "ACRIS", priority: 2 }));
  }
  if (sources.plutoOwner) {
    allNames.push({ name: sources.plutoOwner, source: "PLUTO", priority: 3 });
  }
  if (sources.dofOwner) {
    allNames.push({ name: sources.dofOwner, source: "DOF", priority: 4 });
  }

  if (allNames.length === 0) return result;

  // Deduplicate by fuzzy matching
  const clusters: { names: typeof allNames; canonical: string }[] = [];
  for (const entry of allNames) {
    let placed = false;
    for (const cluster of clusters) {
      const matchResult = isSameEntity(entry.name, cluster.canonical);
      if (matchResult.match) {
        cluster.names.push(entry);
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push({ names: [entry], canonical: normalizeName(entry.name) || entry.name });
    }
  }

  // Pick the largest cluster (most sources agree)
  clusters.sort((a, b) => {
    // First by cluster size
    if (b.names.length !== a.names.length) return b.names.length - a.names.length;
    // Then by highest priority (lowest number)
    const aMin = Math.min(...a.names.map(n => n.priority));
    const bMin = Math.min(...b.names.map(n => n.priority));
    return aMin - bMin;
  });

  const best = clusters[0];
  // Use the highest-priority source's name as the display name
  const bestEntry = best.names.sort((a, b) => a.priority - b.priority)[0];
  result.entityName = bestEntry.name;
  result.sources = [...new Set(best.names.map(n => n.source))];
  result.alternateNames = [...new Set(allNames.map(n => n.name).filter(n => normalizeName(n) !== normalizeName(result.entityName)))];

  // Confidence based on source agreement
  const sourceCount = result.sources.length;
  result.confidence = Math.min(100, 40 + sourceCount * 20);

  // Separate entity vs person
  if (isEntityName(result.entityName)) {
    result.llcName = result.entityName;
    // Look for an individual behind the LLC
    const individuals = allNames.filter(n => isPersonName(n.name));
    if (individuals.length > 0) {
      result.likelyPerson = individuals.sort((a, b) => a.priority - b.priority)[0].name;
    }
    // HPD managing agent is often the person behind the LLC
    if (!result.likelyPerson && sources.hpdRegistration?.agent) {
      result.likelyPerson = sources.hpdRegistration.agent;
    }
  } else {
    result.likelyPerson = result.entityName;
    // Look for associated LLC
    const entities = allNames.filter(n => isEntityName(n.name));
    if (entities.length > 0) {
      result.llcName = entities[0].name;
    }
  }

  // Phone from HPD agent
  if (sources.hpdRegistration?.agentPhone) {
    result.phone = sources.hpdRegistration.agentPhone;
  }

  // Mailing address
  if (sources.hpdRegistration?.agentAddress) {
    result.mailingAddress = sources.hpdRegistration.agentAddress;
  }

  return result;
}

// ---- Portfolio Discovery ----

/** Group properties by resolved owner — returns BBLs owned by a similar entity */
export function groupByOwner(properties: { bbl: string; ownerName: string }[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  const assigned = new Set<string>();

  for (let i = 0; i < properties.length; i++) {
    if (assigned.has(properties[i].bbl)) continue;
    const group = [properties[i].bbl];
    assigned.add(properties[i].bbl);
    const canonical = normalizeName(properties[i].ownerName);

    for (let j = i + 1; j < properties.length; j++) {
      if (assigned.has(properties[j].bbl)) continue;
      const matchResult = isSameEntity(properties[i].ownerName, properties[j].ownerName);
      if (matchResult.match && matchResult.confidence >= 80) {
        group.push(properties[j].bbl);
        assigned.add(properties[j].bbl);
      }
    }

    groups.set(canonical || properties[i].ownerName, group);
  }

  return groups;
}

// ---- Confidence Scoring for Data Points ----

export interface ConfidentValue<T> {
  value: T;
  source: string;
  confidence: number;
  alternateValues?: { value: T; source: string }[];
}

/** Resolve a data point from multiple sources using priority hierarchy */
export function resolveValue<T>(
  entries: { value: T; source: string; priority: number }[],
  isEqual?: (a: T, b: T) => boolean,
): ConfidentValue<T> | null {
  if (entries.length === 0) return null;

  const eq = isEqual || ((a, b) => a === b);

  // Sort by priority (lower = better)
  const sorted = [...entries].sort((a, b) => a.priority - b.priority);
  const primary = sorted[0];

  // Check how many sources agree
  const agreeing = sorted.filter(e => eq(e.value, primary.value));
  const disagreeing = sorted.filter(e => !eq(e.value, primary.value));

  let confidence = 60 + (agreeing.length - 1) * 15; // base 60, +15 per agreeing source
  if (disagreeing.length > 0) confidence -= disagreeing.length * 5;
  confidence = Math.min(100, Math.max(30, confidence));

  return {
    value: primary.value,
    source: primary.source,
    confidence,
    alternateValues: disagreeing.map(d => ({ value: d.value, source: d.source })),
  };
}

// ============================================================
// Geocodio Address Normalization — high-confidence fallback
// Use sparingly (costs a Geocodio lookup). Only when local
// normalizer has low confidence on ambiguous addresses.
// ============================================================
export async function normalizeAddressWithGeocodio(
  rawAddress: string,
): Promise<{ formatted: string; lat: number; lng: number; confidence: number } | null> {
  try {
    const { geocodeAddress, getGeocodioBudget } = await import("@/lib/geocodio");
    const budget = getGeocodioBudget();
    if (budget.remaining <= 0) return null;

    const result = await geocodeAddress(rawAddress);
    if (!result || !result.lat) return null;

    return {
      formatted: result.formatted_address,
      lat: result.lat,
      lng: result.lng,
      confidence: result.accuracy_type === "rooftop" ? 95
        : result.accuracy_type === "range_interpolation" ? 80
        : result.accuracy_type === "nearest_street" ? 60
        : 40,
    };
  } catch (err) {
    console.error("Geocodio normalize error:", err);
    return null;
  }
}
