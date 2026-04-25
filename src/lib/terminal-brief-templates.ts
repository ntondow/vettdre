/**
 * Terminal Brief Templates — deterministic brief generation from structured data.
 *
 * Covers event types that account for >2% of volume:
 *   HPD_VIOLATION     81.5%
 *   NEW_BUILDING_PERMIT 12.5%
 *   LOAN_RECORDED      4.0%
 *   SALE_RECORDED      1.5% (included — easy to template, good data)
 *
 * Returns null when required fields are missing → caller falls back to LLM.
 */

// ── Types ─────────────────────────────────────────────────────

interface TemplateEvent {
  eventType: string;
  bbl: string;
  borough: number;
  detectedAt: string | Date;
  metadata: Record<string, any> | null;
  enrichmentPackage: {
    property_profile: {
      address: string;
      borough: string;
      neighborhood: string;
      residentialUnits: number | null;
      commercialUnits: number | null;
      ownerName: string | null;
    } | null;
    [key: string]: any;
  } | null;
}

// ── Text Helpers ──────────────────────────────────────────────

/** Tokens that stay uppercase regardless of position. */
const PRESERVE_UPPERCASE = new Set([
  "LLC", "LP", "LLP", "PC", "PLLC", "NA", "N.A.", "NA.",
  "USA", "US", "NY", "NYC", "DBA", "FKA", "AKA",
  "II", "III", "IV", "JR", "SR", "ESQ",
]);

/** Prepositions/articles/conjunctions that stay lowercase mid-string. */
const LOWERCASE_WORDS = new Set([
  "a", "an", "the",
  "and", "or", "but", "nor", "for", "yet", "so",
  "of", "at", "by", "in", "on", "to", "up", "from", "into", "with", "as",
]);

/** Common 2–3 letter English words — NOT acronyms even when all-caps in source. */
const COMMON_SHORT_WORDS = new Set([
  // 2-letter
  "as", "at", "be", "by", "do", "go", "he", "hi", "if", "in", "is", "it",
  "me", "my", "no", "of", "on", "or", "so", "to", "up", "us", "we",
  "co", "st",
  // 3-letter
  "and", "any", "are", "but", "can", "did", "for", "get", "had", "has",
  "her", "him", "his", "how", "its", "may", "new", "not", "now", "old",
  "one", "our", "out", "see", "she", "the", "too", "two", "use", "was",
  "way", "who", "why", "you", "all", "did", "off", "per", "set", "top",
  "yes", "yet",
  // Corporate suffixes (title-cased here, then normalizer adds periods)
  "inc", "ltd",
  // Address suffixes
  "ave", "apt",
]);

/** Normalize INC/LTD/CO suffixes to conventional casing with period. */
function normalizeCorporateSuffixes(s: string): string {
  return s
    .replace(/\bInc\b\.?/g, "Inc.")
    .replace(/\bLtd\b\.?/g, "Ltd.")
    .replace(/\bCo\b\.?(?=\s|,|$)/g, "Co.");
}

