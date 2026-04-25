/**
 * Terminal Dataset Registry — Source of truth for NYC Open Data polling.
 *
 * Each entry maps a Socrata dataset to Terminal event detection:
 *   - bblExtractor: How to derive a BBL from a raw record
 *   - eventTypeMapper: Which Terminal event type this record becomes (null = skip)
 *   - timestampField: Which field to use for incremental $where queries
 *
 * Phase 1 (MVP): Tier A datasets only — polled every 15 minutes.
 */

// ── Types ─────────────────────────────────────────────────────

export interface DatasetConfig {
  datasetId: string;
  displayName: string;
  /**
   * Discriminator for ingest routing:
   * - 'event': writes to TerminalEvent (existing Terminal pipeline)
   * - 'snapshot': periodic full-refresh to BuildingCache or spine tables (HPD MDR, tax liens, etc.)
   * - 'join-driven': multi-table join before write (ACRIS Master+Legals+Parties, RPTT)
   *
   * Added in Phase 0 of the Building Intelligence Overhaul.
   * Existing event datasets default to 'event'. New spine/join datasets added in Phase 2+.
   */
  kind: "event" | "snapshot" | "join-driven";
  pollTier: "A" | "B" | "C";
  pollIntervalMinutes: number;
  timestampField: string | null;
  /** Format a JS Date into the string format SODA expects for this dataset's timestampField */
  formatSinceDate?: (d: Date) => string;
  bblExtractor: (record: any) => string | null;
  eventTypeMapper: (record: any) => string | null;
  recordIdExtractor: (record: any) => string;
  eventTier: 1 | 2 | 3;
  category: string;
}

// ── BBL Helpers ───────────────────────────────────────────────

function padBbl(boro: string, block: string, lot: string): string | null {
  const b = parseInt(boro);
  if (!b || b < 1 || b > 5) return null;
  const blk = block?.replace(/^0+/, "") || "";
  const lt = lot?.replace(/^0+/, "") || "";
  if (!blk || !lt || blk.length > 5 || lt.length > 4) return null;
  return `${b}${blk.padStart(5, "0")}${lt.padStart(4, "0")}`;
}

// ── Date Formatters for SODA $where queries ─────────────────

/** ISO floating timestamp — for calendar_date columns (default) */
function formatISOFloating(d: Date): string {
  return d.toISOString().slice(0, 19); // "2026-03-07T00:00:00"
}

/** YYYYMMDD text — for DOB text-date columns */
function formatYYYYMMDD(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`; // "20260307"
}

/** MM/DD/YYYY text — for legacy DOB text-date columns */
function formatMMDDYYYY(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${m}/${day}/${y}`; // "03/07/2026"
}

function extractBblDirect(record: any): string | null {
  if (record.bbl) {
    const bbl = String(record.bbl).replace(/\D/g, "");
    return bbl.length === 10 ? bbl : null;
  }
  const boro = record.borocode || record.borough || record.boro || record.boroid;
  const block = record.block;
  const lot = record.lot;
  if (boro && block && lot) return padBbl(String(boro), String(block), String(lot));
  return null;
}

// ── Dataset Configurations (MVP — Tier A) ─────────────────────

const DOB_NOW_JOBS: DatasetConfig = {
  datasetId: "w9ak-ipjd",
  displayName: "DOB NOW Job Applications",
  kind: "event",
  pollTier: "A",
  pollIntervalMinutes: 15,
  timestampField: "filing_date",
  formatSinceDate: formatISOFloating,
  bblExtractor: (r) => {
    if (r.bin__) return null; // BIN-only records — need PLUTO lookup, skip for MVP
    return extractBblDirect(r);
  },
  eventTypeMapper: (r) => {
    const jobType = (r.job_type || r.jobtype || "").toUpperCase();
    if (jobType === "NB" || jobType === "NEW BUILDING") return "NEW_BUILDING_PERMIT";
    if (jobType === "A1" || jobType === "ALTERATION TYPE 1") return "MAJOR_ALTERATION";
    return null; // Skip minor alterations, demos, etc.
  },
  recordIdExtractor: (r) => r.job_filing_number || r.job__ || r.jobnumber || `dobnow-${r[":id"] || "unknown"}`,
  eventTier: 1,
  category: "Permits",
};

