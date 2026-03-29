// ============================================================
// Bulk Unit Import — CSV/XLSX parsing, column detection, validation
// ============================================================

// ── Types ────────────────────────────────────────────────────

export interface ColumnMapping {
  unit: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  rentAmount: number | null;
  sqft: number | null;
  floor: number | null;
  availableDate: number | null;
  description: number | null;
}

export interface MappedRow {
  rowIndex: number;
  unit: string;
  bedrooms: string;
  bathrooms: string;
  rentAmount: number;
  sqft: number | null;
  floor: string | null;
  availableDate: string | null;
  description: string | null;
}

export interface ValidationError {
  row: number;
  column: string;
  message: string;
}

export interface ValidationResult {
  valid: MappedRow[];
  errors: ValidationError[];
  totalRows: number;
}

// ── Column Name Aliases ──────────────────────────────────────

const ALIASES: Record<keyof ColumnMapping, string[]> = {
  unit: ["unit", "apt", "apartment", "unit #", "apt #", "unit number", "apartment number", "suite", "ste"],
  bedrooms: ["bedrooms", "beds", "bed", "br", "bedroom", "bdrm", "bdrms"],
  bathrooms: ["bathrooms", "baths", "bath", "ba", "bathroom"],
  rentAmount: ["rent", "price", "monthly", "rent amount", "monthly rent", "rent/mo", "asking rent", "rent price"],
  sqft: ["sqft", "sq ft", "square feet", "sf", "size", "area"],
  floor: ["floor", "flr", "level", "story"],
  availableDate: ["available", "available date", "move in", "move-in", "move in date", "availability", "date available"],
  description: ["description", "desc", "notes", "details", "comments"],
};

// ── Parse File (CSV or XLSX) ─────────────────────────────────

export async function parseFile(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (raw.length < 2) throw new Error("File must have a header row and at least one data row");

  const headers = raw[0].map((h) => String(h).trim());
  const rows = raw.slice(1)
    .filter((r) => r.some((c) => String(c).trim() !== ""))
    .map((r) => r.map((c) => String(c).trim()));

  return { headers, rows };
}

// ── Detect Columns ───────────────────────────────────────────

export function detectColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    unit: null,
    bedrooms: null,
    bathrooms: null,
    rentAmount: null,
    sqft: null,
    floor: null,
    availableDate: null,
    description: null,
  };

  const normalized = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9 /\-#]/g, "").trim());

  for (const [field, aliases] of Object.entries(ALIASES) as [keyof ColumnMapping, string[]][]) {
    for (let i = 0; i < normalized.length; i++) {
      if (aliases.includes(normalized[i])) {
        mapping[field] = i;
        break;
      }
    }
    // Fuzzy: check if header starts with or contains alias
    if (mapping[field] === null) {
      for (let i = 0; i < normalized.length; i++) {
        if (aliases.some((a) => normalized[i].startsWith(a) || normalized[i].includes(a))) {
          mapping[field] = i;
          break;
        }
      }
    }
  }

  return mapping;
}

// ── Validate Rows ────────────────────────────────────────────

export function validateRows(rows: string[][], mapping: ColumnMapping): ValidationResult {
  const valid: MappedRow[] = [];
  const errors: ValidationError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed + header row
    let hasError = false;

    // Required: unit
    const unit = mapping.unit !== null ? row[mapping.unit] ?? "" : "";
    if (!unit) {
      errors.push({ row: rowNum, column: "unit", message: "Unit number is required" });
      hasError = true;
    }

    // Required: bedrooms
    const bedroomsRaw = mapping.bedrooms !== null ? row[mapping.bedrooms] ?? "" : "";
    const bedrooms = normalizeBedrooms(bedroomsRaw);
    if (bedrooms === null) {
      errors.push({ row: rowNum, column: "bedrooms", message: `Invalid bedrooms: "${bedroomsRaw}"` });
      hasError = true;
    }

    // Required: rent
    const rentRaw = mapping.rentAmount !== null ? row[mapping.rentAmount] ?? "" : "";
    const rent = parseRent(rentRaw);
    if (rent === null) {
      errors.push({ row: rowNum, column: "rentAmount", message: `Invalid rent: "${rentRaw}"` });
      hasError = true;
    } else if (rent < 100 || rent > 50000) {
      errors.push({ row: rowNum, column: "rentAmount", message: `Rent $${rent} out of range ($100–$50,000)` });
      hasError = true;
    }

    // Optional: sqft
    const sqftRaw = mapping.sqft !== null ? row[mapping.sqft] ?? "" : "";
    const sqft = sqftRaw ? parseInt(sqftRaw.replace(/,/g, ""), 10) : null;
    if (sqftRaw && (isNaN(sqft!) || sqft! <= 0)) {
      errors.push({ row: rowNum, column: "sqft", message: `Invalid sqft: "${sqftRaw}"` });
    }

    // Optional: available date
    const dateRaw = mapping.availableDate !== null ? row[mapping.availableDate] ?? "" : "";
    const availableDate = dateRaw ? parseDate(dateRaw) : null;
    if (dateRaw && !availableDate) {
      errors.push({ row: rowNum, column: "availableDate", message: `Invalid date: "${dateRaw}"` });
    }

    // Optional fields
    const floor = mapping.floor !== null ? row[mapping.floor] || null : null;
    const bathrooms = mapping.bathrooms !== null ? row[mapping.bathrooms] || "1" : "1";
    const description = mapping.description !== null ? row[mapping.description] || null : null;

    if (!hasError) {
      valid.push({
        rowIndex: i,
        unit,
        bedrooms: bedrooms!,
        bathrooms,
        rentAmount: rent!,
        sqft: sqft && !isNaN(sqft) && sqft > 0 ? sqft : null,
        floor,
        availableDate,
        description,
      });
    }
  }

  return { valid, errors, totalRows: rows.length };
}

// ── Generate Template CSV ────────────────────────────────────

export function generateTemplate(): string {
  const headers = ["Unit", "Bedrooms", "Bathrooms", "Rent", "Sqft", "Floor", "Available Date", "Description"];
  const sample = [
    ["1A", "Studio", "1", "2500", "450", "1", "2026-04-01", "Renovated, south-facing"],
    ["2B", "2", "1", "3800", "750", "2", "2026-03-15", "Corner unit, washer/dryer"],
    ["3C", "1", "1", "2900", "550", "3", "", "Available now"],
  ];
  return [headers, ...sample].map((r) => r.join(",")).join("\n");
}

// ── Helpers ──────────────────────────────────────────────────

function normalizeBedrooms(raw: string): string | null {
  const lower = raw.toLowerCase().trim();
  if (lower === "studio" || lower === "0") return "0";
  const num = parseInt(lower, 10);
  if (!isNaN(num) && num >= 0 && num <= 10) return String(num);
  // "1br", "2 bed", etc.
  const match = lower.match(/^(\d+)\s*(br|bed|bedroom|bdrm)?/);
  if (match) return match[1];
  return null;
}

function parseRent(raw: string): number | null {
  // Remove $, commas, spaces
  const cleaned = raw.replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num) || num <= 0) return null;
  return Math.round(num);
}

function parseDate(raw: string): string | null {
  // Try ISO format first
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  // MM/DD/YYYY or M/D/YYYY
  const usMatch = raw.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (usMatch) {
    const d = new Date(parseInt(usMatch[3]), parseInt(usMatch[1]) - 1, parseInt(usMatch[2]));
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  // Try Date.parse as fallback
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return null;
}
