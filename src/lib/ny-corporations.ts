// ============================================================
// NY Active Corporations — DOS Corporate Filing Lookup
//
// Dataset: https://data.ny.gov/resource/n9v6-gdp6.json (Socrata API)
// Contains all corporate filings in New York State.
//
// Actual field names (verified):
//   dos_id, current_entity_name, initial_dos_filing_date,
//   county, jurisdiction, entity_type,
//   dos_process_name, dos_process_address_1, dos_process_city,
//   dos_process_state, dos_process_zip,
//   registered_agent_name (optional), registered_agent_address_1 (optional),
//   registered_agent_city (optional), registered_agent_state (optional),
//   registered_agent_zip (optional)
//
// No "status" field exists — all records in this dataset are active filings.
// ============================================================

const BASE_URL = "https://data.ny.gov/resource/n9v6-gdp6.json";

// ---- Types ----

export interface CorpRecord {
  currentEntityName: string;
  dosId: string;
  initialFilingDate: string;
  county: string;
  jurisdiction: string;
  entityType: string;
  processName: string;
  processAddress: string;
  registeredAgentName: string | null;
  registeredAgentAddress: string | null;
}

export interface EntityIntel {
  llcName: string;
  dosId: string;
  entityType: string;
  filingDate: string;
  county: string;
  processName: string;
  processAddress: string;
  registeredAgent: string | null;
  registeredAgentAddress: string | null;
  relatedEntities: CorpRecord[];
  totalRelatedEntities: number;
}

// ---- Cache (LRU, 200 entries, 1hr TTL) ----

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_MAX = 200;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const cache = new Map<string, CacheEntry<any>>();

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.data as T;
}

function cacheSet<T>(key: string, data: T): void {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}

// ---- Parser ----

function parseRecord(r: any): CorpRecord {
  const processAddr = [
    r.dos_process_address_1,
    r.dos_process_city,
    r.dos_process_state,
    r.dos_process_zip,
  ].filter(Boolean).join(", ");

  const agentAddr = r.registered_agent_address_1
    ? [
        r.registered_agent_address_1,
        r.registered_agent_city,
        r.registered_agent_state,
        r.registered_agent_zip,
      ].filter(Boolean).join(", ")
    : null;

  return {
    currentEntityName: r.current_entity_name || "",
    dosId: r.dos_id || "",
    initialFilingDate: r.initial_dos_filing_date || "",
    county: r.county || "",
    jurisdiction: r.jurisdiction || "",
    entityType: r.entity_type || "",
    processName: r.dos_process_name || "",
    processAddress: processAddr,
    registeredAgentName: r.registered_agent_name || null,
    registeredAgentAddress: agentAddr,
  };
}

// ---- Helpers ----

function escapeSoql(val: string): string {
  return val.replace(/'/g, "''");
}

async function soqlQuery(where: string, limit: number = 10, order?: string): Promise<CorpRecord[]> {
  try {
    const url = new URL(BASE_URL);
    url.searchParams.set("$where", where);
    url.searchParams.set("$limit", String(limit));
    if (order) url.searchParams.set("$order", order);

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error("NY Corps query error:", res.status, await res.text().catch(() => ""));
      return [];
    }
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map(parseRecord);
  } catch (error) {
    console.error("NY Corps query error:", error);
    return [];
  }
}

// ---- Public API ----

export async function searchCorporation(name: string): Promise<CorpRecord[]> {
  if (!name || name.length < 3) return [];

  const cacheKey = `search:${name.toUpperCase()}`;
  const cached = cacheGet<CorpRecord[]>(cacheKey);
  if (cached) return cached;

  const escaped = escapeSoql(name.trim());
  const where = `upper(current_entity_name) like upper('%${escaped}%')`;
  const results = await soqlQuery(where, 10, "initial_dos_filing_date DESC");
  cacheSet(cacheKey, results);
  return results;
}