const DOB_JOBS_LEGACY: DatasetConfig = {
  datasetId: "ic3t-wcy2",
  displayName: "DOB Job Application Filings (Legacy)",
  kind: "event",
  pollTier: "A",
  pollIntervalMinutes: 15,
  timestampField: "pre__filing_date",
  formatSinceDate: formatMMDDYYYY,
  bblExtractor: extractBblDirect,
  eventTypeMapper: (r) => {
    const jobType = (r.job_type || "").toUpperCase();
    if (jobType === "NB") return "NEW_BUILDING_PERMIT";
    if (jobType === "A1") return "MAJOR_ALTERATION";
    return null;
  },
  recordIdExtractor: (r) => r.job__ || `dobjobs-${r[":id"] || "unknown"}`,
  eventTier: 1,
  category: "Permits",
};

const HPD_VIOLATIONS: DatasetConfig = {
  datasetId: "wvxf-dwi5",
  displayName: "HPD Violations",
  kind: "event",
  pollTier: "A",
  pollIntervalMinutes: 15,
  timestampField: "inspectiondate",
  formatSinceDate: formatISOFloating,
  bblExtractor: (r) => {
    const boro = r.boroid || r.borough;
    return padBbl(String(boro), String(r.block), String(r.lot));
  },
  eventTypeMapper: (r) => {
    const cls = (r.class || r.violationclass || "").toUpperCase();
    // Only Class C (immediately hazardous) and I (Lead Paint)
    if (cls === "C" || cls === "I") return "HPD_VIOLATION";
    return null;
  },
  recordIdExtractor: (r) => r.violationid || `hpdv-${r[":id"] || "unknown"}`,
  eventTier: 2,
  category: "Violations",
};

const DOB_VIOLATIONS: DatasetConfig = {
  datasetId: "3h2n-5cm9",
  displayName: "DOB Violations",
  kind: "event",
  pollTier: "A",
  pollIntervalMinutes: 15,
  timestampField: "issue_date",
  formatSinceDate: formatYYYYMMDD,
  bblExtractor: extractBblDirect,
  eventTypeMapper: (r) => {
    const disp = (r.disposition_comments || r.violation_type || "").toUpperCase();
    // Stop Work Orders only
    if (disp.includes("SWO") || disp.includes("STOP WORK")) return "DOB_STOP_WORK";
    return null;
  },
  recordIdExtractor: (r) => r.isn_dob_bis_viol || r.violation_number || `dobv-${r[":id"] || "unknown"}`,
  eventTier: 2,
  category: "Violations",
};

const DOB_ECB_VIOLATIONS: DatasetConfig = {
  datasetId: "6bgk-3dad",
  displayName: "DOB ECB Violations",
  kind: "event",
  pollTier: "A",
  pollIntervalMinutes: 15,
  timestampField: "issue_date",
  formatSinceDate: formatYYYYMMDD,
  bblExtractor: extractBblDirect,
  eventTypeMapper: (r) => {
    const penalty = parseFloat(r.penalty_balance_due || r.penalty_applied || "0");
    // High-penalty only (>$10K)
    if (penalty > 10000) return "ECB_HIGH_PENALTY";
    return null;
  },
  recordIdExtractor: (r) => r.isn_dob_bis_gid || r.ecb_violation_number || `ecb-${r[":id"] || "unknown"}`,
  eventTier: 2,
  category: "Violations",
};

const DOB_STALLED_SITES: DatasetConfig = {
  datasetId: "i296-73x5",
  displayName: "DOB Stalled Construction Sites",
  kind: "event",
  pollTier: "A",
  pollIntervalMinutes: 15,
  timestampField: "dobrundate",
  formatSinceDate: formatISOFloating,
  bblExtractor: extractBblDirect,
  eventTypeMapper: () => "STALLED_SITE",
  recordIdExtractor: (r) => r.job__ || r.bin__ || `stalled-${r[":id"] || "unknown"}`,
  eventTier: 2,
  category: "Stalled Sites",
};

// ── ACRIS Datasets (special join handling) ────────────────────

