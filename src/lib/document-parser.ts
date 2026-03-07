// ============================================================
// AI Document Parser — extracts deal data from PDF/Excel/CSV
// Uses Claude API for structured extraction + SheetJS for Excel
// ============================================================

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// ── Types ────────────────────────────────────────────────────

export interface ParsedField<T> {
  value: T | null;
  confidence: number;
  source: "om" | "rent_roll" | "t12" | "pro_forma" | "unknown";
  rawText?: string;
}

export interface ParsedUnitDetail {
  unitNumber: ParsedField<string>;
  bedrooms: ParsedField<number>;
  bathrooms: ParsedField<number>;
  sqft: ParsedField<number>;
  legalRent: ParsedField<number>;
  marketRent: ParsedField<number>;
  status: ParsedField<string>;
  leaseExpiry: ParsedField<string>;
  tenantName: ParsedField<string>;
  isStabilized: ParsedField<boolean>;
}

export interface ParsedDealData {
  property: {
    address: ParsedField<string>;
    city: ParsedField<string>;
    state: ParsedField<string>;
    zip: ParsedField<string>;
    borough: ParsedField<string>;
    buildingClass: ParsedField<string>;
    yearBuilt: ParsedField<number>;
    totalUnits: ParsedField<number>;
    totalSF: ParsedField<number>;
    lotSize: ParsedField<number>;
    zoning: ParsedField<string>;
    far: ParsedField<number>;
    askingPrice: ParsedField<number>;
  };
  income: {
    grossPotentialRent: ParsedField<number>;
    vacancyRate: ParsedField<number>;
    vacancyLoss: ParsedField<number>;
    effectiveGrossIncome: ParsedField<number>;
    otherIncome: ParsedField<{ label: string; amount: number }[]>;
    totalGrossIncome: ParsedField<number>;
  };
  unitMix: {
    summary: {
      totalUnits: ParsedField<number>;
      avgRent: ParsedField<number>;
      vacantCount: ParsedField<number>;
      stabilizedCount: ParsedField<number>;
    };
    units: ParsedUnitDetail[];
  };
  expenses: {
    realEstateTaxes: ParsedField<number>;
    insurance: ParsedField<number>;
    gas: ParsedField<number>;
    electric: ParsedField<number>;
    waterSewer: ParsedField<number>;
    fuel: ParsedField<number>;
    repairsMaintenance: ParsedField<number>;
    managementFee: ParsedField<number>;
    payroll: ParsedField<number>;
    legalAccounting: ParsedField<number>;
    administrative: ParsedField<number>;
    reserves: ParsedField<number>;
    other: ParsedField<{ label: string; amount: number }[]>;
    totalExpenses: ParsedField<number>;
    expenseRatio: ParsedField<number>;
  };
  financing: {
    askingPrice: ParsedField<number>;
    suggestedLTV: ParsedField<number>;
    suggestedRate: ParsedField<number>;
    suggestedTerm: ParsedField<number>;
    statedCapRate: ParsedField<number>;
    calculatedCapRate: ParsedField<number>;
  };
  notes: {
    dealSummary: ParsedField<string>;
    highlights: ParsedField<string[]>;
    sellerMotivation: ParsedField<string>;
    buildingCondition: ParsedField<string>;
    opportunityDescription: ParsedField<string>;
  };
  meta: {
    parsedAt: string;
    sourceFiles: { name: string; type: string; size: number }[];
    totalConfidenceScore: number;
    flagCount: number;
  };
}

export type DocumentType = "om" | "rent_roll" | "t12" | "pro_forma" | "unknown";

export interface FileParseResult {
  fileName: string;
  documentType: DocumentType;
  data: Partial<ParsedDealData>;
  error?: string;
}

// ── Default empty ParsedField ────────────────────────────────

function emptyField<T>(source: DocumentType = "unknown"): ParsedField<T> {
  return { value: null, confidence: 0, source };
}

// ── Document type detection ──────────────────────────────────