export function titleCase(input: string): string {
  if (!input) return input;

  // Split on separators but keep them — work with ORIGINAL casing to detect acronyms
  const tokens = input.split(/(\s+|[,.\-/])/);
  let seenRealToken = false;

  const result = tokens.map((tok) => {
    if (!tok || /^\s+$/.test(tok) || /^[,.\-/]$/.test(tok)) return tok;

    const upper = tok.toUpperCase();
    const lower = tok.toLowerCase();
    const isFirst = !seenRealToken;
    seenRealToken = true;

    // Always-uppercase tokens (LLC, N.A., ESQ, etc.)
    if (PRESERVE_UPPERCASE.has(upper)) return upper;

    // Ordinals: 67TH → 67th
    if (/^\d+(st|nd|rd|th)$/i.test(tok)) return lower;

    // Pure numbers
    if (/^\d+$/.test(tok)) return tok;

    // Source was all-caps, 2–3 letters, not a common word → treat as acronym
    const wasAllCaps = tok === upper && /[A-Z]/.test(tok);
    if (wasAllCaps && tok.length >= 2 && tok.length <= 3 && !COMMON_SHORT_WORDS.has(lower)) {
      return upper;
    }

    // Lowercase prepositions/articles unless first token.
    // Skip single-letter tokens — they're part of abbreviations like "N.A."
    if (!isFirst && tok.length >= 2 && LOWERCASE_WORDS.has(lower)) {
      return lower;
    }

    // Default: capitalize first letter, lowercase rest
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join("");

  return normalizeCorporateSuffixes(result);
}

/**
 * Sentence-case a status string. Preserves short acronyms from the source
 * (e.g. "NOV SENT OUT" → "NOV sent out").
 */
export function sentenceCase(input: string): string {
  if (!input) return input;
  const tokens = input.split(/(\s+|[,.\-/])/);
  let seenRealToken = false;

  return tokens.map((tok) => {
    if (!tok || /^\s+$/.test(tok) || /^[,.\-/]$/.test(tok)) return tok;

    const isFirst = !seenRealToken;
    seenRealToken = true;

    const wasAllCaps = tok === tok.toUpperCase() && /[A-Z]/.test(tok);
    const lower = tok.toLowerCase();

    // Preserve short acronyms (2–3 letter, not a common word)
    if (wasAllCaps && tok.length >= 2 && tok.length <= 3 && !COMMON_SHORT_WORDS.has(lower)) {
      return tok.toUpperCase();
    }

    // First real token: capitalize first letter
    if (isFirst) {
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }

    return lower;
  }).join("");
}

/** Returns null for empty, "other", "unknown", "n/a", "none" values. */
export function cleanField(value: string | null | undefined): string | null {
  if (!value) return null;
  const lower = value.trim().toLowerCase();
  if (lower === "" || lower === "other" || lower === "unknown" || lower === "n/a" || lower === "none") {
    return null;
  }
  return value.trim();
}

/** Truncates at a word boundary, never mid-word. Uses single-char ellipsis. */
export function truncateAtWord(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  const cut = s.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  const end = lastSpace > maxLen * 0.6 ? lastSpace : maxLen;
  return cut.slice(0, end).replace(/[,;:\s]+$/, "") + "\u2026";
}

// ── Formatting Helpers ────────────────────────────────────────

function relativeDay(iso: string | Date): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDollar(amount: number): string {
  if (amount >= 1_000_000_000) {
    return `$${(amount / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  }
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `$${m >= 10 ? Math.round(m).toString() : m.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (amount >= 1_000) {
    return `$${Math.round(amount / 1_000)}K`;
  }
  return `$${amount.toLocaleString()}`;
}

function unitTag(profile: NonNullable<NonNullable<TemplateEvent["enrichmentPackage"]>["property_profile"]>): string {
  const res = profile.residentialUnits || 0;
  const com = profile.commercialUnits || 0;
  const total = res + com;
  if (total <= 1) return "";
  return `, ${total} units`;
}

function locationTag(profile: NonNullable<NonNullable<TemplateEvent["enrichmentPackage"]>["property_profile"]>): string {
  const neighborhood = cleanField(profile.neighborhood);
  const units = unitTag(profile);
  if (neighborhood) return ` (${neighborhood}${units})`;
  if (units) return ` (${units.slice(2)})`;
  return "";
}

// ── Templates ─────────────────────────────────────────────────

const HPD_CLASS_LABELS: Record<string, string> = {
  A: "non-hazardous",
  B: "hazardous",
  C: "immediately hazardous",
  I: "lead paint",
};

function briefForHpdViolation(event: TemplateEvent): string | null {
  const meta = event.metadata;
  const profile = event.enrichmentPackage?.property_profile;
  if (!profile?.address || !meta) return null;

  const violClass = meta.class || meta.violationclass;
  if (!violClass) return null;

  const addr = titleCase(profile.address);
  const loc = locationTag(profile);
  const when = relativeDay(event.detectedAt);
  const classDesc = HPD_CLASS_LABELS[violClass] || `Class ${violClass}`;
  const rawStatus = cleanField(meta.currentstatus || meta.violationstatus || "");

  let brief = `Class ${violClass} (${classDesc}) HPD violation issued at ${addr}${loc} ${when}`;
  if (rawStatus && rawStatus.toLowerCase() !== "open") brief += `. Status: ${sentenceCase(rawStatus)}`;
  brief += ".";

  return brief;
}

function briefForNewBuildingPermit(event: TemplateEvent): string | null {
  const meta = event.metadata;
  const profile = event.enrichmentPackage?.property_profile;
  if (!profile?.address || !meta) return null;

  const addr = titleCase(profile.address);
  const loc = locationTag(profile);
  const when = relativeDay(event.detectedAt);

  const jobType = cleanField(meta.job_type);
  const stories = meta.proposed_no_of_stories;
  const units = meta.proposed_dwelling_units;
  const cost = parseFloat(meta.initial_cost || "0");
  const buildingType = cleanField(meta.building_type);
  const rawStatus = cleanField(meta.filing_status);

  const details: string[] = [];
  if (stories) details.push(`${stories}-story`);
  if (buildingType) details.push(buildingType.toLowerCase());
  if (units && parseInt(units) > 0) details.push(`${units} dwelling units`);
  if (cost > 0) details.push(`est. cost ${formatDollar(cost)}`);

  const detailStr = details.length > 0 ? ` for ${details.join(", ")}` : "";
  let brief = `New building permit${jobType ? ` (${jobType})` : ""} filed at ${addr}${loc} ${when}${detailStr}`;
  if (rawStatus) brief += `. Status: ${sentenceCase(rawStatus)}`;
  brief += ".";

  return brief;
}

function briefForLoanRecorded(event: TemplateEvent): string | null {
  const meta = event.metadata;
  const profile = event.enrichmentPackage?.property_profile;
  if (!profile?.address || !meta) return null;

  const amount = parseFloat(meta.document_amt || meta.doc_amount || "0");
  if (amount <= 0) return null;

  const addr = titleCase(profile.address);
  const loc = locationTag(profile);
  const when = relativeDay(event.detectedAt);

  // ACRIS mortgage: type 1 = grantor/mortgagor (borrower), type 2 = grantee/mortgagee (lender)
  // Verified 2026-04-25 — type 1 = grantor in all ACRIS docs
  const parties: Array<{ name: string; type: string | number }> = meta._parties || [];
  const borrower = parties.find(p => String(p.type) === "1")?.name;
  const lender = parties.find(p => String(p.type) === "2")?.name;

  let brief = `${formatDollar(amount)} mortgage`;
  if (lender) brief += ` from ${titleCase(lender)}`;
  if (borrower) brief += ` to ${titleCase(borrower)}`;
  brief += ` recorded ${when} against ${addr}${loc}.`;

  return brief;
}

function briefForSaleRecorded(event: TemplateEvent): string | null {
  const meta = event.metadata;
  const profile = event.enrichmentPackage?.property_profile;
  if (!profile?.address || !meta) return null;

  const amount = parseFloat(meta.document_amt || meta.doc_amount || "0");
  if (amount <= 0) return null;

  const addr = titleCase(profile.address);
  const loc = locationTag(profile);
  const when = relativeDay(event.detectedAt);

  // ACRIS deed: type 1 = grantor (seller), type 2 = grantee (buyer)
  // Verified 2026-04-25 against live Socrata 636b-3b5g doc 2015081800233001
  const parties: Array<{ name: string; type: string | number }> = meta._parties || [];
  const buyer = parties.find(p => String(p.type) === "2")?.name;
  const seller = parties.find(p => String(p.type) === "1")?.name;

  let brief = `${addr}${loc} sold for ${formatDollar(amount)} ${when}`;
  if (seller && buyer) {
    brief += `. ${titleCase(seller)} to ${titleCase(buyer)}`;
  } else if (buyer) {
    brief += ` to ${titleCase(buyer)}`;
  } else if (seller) {
    brief += ` from ${titleCase(seller)}`;
  }
  brief += ".";

  return brief;
}

// ── Dispatcher ────────────────────────────────────────────────

/**
 * Generate a brief from structured event data using deterministic templates.
 * Returns null if the event type isn't templated or required fields are missing.
 */
export function generateTemplateBrief(event: TemplateEvent): string | null {
  switch (event.eventType) {
    case "HPD_VIOLATION":
      return briefForHpdViolation(event);
    case "NEW_BUILDING_PERMIT":
      return briefForNewBuildingPermit(event);
    case "LOAN_RECORDED":
      return briefForLoanRecorded(event);
    case "SALE_RECORDED":
      return briefForSaleRecorded(event);
    default:
      return null;
  }
}
