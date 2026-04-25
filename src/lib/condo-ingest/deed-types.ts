/**
 * ACRIS Document Type Whitelists — dynamically loaded from 7isb-wh4c.
 *
 * Two whitelists:
 * - DEED_DOC_TYPES: deed-category codes including RPTT/RETT (co-op share transfers)
 * - MORTGAGE_DOC_TYPES: mortgage lifecycle codes
 *
 * ── LIS PENDENS: DECISION (Phase 3, 2026-04-25) ──
 * NYC ACRIS does NOT contain Notice-of-Pendency filings (LP, NOP, JPDN doc types
 * return empty from bnx9-e6tj). PREL = "Partial Release of Mortgage", not "Preliminary
 * Notice of Pendency". Lis pendens live in NYSCEF (NY State Court e-filing system),
 * not any NYC Open Data Socrata dataset.
 *
 * Decision: Option B — substitute distress proxy in Phase 5. Instead of a dedicated
 * lis_pendens table, derive a preForeclosureRisk composite signal from:
 *   - Tax liens (condo_ownership.tax_liens, task 9a)
 *   - Mortgage-without-satisfaction past maturity (Phase 5 ACRIS mortgage parsing)
 *   - HPD Class C violation density
 *   - ECB judgment debt > $10K
 * The condo_ownership.lis_pendens table from migration 09 is intentionally left empty.
 * No LIS_PENDENS_DOC_TYPES whitelist is built.
 *
 * Whitelists are built dynamically from the ACRIS Document Control Codes dataset
 * and cached in memory. Call initDocTypeWhitelists() at ingest startup.
 */

const ACRIS_CODES_DATASET = "7isb-wh4c";
const NYC_BASE = "https://data.cityofnewyork.us/resource";
const FETCH_TIMEOUT = 8000;

// ── In-Memory Cache ──────────────────────────────────────────

let _deedTypes: ReadonlySet<string> | null = null;
let _mortgageTypes: ReadonlySet<string> | null = null;
let _allCodes: Map<string, { description: string; classCodeDescription: string }> | null = null;

// ��─ Seed Lists (confirmed inclusions from Phase 0 + build prompt) ��─

/** Deed-category codes — must be confirmed against live 7isb-wh4c data. */
const DEED_SEED = new Set([
  "DEED", "DEEDO", "DEED, LE",
  "RPTT", "RETT", "RPT",           // Co-op share transfers (RPTT/RETT returns)
  "CTSUM",                          // Cooperative Transfer Summary
]);

/** Deed class_code_description patterns to match dynamically. */
const DEED_CLASS_PATTERNS = [
  /deed/i, /conveyance/i, /transfer\s*tax/i, /rptt/i, /cooperative.*transfer/i,
];

/** Mortgage-category codes — confirmed from Phase 0 ACRIS verification. */
const MORTGAGE_SEED = new Set([
  "MTGE", "MTG", "MORT",           // Mortgage recordings
  "SAT", "SATI",                    // Satisfaction of mortgage
  "ASST", "ASSIGN",                // Assignment
  "CEMA",                           // Consolidation/Extension/Modification Agreement
  "SPM",                            // Subordinated/Purchase Money mortgage
  "MOD", "MODA",                   // Modification agreement
]);

const MORTGAGE_CLASS_PATTERNS = [
  /mortgage/i, /satisfaction/i, /assignment.*mortgage/i,
];

// ── Public API ───────────────────────────────────────────────

/**
 * Initialize doc-type whitelists by fetching ACRIS Document Control Codes.
 * Safe to call multiple times — caches after first successful load.
 */
export async function initDocTypeWhitelists(): Promise<void> {
  if (_deedTypes && _mortgageTypes) return;

  const appToken = process.env.NYC_OPEN_DATA_APP_TOKEN || "";
  const isValid = appToken.length > 0 && !appToken.startsWith("YOUR_");

  try {
    const url = `${NYC_BASE}/${ACRIS_CODES_DATASET}.json?$limit=5000`;
    const headers: Record<string, string> = {};
    if (isValid) headers["X-App-Token"] = appToken;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[DeedTypes] HTTP ${res.status} fetching ACRIS codes — using seed lists`);
      fallbackToSeeds();
      return;
    }

    const records: Array<{
      doc__type: string;
      doc__type_description?: string;
      class_code_description?: string;
    }> = await res.json();

    if (!Array.isArray(records) || records.length === 0) {
      console.warn("[DeedTypes] Empty ACRIS codes response — using seed lists");
      fallbackToSeeds();
      return;
    }

    // Build lookup map
    _allCodes = new Map();
    for (const r of records) {
      const code = (r.doc__type || "").trim().toUpperCase();
      if (!code) continue;
      _allCodes.set(code, {
        description: r.doc__type_description || "",
        classCodeDescription: r.class_code_description || "",
      });
    }

    // Build deed whitelist: seed + dynamic matches
    const deedSet = new Set<string>();
    for (const code of DEED_SEED) {
      if (_allCodes.has(code)) deedSet.add(code);
    }
    for (const [code, meta] of _allCodes) {
      const combined = `${meta.description} ${meta.classCodeDescription}`;
      if (DEED_CLASS_PATTERNS.some(p => p.test(combined))) {
        deedSet.add(code);
      }
    }
    _deedTypes = deedSet;

    // Build mortgage whitelist: seed + dynamic matches
    const mortgageSet = new Set<string>();
    for (const code of MORTGAGE_SEED) {
      if (_allCodes.has(code)) mortgageSet.add(code);
    }
    for (const [code, meta] of _allCodes) {
      const combined = `${meta.description} ${meta.classCodeDescription}`;
      if (MORTGAGE_CLASS_PATTERNS.some(p => p.test(combined))) {
        mortgageSet.add(code);
      }
    }
    _mortgageTypes = mortgageSet;

    console.log(
      `[DeedTypes] Loaded ${_allCodes.size} ACRIS codes. ` +
      `Deed whitelist: ${_deedTypes.size} types. Mortgage whitelist: ${_mortgageTypes.size} types.`
    );
  } catch (err) {
    console.error("[DeedTypes] Failed to fetch ACRIS codes:", err);
    fallbackToSeeds();
  }
}

function fallbackToSeeds(): void {
  _deedTypes = DEED_SEED;
  _mortgageTypes = MORTGAGE_SEED;
}

/** Get the deed-category doc-type whitelist. Call initDocTypeWhitelists() first. */
export function getDeedDocTypes(): ReadonlySet<string> {
  if (!_deedTypes) {
    console.warn("[DeedTypes] Whitelists not initialized — returning seed list");
    return DEED_SEED;
  }
  return _deedTypes;
}

/** Get the mortgage-category doc-type whitelist. Call initDocTypeWhitelists() first. */
export function getMortgageDocTypes(): ReadonlySet<string> {
  if (!_mortgageTypes) {
    console.warn("[DeedTypes] Whitelists not initialized — returning seed list");
    return MORTGAGE_SEED;
  }
  return _mortgageTypes;
}

/** Check if a doc_type is a deed transfer. */
export function isDeedType(docType: string): boolean {
  return getDeedDocTypes().has(docType.trim().toUpperCase());
}

/** Check if a doc_type is a mortgage-related document. */
export function isMortgageType(docType: string): boolean {
  return getMortgageDocTypes().has(docType.trim().toUpperCase());
}

/**
 * Get all loaded ACRIS codes (for audit/debug).
 * Returns null if not yet initialized.
 */
export function getAllAcrisCodes(): Map<string, { description: string; classCodeDescription: string }> | null {
  return _allCodes;
}