export function detectDocumentType(
  fileName: string,
  headers?: string[],
  sheetNames?: string[],
): DocumentType {
  const lower = fileName.toLowerCase();
  const allText = [
    lower,
    ...(headers || []).map((h) => h.toLowerCase()),
    ...(sheetNames || []).map((s) => s.toLowerCase()),
  ].join(" ");

  // Rent roll indicators
  const rentRollWords = ["rent roll", "rent_roll", "rentroll", "tenant", "lease", "unit #", "apt"];
  if (rentRollWords.some((w) => allText.includes(w))) return "rent_roll";

  // T-12 indicators
  const t12Words = ["t-12", "t12", "trailing", "operating statement", "actual", "budget"];
  if (t12Words.some((w) => allText.includes(w))) return "t12";

  // Pro forma indicators
  const proFormaWords = ["pro forma", "proforma", "pro_forma", "projection", "year 1", "year 2"];
  if (proFormaWords.some((w) => allText.includes(w))) return "pro_forma";

  // OM indicators (PDF is usually an OM)
  const omWords = ["offering memorandum", "offering memo", "investment summary", "executive summary"];
  if (omWords.some((w) => allText.includes(w))) return "om";

  // If PDF, default to OM
  if (lower.endsWith(".pdf")) return "om";

  return "unknown";
}

// ── PDF text extraction ──────────────────────────────────────

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  return result.text || "";
}

// ── Excel/CSV parsing with SheetJS ───────────────────────────

export async function extractSpreadsheetData(
  buffer: Buffer,
  fileName: string,
): Promise<{ headers: string[]; rows: Record<string, unknown>[]; sheetNames: string[] }> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetNames = workbook.SheetNames;

  // Use the first sheet
  const sheet = workbook.Sheets[sheetNames[0]];
  if (!sheet) return { headers: [], rows: [], sheetNames };

  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];

  return { headers, rows: jsonData, sheetNames };
}

// ── Claude API prompt for PDF OM ─────────────────────────────