export async function getCorpByName(exactName: string): Promise<CorpRecord | null> {
  if (!exactName) return null;

  const cacheKey = `exact:${exactName.toUpperCase()}`;
  const cached = cacheGet<CorpRecord | null>(cacheKey);
  if (cached !== null) return cached;

  // Try exact match first
  const escaped = escapeSoql(exactName.trim());
  const exactWhere = `upper(current_entity_name) = upper('${escaped}')`;
  let results = await soqlQuery(exactWhere, 1);

  // Fallback: fuzzy match
  if (results.length === 0) {
    const fuzzyWhere = `upper(current_entity_name) like upper('%${escaped}%')`;
    results = await soqlQuery(fuzzyWhere, 5, "initial_dos_filing_date DESC");
  }

  const result = results.length > 0 ? results[0] : null;
  cacheSet(cacheKey, result);
  return result;
}

export async function getCorpDetails(dosId: string): Promise<CorpRecord | null> {
  if (!dosId) return null;

  const cacheKey = `dos:${dosId}`;
  const cached = cacheGet<CorpRecord | null>(cacheKey);
  if (cached !== null) return cached;

  const results = await soqlQuery(`dos_id = '${escapeSoql(dosId)}'`, 1);
  const result = results.length > 0 ? results[0] : null;
  cacheSet(cacheKey, result);
  return result;
}

export async function findRelatedEntities(agentName: string): Promise<CorpRecord[]> {
  if (!agentName || agentName.length < 3) return [];

  const cacheKey = `related:${agentName.toUpperCase()}`;
  const cached = cacheGet<CorpRecord[]>(cacheKey);
  if (cached) return cached;

  const escaped = escapeSoql(agentName.trim());
  // Search both dos_process_name and registered_agent_name
  const where = `upper(dos_process_name) like upper('%${escaped}%')`;
  const results = await soqlQuery(where, 50, "initial_dos_filing_date DESC");
  cacheSet(cacheKey, results);
  return results;
}

/**
 * Pierce the corporate veil — find the person behind an LLC
 * and all their other corporate entities.
 */
export async function pierceEntityVeil(llcName: string): Promise<EntityIntel | null> {
  if (!llcName) return null;

  const cacheKey = `pierce:${llcName.toUpperCase()}`;
  const cached = cacheGet<EntityIntel | null>(cacheKey);
  if (cached !== null) return cached;

  // Step 1: Find the LLC
  const corp = await getCorpByName(llcName);
  if (!corp) {
    cacheSet(cacheKey, null);
    return null;
  }

  // Step 2: Get the process agent (the person/entity behind the LLC)
  const agentName = corp.registeredAgentName || corp.processName;
  if (!agentName || agentName.length < 3) {
    const result: EntityIntel = {
      llcName: corp.currentEntityName,
      dosId: corp.dosId,
      entityType: corp.entityType,
      filingDate: corp.initialFilingDate,
      county: corp.county,
      processName: corp.processName,
      processAddress: corp.processAddress,
      registeredAgent: corp.registeredAgentName,
      registeredAgentAddress: corp.registeredAgentAddress,
      relatedEntities: [],
      totalRelatedEntities: 0,
    };
    cacheSet(cacheKey, result);
    return result;
  }

  // Step 3: Find ALL other entities with the same process agent
  const related = await findRelatedEntities(agentName);

  // Filter out the original entity itself
  const filteredRelated = related.filter(
    (r) => r.dosId !== corp.dosId,
  );

  const result: EntityIntel = {
    llcName: corp.currentEntityName,
    dosId: corp.dosId,
    entityType: corp.entityType,
    filingDate: corp.initialFilingDate,
    county: corp.county,
    processName: corp.processName,
    processAddress: corp.processAddress,
    registeredAgent: corp.registeredAgentName,
    registeredAgentAddress: corp.registeredAgentAddress,
    relatedEntities: filteredRelated,
    totalRelatedEntities: filteredRelated.length,
  };

  cacheSet(cacheKey, result);
  return result;
}
