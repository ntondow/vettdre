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
  pollTier: "A" | "B" | "C";
  pollIntervalMinutes: number;
  timestampField: string | null;
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
  pollTier: "A",
  pollIntervalMinutes: 15,
  timestampField: ":updated_at",
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
  pollTier: "A",
  pollIntervalMinutes: 15,
  timestampField: ":updated_at",
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
  pollTier: "A",
  pollIntervalMinutes: 15,
  timestampField: "inspectiondate",
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
  pollTier: "A",
  pollIntervalMinutes: 15,
  timestampField: "issue_date",
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
  pollTier: "A",
  pollIntervalMinutes: 15,
  timestampField: "violation_date",
  bblExtractor: extractBblDirect,
  eventTypeMapper: (r) => {
    const penalty = parseFloat(r.penalty_balance_due || r.amount_paid || "0");
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
  pollTier: "A",
  pollIntervalMinutes: 15,
  timestampField: ":updated_at",
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

// ── Exported Registry ─────────────────────────────────────────

/** All non-ACRIS datasets (standard polling) */
export const STANDARD_DATASETS: DatasetConfig[] = [
  DOB_NOW_JOBS,
  DOB_JOBS_LEGACY,
  HPD_VIOLATIONS,
  DOB_VIOLATIONS,
  DOB_ECB_VIOLATIONS,
  DOB_STALLED_SITES,
];

/** ACRIS dataset (requires multi-table join) */
export const ACRIS_DATASET = ACRIS_MASTER;

/** All datasets (for registry seeding) */
export const ALL_DATASETS: DatasetConfig[] = [
  ...STANDARD_DATASETS,
  ACRIS_MASTER,
];