export const ACRIS_MASTER: DatasetConfig = {
  datasetId: "bnx9-e6tj",
  displayName: "ACRIS Master (Deeds, Mortgages)",
  kind: "join-driven",
  pollTier: "A",
  pollIntervalMinutes: 15,
  timestampField: "good_through_date",
  bblExtractor: () => null, // BBL comes from ACRIS Legals join
  eventTypeMapper: (r) => {
    const docType = (r.doc_type || "").toUpperCase();
    if (["DEED", "DEEDO"].includes(docType)) return "SALE_RECORDED";
    if (["MTGE", "AGMT", "AL&R", "ASST", "SAT"].includes(docType)) return "LOAN_RECORDED";
    return null;
  },
  recordIdExtractor: (r) => r.document_id || r.crfn || `acris-${r[":id"] || "unknown"}`,
  eventTier: 1,
  category: "Sales",
};

export const ACRIS_LEGALS_ID = "8h5j-fqxa";
export const ACRIS_PARTIES_ID = "636b-3b5g";
export const ACRIS_CODES_ID = "7isb-wh4c";

// ── Building Intelligence Datasets (Phase 2) ─────────────────

/** Condo unit spine — Digital Tax Map Condominium Units */
const CONDO_UNITS: DatasetConfig = {
  datasetId: "eguu-7ie3",
  displayName: "Digital Tax Map: Condominium Units",
  kind: "snapshot",
  pollTier: "C",
  pollIntervalMinutes: 10080, // weekly
  timestampField: null, // snapshot — no incremental timestamp
  bblExtractor: (r) => {
    // Unit BBL: condo_boro + condo_block + condo_lot (pad to 10 chars)
    const boro = r.condo_boro || r.boro;
    const block = r.condo_block || r.block;
    const lot = r.condo_lot || r.lot;
    return padBbl(String(boro), String(block), String(lot));
  },
  eventTypeMapper: () => null, // not an event source
  recordIdExtractor: (r) => `${r.boro}-${r.block}-${r.lot}`,
  eventTier: 3,
  category: "Spine",
};

/** DOF Property Valuation (current tax years 2023-2027) — NOT w7rz-68fs (stale) */
const DOF_ASSESSMENT: DatasetConfig = {
  datasetId: "8y4t-faws",
  displayName: "DOF Property Valuation & Assessment",
  kind: "snapshot",
  pollTier: "C",
  pollIntervalMinutes: 10080, // weekly
  timestampField: null,
  bblExtractor: (r) => padBbl(String(r.boro), String(r.block), String(r.lot)),
  eventTypeMapper: () => null,
  recordIdExtractor: (r) => `${r.boro}-${r.block}-${r.lot}-${r.bldg_class || ""}`,
  eventTier: 3,
  category: "Assessment",
};

/** ACRIS Document Control Codes — for dynamic whitelist building */
const ACRIS_CODES: DatasetConfig = {
  datasetId: ACRIS_CODES_ID,
  displayName: "ACRIS Document Control Codes",
  kind: "snapshot",
  pollTier: "C",
  pollIntervalMinutes: 43200, // monthly
  timestampField: null,
  bblExtractor: () => null,
  eventTypeMapper: () => null,
  recordIdExtractor: (r) => r.doc__type || r.record_type || "",
  eventTier: 3,
  category: "Reference",
};

// ── Exported Registry ─────────────────────────────────────────

/** All non-ACRIS event datasets (standard polling → TerminalEvent) */
export const STANDARD_DATASETS: DatasetConfig[] = [
  DOB_NOW_JOBS,
  DOB_JOBS_LEGACY,
  HPD_VIOLATIONS,
  DOB_VIOLATIONS,
  DOB_ECB_VIOLATIONS,
  DOB_STALLED_SITES,
];

/** ACRIS dataset (requires multi-table join → TerminalEvent) */
export const ACRIS_DATASET = ACRIS_MASTER;

/** Building Intelligence spine datasets (snapshot/join-driven → condo_ownership tables) */
export const SPINE_DATASETS: DatasetConfig[] = [
  CONDO_UNITS,
  DOF_ASSESSMENT,
  ACRIS_CODES,
];

/** All datasets (for registry seeding) */
export const ALL_DATASETS: DatasetConfig[] = [
  ...STANDARD_DATASETS,
  ACRIS_MASTER,
  ...SPINE_DATASETS,
];