const EXTRACTION_SCHEMA = `{
  "property": {
    "address": {"value": "string or null", "confidence": 0.0-1.0},
    "city": {"value": "string or null", "confidence": 0.0-1.0},
    "state": {"value": "string or null", "confidence": 0.0-1.0},
    "zip": {"value": "string or null", "confidence": 0.0-1.0},
    "borough": {"value": "string or null (for NYC: Manhattan/Brooklyn/Bronx/Queens/Staten Island)", "confidence": 0.0-1.0},
    "buildingClass": {"value": "string or null", "confidence": 0.0-1.0},
    "yearBuilt": {"value": "number or null", "confidence": 0.0-1.0},
    "totalUnits": {"value": "number or null", "confidence": 0.0-1.0},
    "totalSF": {"value": "number or null (gross square footage)", "confidence": 0.0-1.0},
    "lotSize": {"value": "number or null (in SF)", "confidence": 0.0-1.0},
    "zoning": {"value": "string or null", "confidence": 0.0-1.0},
    "far": {"value": "number or null", "confidence": 0.0-1.0},
    "askingPrice": {"value": "number or null", "confidence": 0.0-1.0}
  },
  "income": {
    "grossPotentialRent": {"value": "number or null (annual)", "confidence": 0.0-1.0},
    "vacancyRate": {"value": "number or null (percentage, e.g. 5 for 5%)", "confidence": 0.0-1.0},
    "vacancyLoss": {"value": "number or null (annual dollar amount)", "confidence": 0.0-1.0},
    "effectiveGrossIncome": {"value": "number or null (annual)", "confidence": 0.0-1.0},
    "otherIncome": {"value": [{"label": "string", "amount": "number (annual)"}], "confidence": 0.0-1.0},
    "totalGrossIncome": {"value": "number or null (annual)", "confidence": 0.0-1.0}
  },
  "unitMix": {
    "summary": {
      "totalUnits": {"value": "number or null", "confidence": 0.0-1.0},
      "avgRent": {"value": "number or null (monthly)", "confidence": 0.0-1.0},
      "vacantCount": {"value": "number or null", "confidence": 0.0-1.0},
      "stabilizedCount": {"value": "number or null", "confidence": 0.0-1.0}
    },
    "units": []
  },
  "expenses": {
    "realEstateTaxes": {"value": "number or null (annual)", "confidence": 0.0-1.0},
    "insurance": {"value": "number or null (annual)", "confidence": 0.0-1.0},
    "gas": {"value": "number or null (annual)", "confidence": 0.0-1.0},
    "electric": {"value": "number or null (annual)", "confidence": 0.0-1.0},
    "waterSewer": {"value": "number or null (annual)", "confidence": 0.0-1.0},
    "fuel": {"value": "number or null (annual)", "confidence": 0.0-1.0},
    "repairsMaintenance": {"value": "number or null (annual)", "confidence": 0.0-1.0},
    "managementFee": {"value": "number or null (annual)", "confidence": 0.0-1.0},
    "payroll": {"value": "number or null (annual)", "confidence": 0.0-1.0},
    "legalAccounting": {"value": "number or null (annual)", "confidence": 0.0-1.0},
    "administrative": {"value": "number or null (annual)", "confidence": 0.0-1.0},
    "reserves": {"value": "number or null (annual)", "confidence": 0.0-1.0},
    "other": {"value": [{"label": "string", "amount": "number (annual)"}], "confidence": 0.0-1.0},
    "totalExpenses": {"value": "number or null (annual)", "confidence": 0.0-1.0},
    "expenseRatio": {"value": "number or null (percentage)", "confidence": 0.0-1.0}
  },
  "financing": {
    "askingPrice": {"value": "number or null", "confidence": 0.0-1.0},
    "suggestedLTV": {"value": "number or null (percentage)", "confidence": 0.0-1.0},
    "suggestedRate": {"value": "number or null (percentage)", "confidence": 0.0-1.0},
    "suggestedTerm": {"value": "number or null (years)", "confidence": 0.0-1.0},
    "statedCapRate": {"value": "number or null (percentage)", "confidence": 0.0-1.0},
    "calculatedCapRate": {"value": "number or null (percentage)", "confidence": 0.0-1.0}
  },
  "notes": {
    "dealSummary": {"value": "string or null (one paragraph summary)", "confidence": 0.0-1.0},
    "highlights": {"value": ["string"] or null, "confidence": 0.0-1.0},
    "sellerMotivation": {"value": "string or null", "confidence": 0.0-1.0},
    "buildingCondition": {"value": "string or null", "confidence": 0.0-1.0},
    "opportunityDescription": {"value": "string or null", "confidence": 0.0-1.0}
  }
}`;

const SYSTEM_PROMPT = `You are a commercial real estate document parser specializing in NYC multifamily investment properties. Extract structured deal data from the provided document text. Return ONLY valid JSON matching the schema provided.

Rules:
1. For each field, include a confidence score (0.0 to 1.0) based on how clearly the value was stated.
2. If a field is not found, set value to null and confidence to 0.
3. Normalize all expense amounts to ANNUAL values. If monthly values are given, multiply by 12.
4. Normalize all rent amounts to MONTHLY values. If annual values are given, divide by 12.
5. For percentages, use the number itself (e.g., 5 for 5%, not 0.05).
6. Extract the asking price/purchase price if mentioned anywhere in the document.
7. If the document mentions NYC borough, BBL, block/lot, extract those.
8. For unit mix data with individual units, include them in the units array.
9. Calculate expenseRatio as totalExpenses / totalGrossIncome * 100 if you have both.
10. Calculate calculatedCapRate as NOI / askingPrice * 100 if you have both.`;

// ── Parse a single file with Claude ──────────────────────────

export async function parseWithClaude(
  text: string,
  documentType: DocumentType,
  fileName: string,
): Promise<Partial<ParsedDealData>> {
  const typeLabel =
    documentType === "om" ? "Offering Memorandum" :
    documentType === "rent_roll" ? "Rent Roll" :
    documentType === "t12" ? "T-12 Operating Statement" :
    documentType === "pro_forma" ? "Pro Forma" : "Document";

  // Truncate very long texts to stay within context limits
  const maxChars = 100_000;
  const truncated = text.length > maxChars ? text.slice(0, maxChars) + "\n\n[TRUNCATED]" : text;

  const userPrompt = `Parse this ${typeLabel} and extract all deal data. Return ONLY valid JSON matching this schema:

${EXTRACTION_SCHEMA}

Document content:
---
${truncated}
---`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  // Extract JSON from response (handle markdown code blocks)
  let jsonText = content.text.trim();
  const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonText = jsonMatch[1].trim();

  const parsed = JSON.parse(jsonText);

  // Tag every field with the source document type
  return tagSource(parsed, documentType);
}

// ── Tag source on all ParsedField objects ────────────────────

function tagSource(obj: any, source: DocumentType): any {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((item) => tagSource(item, source));

  // If this looks like a ParsedField (has value + confidence keys)
  if ("value" in obj && "confidence" in obj) {
    return { ...obj, source };
  }

  const result: any = {};
  for (const key of Object.keys(obj)) {
    result[key] = tagSource(obj[key], source);
  }
  return result;
}

// ── Parse spreadsheet data with Claude ───────────────────────

export async function parseSpreadsheetWithClaude(
  rows: Record<string, unknown>[],
  headers: string[],
  documentType: DocumentType,
  fileName: string,
): Promise<Partial<ParsedDealData>> {
  // Build a text representation of the spreadsheet
  const maxRows = 200;
  const subset = rows.slice(0, maxRows);

  let text = `File: ${fileName}\nHeaders: ${headers.join(", ")}\n\n`;
  text += "Data:\n";
  for (const row of subset) {
    const vals = headers.map((h) => {
      const v = row[h];
      return v !== null && v !== undefined ? String(v) : "";
    });
    text += vals.join(" | ") + "\n";
  }

  if (rows.length > maxRows) {
    text += `\n[... ${rows.length - maxRows} more rows truncated ...]\n`;
  }

  return parseWithClaude(text, documentType, fileName);
}

// ── Multi-file merge ─────────────────────────────────────────

const SOURCE_PRIORITY: Record<string, Record<DocumentType, number>> = {
  property: { om: 3, rent_roll: 1, t12: 1, pro_forma: 2, unknown: 0 },
  income: { om: 2, rent_roll: 3, t12: 2, pro_forma: 2, unknown: 0 },
  unitMix: { om: 1, rent_roll: 3, t12: 1, pro_forma: 1, unknown: 0 },
  expenses: { om: 1, rent_roll: 0, t12: 3, pro_forma: 2, unknown: 0 },
  financing: { om: 3, rent_roll: 0, t12: 0, pro_forma: 1, unknown: 0 },
  notes: { om: 3, rent_roll: 0, t12: 0, pro_forma: 1, unknown: 0 },
};

function mergeField<T>(
  existing: ParsedField<T> | undefined,
  incoming: ParsedField<T> | undefined,
  section: string,
): ParsedField<T> {
  if (!incoming || incoming.value === null || incoming.value === undefined) {
    return existing || emptyField<T>();
  }
  if (!existing || existing.value === null || existing.value === undefined) {
    return incoming;
  }

  // Both have values — use priority + confidence
  const ePriority = SOURCE_PRIORITY[section]?.[existing.source] ?? 0;
  const iPriority = SOURCE_PRIORITY[section]?.[incoming.source] ?? 0;

  if (iPriority > ePriority) return incoming;
  if (iPriority < ePriority) return existing;
  // Same priority — use higher confidence
  return incoming.confidence > existing.confidence ? incoming : existing;
}

function mergeSectionFields(
  existing: Record<string, any> | undefined,
  incoming: Record<string, any> | undefined,
  section: string,
): Record<string, any> {
  if (!incoming) return existing || {};
  if (!existing) return incoming;

  const merged: Record<string, any> = { ...existing };
  for (const key of Object.keys(incoming)) {
    if (key === "units" && Array.isArray(incoming[key])) {
      // For unit arrays, take the longer/more detailed list
      const existingUnits = existing[key] || [];
      merged[key] = incoming[key].length > existingUnits.length ? incoming[key] : existingUnits;
    } else if (incoming[key] && typeof incoming[key] === "object" && "value" in incoming[key]) {
      merged[key] = mergeField(existing[key], incoming[key], section);
    } else if (typeof incoming[key] === "object" && !Array.isArray(incoming[key])) {
      merged[key] = mergeSectionFields(existing[key], incoming[key], section);
    }
  }
  return merged;
}

export function mergeMultiFileParse(results: FileParseResult[]): ParsedDealData {
  const base = createEmptyParsedData();

  for (const result of results) {
    if (result.error || !result.data) continue;

    const sections = ["property", "income", "unitMix", "expenses", "financing", "notes"] as const;
    for (const section of sections) {
      if (result.data[section]) {
        (base as any)[section] = mergeSectionFields(
          (base as any)[section],
          (result.data as any)[section],
          section,
        );
      }
    }
  }

  // Compute meta
  base.meta.parsedAt = new Date().toISOString();
  base.meta.sourceFiles = results.map((r) => ({
    name: r.fileName,
    type: r.documentType,
    size: 0,
  }));

  // Calculate confidence score and flag count
  const { avg, flags } = computeConfidenceStats(base);
  base.meta.totalConfidenceScore = avg;
  base.meta.flagCount = flags;

  return base;
}

// ── Confidence stats ─────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 0.75;

function collectFields(obj: any): ParsedField<unknown>[] {
  if (!obj || typeof obj !== "object") return [];
  if (Array.isArray(obj)) return obj.flatMap(collectFields);
  if ("value" in obj && "confidence" in obj) {
    return obj.value !== null ? [obj as ParsedField<unknown>] : [];
  }
  return Object.values(obj).flatMap(collectFields);
}

function computeConfidenceStats(data: ParsedDealData): { avg: number; flags: number } {
  const fields = [
    ...collectFields(data.property),
    ...collectFields(data.income),
    ...collectFields(data.expenses),
    ...collectFields(data.financing),
    ...collectFields(data.notes),
    ...collectFields(data.unitMix?.summary),
  ];

  if (fields.length === 0) return { avg: 0, flags: 0 };

  const sum = fields.reduce((s, f) => s + f.confidence, 0);
  const flags = fields.filter((f) => f.confidence < CONFIDENCE_THRESHOLD && f.value !== null).length;

  return { avg: Math.round((sum / fields.length) * 100) / 100, flags };
}

// ── Empty data factory ───────────────────────────────────────

export function createEmptyParsedData(): ParsedDealData {
  const ef = <T>() => emptyField<T>();

  return {
    property: {
      address: ef(), city: ef(), state: ef(), zip: ef(),
      borough: ef(), buildingClass: ef(), yearBuilt: ef(),
      totalUnits: ef(), totalSF: ef(), lotSize: ef(),
      zoning: ef(), far: ef(), askingPrice: ef(),
    },
    income: {
      grossPotentialRent: ef(), vacancyRate: ef(), vacancyLoss: ef(),
      effectiveGrossIncome: ef(), otherIncome: ef(), totalGrossIncome: ef(),
    },
    unitMix: {
      summary: { totalUnits: ef(), avgRent: ef(), vacantCount: ef(), stabilizedCount: ef() },
      units: [],
    },
    expenses: {
      realEstateTaxes: ef(), insurance: ef(), gas: ef(),
      electric: ef(), waterSewer: ef(), fuel: ef(),
      repairsMaintenance: ef(), managementFee: ef(), payroll: ef(),
      legalAccounting: ef(), administrative: ef(), reserves: ef(),
      other: ef(), totalExpenses: ef(), expenseRatio: ef(),
    },
    financing: {
      askingPrice: ef(), suggestedLTV: ef(), suggestedRate: ef(),
      suggestedTerm: ef(), statedCapRate: ef(), calculatedCapRate: ef(),
    },
    notes: {
      dealSummary: ef(), highlights: ef(), sellerMotivation: ef(),
      buildingCondition: ef(), opportunityDescription: ef(),
    },
    meta: {
      parsedAt: new Date().toISOString(),
      sourceFiles: [],
      totalConfidenceScore: 0,
      flagCount: 0,
    },
  };
}
