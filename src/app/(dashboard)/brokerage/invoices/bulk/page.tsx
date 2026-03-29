"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Download,
  X,
  ChevronDown,
  Trash2,
  Info,
  Pencil,
  Check,
  Lock,
  Plus,
} from "lucide-react";
import {
  getBillToMappings,
  saveBillToMappings,
  getFromInfo,
  getInvoiceSettings,
  getPaymentInstructions,
  getBrokerageLogo,
  lookupAgentsByName,
  getInvoiceNumberFormat,
  saveInvoiceNumberFormat,
  getNextInvoiceSequence,
} from "./bulk-actions";
import type { BillToEntity, BillToMappings, FromInfo, InvoiceSettings, PaymentInstructions } from "@/lib/bms-types";
import { resolveInvoiceNumber, INVOICE_NUMBER_TOKENS, DEFAULT_INVOICE_FORMAT } from "@/lib/bms-types";
import type { InvoiceFormatRowData } from "@/lib/bms-types";
import { generateBatchInvoiceZip } from "@/lib/invoice-simple-pdf";
import type { SimpleInvoiceData } from "@/lib/invoice-simple-pdf";

// ── Types ─────────────────────────────────────────────────────

interface ParsedRow {
  [key: string]: string | number | undefined;
}

interface MappedRow {
  agentName: string;
  propertyAddress: string;
  propertyName?: string;
  billTo?: string;
  tenantName: string;
  amount: number;
  rentalPrice?: number;
  moveInDate?: string;
  invoiceNumber?: string;
  notes?: string;
  _raw: ParsedRow;
  _errors?: string[];
  _rowIndex: number;
}

type Step = "upload" | "map-columns" | "bill-to" | "preview";

// ── Standard Column Keys ──────────────────────────────────────

const STANDARD_COLUMNS = [
  { key: "agentName", label: "Agent Name", required: true },
  { key: "propertyAddress", label: "Property Address", required: true },
  { key: "propertyName", label: "Property / Complex Name", required: false },
  { key: "billTo", label: "Bill To", required: false },
  { key: "tenantName", label: "Tenant / Client Name", required: true },
  { key: "amount", label: "Commission Amount", required: true },
  { key: "rentalPrice", label: "Rental Price", required: false },
  { key: "moveInDate", label: "Move-In Date", required: false },
  { key: "invoiceNumber", label: "Invoice #", required: false },
  { key: "notes", label: "Notes", required: false },
] as const;

type StandardColumnKey = (typeof STANDARD_COLUMNS)[number]["key"];

const COLUMN_ALIASES: Record<StandardColumnKey, string[]> = {
  agentName: ["agent name", "agent", "salesperson", "rep", "representative", "agent_name"],
  propertyAddress: ["property address", "address", "location", "property_address", "unit address", "street address"],
  propertyName: ["property name", "property", "complex", "complex name", "building", "building name", "property_name"],
  billTo: ["bill to", "bill to name", "billed to", "billing entity", "landlord", "management", "management company", "owner", "payee", "bill_to", "bill_to_name", "billing_entity", "management_company"],
  tenantName: ["tenant", "tenant name", "client", "client name", "buyer", "lessee", "tenant_name", "client_name", "tenant name(s)", "tenant names"],
  amount: ["amount", "commission", "commission amount", "fee", "total", "commission_amount", "comm amount", "commission amt", "invoiced", "invoiced $", "invoiced amount"],
  rentalPrice: ["rent", "rent price", "monthly rent", "rental price", "rental amount", "rent amount", "rent_price", "monthly_rent"],
  moveInDate: ["move in", "move in date", "move-in date", "lease start", "lease start date", "start date", "move_in_date", "lease_start_date", "date"],
  invoiceNumber: ["invoice #", "invoice number", "invoice no", "invoice_number", "invoice_no", "deal id", "deal_id", "listing id", "listing_id", "listing #", "ref", "reference", "deal code", "deal_code", "inv #", "inv no", "id"],
  notes: ["notes", "note", "memo", "comments", "remarks", "description"],
};

// ── Helpers ───────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

/** Convert Excel serial number (e.g. 46032) or date string to MM/DD/YYYY */
function parseExcelDate(val: string | number | undefined): string {
  if (val === undefined || val === null || val === "") return "";

  // Numeric → Excel serial date (days since 1/1/1900, with the 1900 leap-year bug)
  if (typeof val === "number" || /^\d{4,6}$/.test(String(val).trim())) {
    const serial = typeof val === "number" ? val : parseInt(String(val), 10);
    if (serial > 1 && serial < 200000) {
      // Excel epoch: 1899-12-30 (accounts for the 1900 leap-year bug)
      const epoch = new Date(1899, 11, 30);
      const d = new Date(epoch.getTime() + serial * 86400000);
      if (!isNaN(d.getTime())) {
        return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
      }
    }
  }

  // Already a readable date string — try to parse and reformat
  const str = String(val).trim();
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1970) {
    return `${String(parsed.getMonth() + 1).padStart(2, "0")}/${String(parsed.getDate()).padStart(2, "0")}/${parsed.getFullYear()}`;
  }

  // Return as-is if we can't parse
  return str;
}

function normalizePropertyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deduplicatePropertyNames(rows: MappedRow[]): string[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const addr = row.propertyAddress;
    if (!addr) continue;
    const normalized = normalizePropertyName(addr);
    if (!seen.has(normalized)) {
      seen.set(normalized, addr);
    }
  }
  return Array.from(seen.values()).sort();
}

function autoMatchColumn(headers: string[], targetKey: StandardColumnKey): string | null {
  const aliases = COLUMN_ALIASES[targetKey];
  for (const header of headers) {
    const norm = header.toLowerCase().trim();
    if (aliases.includes(norm)) return header;
    // Partial match
    for (const alias of aliases) {
      if (norm.includes(alias) || alias.includes(norm)) return header;
    }
  }
  return null;
}

/** Build an invoice number from format + row data, or use mapped value if present */
function invoiceNumberForRow(row: MappedRow, format: string, seq: number): string {
  // If the row has a user-supplied invoice number from the spreadsheet, use it as-is
  if (row.invoiceNumber) return row.invoiceNumber;
  return resolveInvoiceNumber(format, {
    propertyName: row.propertyName,
    propertyAddress: row.propertyAddress,
    agentName: row.agentName,
  }, seq);
}

/** Deduplicate invoice numbers within a batch by appending "2", "3", etc. */
function deduplicateInvoiceNumbers(rows: MappedRow[], format: string, startSeq: number): string[] {
  const usedCounts = new Map<string, number>();
  const result: string[] = [];
  let seq = startSeq;
  for (const row of rows) {
    if (row._errors && row._errors.length > 0) {
      result.push("—");
      continue;
    }
    const base = invoiceNumberForRow(row, format, seq);
    const count = (usedCounts.get(base) ?? 0) + 1;
    usedCounts.set(base, count);
    result.push(count === 1 ? base : `${base}${count}`);
    // Only increment sequence for auto-generated numbers (not user-supplied)
    if (!row.invoiceNumber) seq++;
  }
  return result;
}

// ── Component ─────────────────────────────────────────────────

export default function BulkInvoicePage() {
  const router = useRouter();

  // ── State ─────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("upload");
  const [rawRows, setRawRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<StandardColumnKey, string | null>>({
    agentName: null,
    propertyAddress: null,
    propertyName: null,
    billTo: null,
    tenantName: null,
    amount: null,
    rentalPrice: null,
    moveInDate: null,
    invoiceNumber: null,
    notes: null,
  });
  const [mappedRows, setMappedRows] = useState<MappedRow[]>([]);
  const [propertyNames, setPropertyNames] = useState<string[]>([]);
  const [billToMappings, setBillToMappings] = useState<BillToMappings>({});
  const [fromInfo, setFromInfo] = useState<FromInfo>({ name: "" });
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>({
    invoicePrefix: "INV",
    invoiceNotes: "",
    invoiceLineFormat: "rental_commission_tenant_address",
    defaultPaymentTerms: "Net 30",
  });
  // nextInvoiceNum state removed — invoice numbers are now generated per-row from property/tenant data
  const [invoiceDate] = useState(() => new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }));
  const [defaultNotes, setDefaultNotes] = useState("");
  const [notesInitialized, setNotesInitialized] = useState(false);
  const [paymentInstructions, setPaymentInstructions] = useState<PaymentInstructions | null>(null);
  const [brokerageLogo, setBrokerageLogo] = useState<string | null>(null);
  const [agentLicenseMap, setAgentLicenseMap] = useState<Record<string, { licenseNumber?: string }>>({});
  const [billToOverrides, setBillToOverrides] = useState<Record<number, string>>({});
  const [editingFrom, setEditingFrom] = useState(false);
  const [fromInfoLoaded, setFromInfoLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [invoiceFormat, setInvoiceFormat] = useState(DEFAULT_INVOICE_FORMAT);
  const [invoiceFormatLoaded, setInvoiceFormatLoaded] = useState(false);
  const [baseSeq, setBaseSeq] = useState(1);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  // ── Load server data on mount ─────────────────────────────
  useEffect(() => {
    getBillToMappings().then(m => setBillToMappings(m)).catch(() => {});
    getFromInfo().then(f => {
      setFromInfo(f);
      setFromInfoLoaded(true);
      // Auto-open edit mode if settings are empty/incomplete
      if (!f.name && !f.address && !f.phone && !f.email) {
        setEditingFrom(true);
      }
    }).catch(() => { setFromInfoLoaded(true); });
    // Load saved invoice number format + next sequence
    getInvoiceNumberFormat().then(f => {
      if (f) setInvoiceFormat(f);
      setInvoiceFormatLoaded(true);
    }).catch(() => { setInvoiceFormatLoaded(true); });
    getNextInvoiceSequence().then(n => setBaseSeq(n)).catch(() => {});
    getPaymentInstructions().then(pi => setPaymentInstructions(pi)).catch(() => {});
    getBrokerageLogo().then(url => setBrokerageLogo(url)).catch(() => {});
    getInvoiceSettings().then(s => {
      setInvoiceSettings(s);
      if (!notesInitialized && s.invoiceNotes) {
        setDefaultNotes(s.invoiceNotes);
        setNotesInitialized(true);
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 1: Upload & Parse ────────────────────────────────

  const parseFile = useCallback(async (file: File) => {
    setError("");
    setParsing(true);

    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error("No data found in file");

      const rows = XLSX.utils.sheet_to_json(firstSheet) as ParsedRow[];
      if (rows.length === 0) throw new Error("File is empty — no rows found");

      // Get headers from first row keys
      const hdrs = Object.keys(rows[0]);
      setHeaders(hdrs);
      setRawRows(rows);

      // Auto-match columns
      const autoMap: Record<StandardColumnKey, string | null> = {
        agentName: autoMatchColumn(hdrs, "agentName"),
        propertyAddress: autoMatchColumn(hdrs, "propertyAddress"),
        propertyName: autoMatchColumn(hdrs, "propertyName"),
        billTo: autoMatchColumn(hdrs, "billTo"),
        tenantName: autoMatchColumn(hdrs, "tenantName"),
        amount: autoMatchColumn(hdrs, "amount"),
        rentalPrice: autoMatchColumn(hdrs, "rentalPrice"),
        moveInDate: autoMatchColumn(hdrs, "moveInDate"),
        invoiceNumber: autoMatchColumn(hdrs, "invoiceNumber"),
        notes: autoMatchColumn(hdrs, "notes"),
      };
      setColumnMap(autoMap);

      setStep("map-columns");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse file");
    } finally {
      setParsing(false);
    }
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  }

  // ── Step 2: Apply Column Mapping ──────────────────────────

  function applyColumnMapping() {
    const mapped: MappedRow[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i];
      const errors: string[] = [];

      const agentName = columnMap.agentName ? String(raw[columnMap.agentName] || "").trim() : "";
      const propertyAddress = columnMap.propertyAddress ? String(raw[columnMap.propertyAddress] || "").trim() : "";
      const propertyName = columnMap.propertyName ? String(raw[columnMap.propertyName] || "").trim() : "";
      const billTo = columnMap.billTo ? String(raw[columnMap.billTo] || "").trim() : "";
      const tenantName = columnMap.tenantName ? String(raw[columnMap.tenantName] || "").trim() : "";
      const amountRaw = columnMap.amount ? raw[columnMap.amount] : undefined;
      const notes = columnMap.notes ? String(raw[columnMap.notes] || "").trim() : "";
      const moveInDate = columnMap.moveInDate ? parseExcelDate(raw[columnMap.moveInDate]) : "";
      const invoiceNumber = columnMap.invoiceNumber ? String(raw[columnMap.invoiceNumber] || "").trim() : "";

      let amount = 0;
      if (typeof amountRaw === "number") {
        amount = amountRaw;
      } else if (typeof amountRaw === "string") {
        amount = parseFloat(amountRaw.replace(/[$,\s]/g, "")) || 0;
      }

      // Parse rental price
      const rentRaw = columnMap.rentalPrice ? raw[columnMap.rentalPrice] : undefined;
      let rentalPrice: number | undefined;
      if (typeof rentRaw === "number") {
        rentalPrice = rentRaw;
      } else if (typeof rentRaw === "string") {
        const parsed = parseFloat(rentRaw.replace(/[$,\s]/g, ""));
        if (!isNaN(parsed) && parsed > 0) rentalPrice = parsed;
      }

      if (!agentName) errors.push("Missing agent name");
      if (!propertyAddress) errors.push("Missing property address");
      if (amount <= 0) errors.push("Invalid commission amount");

      mapped.push({
        agentName,
        propertyAddress,
        propertyName: propertyName || undefined,
        billTo: billTo || undefined,
        tenantName,
        amount,
        rentalPrice,
        moveInDate: moveInDate || undefined,
        invoiceNumber: invoiceNumber || undefined,
        notes: notes || undefined,
        _raw: raw,
        _errors: errors.length > 0 ? errors : undefined,
        _rowIndex: i,
      });
    }

    setMappedRows(mapped);
    setPropertyNames(deduplicatePropertyNames(mapped));

    // Pre-populate Bill To mappings from spreadsheet values
    if (columnMap.billTo) {
      setBillToMappings(prev => {
        const next = { ...prev };
        // Build a lookup of existing saved entity names for fuzzy matching
        const savedNames = new Map<string, string>(); // lowercase name → original normKey
        for (const [normKey, entity] of Object.entries(prev)) {
          if (entity?.companyName) {
            savedNames.set(entity.companyName.toLowerCase().trim(), normKey);
          }
        }
        // For each property, find the first non-empty Bill To value from its rows
        const propertyBillTo = new Map<string, string>(); // normAddr → billTo value
        for (const row of mapped) {
          if (!row.billTo || !row.propertyAddress) continue;
          const normAddr = normalizePropertyName(row.propertyAddress);
          if (!propertyBillTo.has(normAddr)) {
            propertyBillTo.set(normAddr, row.billTo);
          }
        }
        for (const [normAddr, billToValue] of propertyBillTo) {
          // Skip if there's already a saved mapping with a company name for this property
          if (next[normAddr]?.companyName) continue;
          // Check if this Bill To value matches an existing saved entity
          const matchKey = savedNames.get(billToValue.toLowerCase().trim());
          if (matchKey && next[matchKey]) {
            // Copy the matched entity's full details to this property
            next[normAddr] = { ...next[matchKey] };
          } else {
            // Pre-fill with just the company name for user confirmation
            next[normAddr] = { companyName: billToValue };
          }
        }
        return next;
      });
    }

    setStep("bill-to");
  }

  // ── Step 3: Bill To Management ────────────────────────────

  function updateBillTo(propertyName: string, entity: Partial<BillToEntity>) {
    setBillToMappings(prev => ({
      ...prev,
      [normalizePropertyName(propertyName)]: {
        ...prev[normalizePropertyName(propertyName)],
        companyName: "",
        ...entity,
      },
    }));
  }

  function removeBillTo(propertyName: string) {
    setBillToMappings(prev => {
      const next = { ...prev };
      delete next[normalizePropertyName(propertyName)];
      return next;
    });
  }

  async function saveMappingsAndContinue() {
    await saveBillToMappings(billToMappings).catch(() => {});

    // Lookup agent license numbers
    const uniqueAgentNames = [...new Set(mappedRows.map(r => r.agentName).filter(Boolean))];
    if (uniqueAgentNames.length > 0) {
      lookupAgentsByName(uniqueAgentNames)
        .then(map => setAgentLicenseMap(map))
        .catch(() => {});
    }

    setStep("preview");
  }

  // ── Step 4: Generate & Download ───────────────────────────

  async function generateAndDownload() {
    setGenerating(true);
    setError("");

    try {
      const validRows = mappedRows.filter(r => !r._errors || r._errors.length === 0);
      if (validRows.length === 0) {
        setError("No valid rows to generate invoices from");
        setGenerating(false);
        return;
      }

      // Build SimpleInvoiceData array
      const invoices: SimpleInvoiceData[] = [];

      const year = new Date().getFullYear();

      // Generate descriptive invoice numbers for all rows (with dedup)
      const allInvoiceNumbers = deduplicateInvoiceNumbers(mappedRows, invoiceFormat, baseSeq);
      const validInvoiceNumbers = mappedRows
        .map((r, i) => ({ row: r, num: allInvoiceNumbers[i] }))
        .filter(({ row: r }) => !r._errors || r._errors.length === 0)
        .map(({ num }) => num);

      // Calculate due date from payment terms
      const dueDate = (() => {
        const terms = invoiceSettings.defaultPaymentTerms || "Net 30";
        const daysMatch = terms.match(/(\d+)/);
        const days = daysMatch ? parseInt(daysMatch[1], 10) : 30;
        const d = new Date();
        d.setDate(d.getDate() + days);
        return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      })();

      // Build payment instructions for PDFs (only if enabled and has data)
      const piForPdf = paymentInstructions && paymentInstructions.enabled !== false
        ? paymentInstructions
        : undefined;

      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        const invoiceNumber = validInvoiceNumbers[i];

        // Look up Bill To entity for this property, with per-row override
        const normAddr = normalizePropertyName(row.propertyAddress);
        const billTo = billToMappings[normAddr];
        const billToName = billToOverrides[row._rowIndex] ?? billTo?.companyName ?? "";

        // Look up agent license number
        const agentLicense = row.agentName ? agentLicenseMap[row.agentName]?.licenseNumber : undefined;

        invoices.push({
          brokerageName: fromInfo.name,
          brokerageAddress: fromInfo.address,
          brokeragePhone: fromInfo.phone,
          brokerageEmail: fromInfo.email,
          brokerageLogo: brokerageLogo || undefined,

          billToName,
          billToAddress: billTo?.address,
          billToPhone: billTo?.phone,
          billToEmail: billTo?.email,

          invoiceNr: invoiceNumber,
          invoiceDate,
          dueDate,

          moveInDate: row.moveInDate,
          propertyAddress: row.propertyAddress,
          propertyName: row.propertyName,
          tenantName: row.tenantName,
          rentalPrice: row.rentalPrice,
          commissionAmount: row.amount,

          agentName: row.agentName,
          agentLicenseNumber: agentLicense,

          paymentInstructions: piForPdf,

          notes: defaultNotes || undefined,
          year: String(year),
        });
      }

      const blob = await generateBatchInvoiceZip(invoices);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoices-bulk-${year}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate invoices");
    } finally {
      setGenerating(false);
    }
  }

  // ── Step Indicator ────────────────────────────────────────

  const STEPS: { key: Step; label: string; num: number }[] = [
    { key: "upload", label: "Upload", num: 1 },
    { key: "map-columns", label: "Map Columns", num: 2 },
    { key: "bill-to", label: "Bill To", num: 3 },
    { key: "preview", label: "Preview", num: 4 },
  ];

  const stepIndex = STEPS.findIndex(s => s.key === step);

  function StepIndicator() {
    return (
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => {
          const isActive = i === stepIndex;
          const isDone = i < stepIndex;
          return (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && <div className={`w-8 h-0.5 ${isDone ? "bg-blue-500" : "bg-slate-200"}`} />}
              <div className="flex items-center gap-1.5">
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                    isDone
                      ? "bg-blue-600 text-white"
                      : isActive
                        ? "bg-blue-100 text-blue-700 ring-2 ring-blue-500"
                        : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {isDone ? <CheckCircle className="h-4 w-4" /> : s.num}
                </div>
                <span className={`text-sm font-medium ${isActive ? "text-blue-700" : isDone ? "text-slate-700" : "text-slate-400"}`}>
                  {s.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────

  const validCount = mappedRows.filter(r => !r._errors || r._errors.length === 0).length;
  const errorCount = mappedRows.length - validCount;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/brokerage/invoices")}
          className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bulk Invoice Generator</h1>
          <p className="text-sm text-slate-500 mt-0.5">Upload a spreadsheet, map columns, assign Bill To entities, and download PDFs</p>
        </div>
      </div>

      <StepIndicator />

      {/* Error banner */}
      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Step 1: Upload ──────────────────────────────────── */}
      {step === "upload" && (
        <div className="space-y-4">
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
              dragOver ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            {parsing ? (
              <>
                <div className="h-10 w-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm text-slate-500">Parsing file...</p>
              </>
            ) : (
              <>
                <Upload className="h-10 w-10 text-slate-400 mb-3" />
                <p className="text-sm font-medium text-slate-700">
                  Drop your Excel or CSV file here, or <span className="text-blue-600">click to browse</span>
                </p>
                <p className="text-xs text-slate-400 mt-1">.xlsx, .xls, or .csv — one row per invoice</p>
              </>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex items-center gap-4 text-sm">
            <button
              onClick={() => {
                const csv = "Agent Name,Property Address,Tenant Name,Commission Amount,Rental Price,Move-In Date,Notes\nJane Smith,123 Main St Apt 4A,John Buyer,5000,2500,03/01/2026,First month rent\nMike Jones,456 Park Ave,ABC Corp,7500,3750,04/01/2026,Commercial lease\n";
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "bulk-invoice-template.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Download CSV Template
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Column Mapping ──────────────────────────── */}
      {step === "map-columns" && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-1">Map Your Columns</h2>
            <p className="text-sm text-slate-500 mb-4">
              We detected {headers.length} columns and {rawRows.length} rows. Match each column to the correct field.
            </p>

            <div className="space-y-3">
              {STANDARD_COLUMNS.map(col => (
                <div key={col.key} className="flex items-center gap-4">
                  <div className="w-44 text-sm font-medium text-slate-700">
                    {col.label}
                    {col.required && <span className="text-red-500 ml-0.5">*</span>}
                  </div>
                  <div className="relative flex-1 max-w-xs">
                    <select
                      value={columnMap[col.key] || ""}
                      onChange={e => setColumnMap(prev => ({ ...prev, [col.key]: e.target.value || null }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white pr-8"
                    >
                      <option value="">— Not mapped —</option>
                      {headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>
                  {columnMap[col.key] && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Matched
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Preview first 3 rows */}
            {columnMap.agentName && columnMap.propertyAddress && columnMap.amount && (
              <div className="mt-6 border-t border-slate-100 pt-4">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Preview (first 3 rows)</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left px-3 py-1.5 text-xs font-medium text-slate-500">Agent</th>
                        <th className="text-left px-3 py-1.5 text-xs font-medium text-slate-500">Property</th>
                        <th className="text-left px-3 py-1.5 text-xs font-medium text-slate-500">Bill To</th>
                        <th className="text-left px-3 py-1.5 text-xs font-medium text-slate-500">Tenant</th>
                        <th className="text-left px-3 py-1.5 text-xs font-medium text-slate-500">Move-In</th>
                        <th className="text-right px-3 py-1.5 text-xs font-medium text-slate-500">Rent</th>
                        <th className="text-right px-3 py-1.5 text-xs font-medium text-slate-500">Commission</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rawRows.slice(0, 3).map((row, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 text-slate-700">{columnMap.agentName ? String(row[columnMap.agentName] || "—") : "—"}</td>
                          <td className="px-3 py-1.5 text-slate-700">{columnMap.propertyAddress ? String(row[columnMap.propertyAddress] || "—") : "—"}</td>
                          <td className="px-3 py-1.5 text-slate-500">{columnMap.billTo ? String(row[columnMap.billTo] || "—") : "—"}</td>
                          <td className="px-3 py-1.5 text-slate-500">{columnMap.tenantName ? String(row[columnMap.tenantName] || "—") : "—"}</td>
                          <td className="px-3 py-1.5 text-slate-500">{columnMap.moveInDate ? (parseExcelDate(row[columnMap.moveInDate]) || "—") : "—"}</td>
                          <td className="px-3 py-1.5 text-right text-slate-500">
                            {columnMap.rentalPrice ? fmt(parseFloat(String(row[columnMap.rentalPrice] || "0").replace(/[$,\s]/g, "")) || 0) : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-700">
                            {columnMap.amount ? fmt(parseFloat(String(row[columnMap.amount] || "0").replace(/[$,\s]/g, "")) || 0) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* ── Invoice Number Format ─────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-1">Invoice Number Format</h2>
            <p className="text-sm text-slate-500 mb-4">
              Drag tokens to build your invoice number pattern. Click a token to remove it.
            </p>

            {/* Token chips */}
            <div className="flex flex-wrap gap-2 mb-4">
              {INVOICE_NUMBER_TOKENS.filter(t => !invoiceFormat.includes(t.token)).map(t => (
                <button
                  key={t.token}
                  onClick={() => setInvoiceFormat(prev => prev + t.token)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border border-slate-300 bg-slate-50 text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors"
                  title={t.description}
                >
                  <Plus className="h-3 w-3" />
                  {t.label}
                </button>
              ))}
              {INVOICE_NUMBER_TOKENS.filter(t => !invoiceFormat.includes(t.token)).length === 0 && (
                <span className="text-xs text-slate-400 italic">All tokens in use</span>
              )}
            </div>

            {/* Format builder strip */}
            <div className="flex items-center gap-1 flex-wrap min-h-[40px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg mb-3">
              {(() => {
                // Parse format into segments: tokens and literal text
                const segments: { type: "token" | "text"; value: string; tokenLabel?: string; locked?: boolean }[] = [];
                let remaining = invoiceFormat;
                while (remaining.length > 0) {
                  const tokenMatch = remaining.match(/^\{(SEQ|YEAR|PROP|AGENT|ADDR|MONTH)\}/);
                  if (tokenMatch) {
                    const tok = INVOICE_NUMBER_TOKENS.find(t => t.token === tokenMatch[0]);
                    segments.push({ type: "token", value: tokenMatch[0], tokenLabel: tok?.label, locked: tok && "locked" in tok && tok.locked });
                    remaining = remaining.slice(tokenMatch[0].length);
                  } else {
                    // Collect literal text until next token or end
                    const nextToken = remaining.search(/\{(SEQ|YEAR|PROP|AGENT|ADDR|MONTH)\}/);
                    const textEnd = nextToken === -1 ? remaining.length : nextToken;
                    segments.push({ type: "text", value: remaining.slice(0, textEnd) });
                    remaining = remaining.slice(textEnd);
                  }
                }
                return segments.map((seg, idx) => (
                  seg.type === "token" ? (
                    <span
                      key={idx}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono font-semibold rounded ${
                        seg.locked
                          ? "bg-blue-100 text-blue-700 border border-blue-200"
                          : "bg-indigo-100 text-indigo-700 border border-indigo-200 cursor-pointer hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                      }`}
                      title={seg.locked ? "Required — cannot remove" : "Click to remove"}
                      onClick={() => {
                        if (seg.locked) return;
                        setInvoiceFormat(prev => prev.replace(seg.value, ""));
                      }}
                    >
                      {seg.locked && <Lock className="h-3 w-3" />}
                      {seg.tokenLabel}
                      {!seg.locked && <X className="h-3 w-3" />}
                    </span>
                  ) : (
                    <input
                      key={idx}
                      type="text"
                      value={seg.value}
                      onChange={e => {
                        // Replace this literal segment in the format string
                        const before = invoiceFormat.slice(0, invoiceFormat.indexOf(seg.value, segments.slice(0, idx).reduce((acc, s) => acc + s.value.length, 0)));
                        const after = invoiceFormat.slice(before.length + seg.value.length);
                        setInvoiceFormat(before + e.target.value + after);
                      }}
                      className="w-12 px-1 py-0.5 text-xs font-mono bg-white border border-slate-200 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                      placeholder="-"
                      style={{ width: `${Math.max(2, seg.value.length + 1)}ch` }}
                    />
                  )
                ));
              })()}
            </div>

            {/* Live preview */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Preview:</span>
              <code className="px-3 py-1.5 text-sm font-mono bg-slate-100 border border-slate-200 rounded-lg text-slate-800">
                {rawRows.length > 0 && columnMap.propertyAddress
                  ? resolveInvoiceNumber(invoiceFormat, {
                      propertyName: columnMap.propertyName ? String(rawRows[0][columnMap.propertyName] || "") : undefined,
                      propertyAddress: String(rawRows[0][columnMap.propertyAddress] || ""),
                      agentName: columnMap.agentName ? String(rawRows[0][columnMap.agentName] || "") : undefined,
                    }, baseSeq)
                  : resolveInvoiceNumber(invoiceFormat, { propertyAddress: "123 Main St" }, baseSeq)
                }
              </code>
            </div>

            {/* Reset to default */}
            {invoiceFormat !== DEFAULT_INVOICE_FORMAT && (
              <button
                onClick={() => setInvoiceFormat(DEFAULT_INVOICE_FORMAT)}
                className="mt-3 text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                Reset to default ({DEFAULT_INVOICE_FORMAT})
              </button>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => { setStep("upload"); setRawRows([]); setHeaders([]); }}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={() => {
                // Save format in background before proceeding
                saveInvoiceNumberFormat(invoiceFormat).catch(() => {});
                applyColumnMapping();
              }}
              disabled={!columnMap.agentName || !columnMap.propertyAddress || !columnMap.amount}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Bill To Mapping ─────────────────────────── */}
      {step === "bill-to" && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Bill To Entities</h2>
                <p className="text-sm text-slate-500">
                  Assign a billing entity to each property. {Object.keys(billToMappings).length > 0 &&
                    `${Object.keys(billToMappings).length} saved`}
                </p>
              </div>
              <div className="text-sm text-slate-500">
                {propertyNames.length} unique propert{propertyNames.length === 1 ? "y" : "ies"}
              </div>
            </div>

            <div className="space-y-3">
              {propertyNames.map(propName => {
                const normKey = normalizePropertyName(propName);
                const entity = billToMappings[normKey];
                const hasEntity = entity && entity.companyName;

                return (
                  <div
                    key={propName}
                    className={`border rounded-lg p-4 transition-colors ${hasEntity ? "border-green-200 bg-green-50/30" : "border-slate-200"}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="text-sm font-medium text-slate-800">{propName}</div>
                      {hasEntity && (
                        <button
                          onClick={() => removeBillTo(propName)}
                          className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <input
                        type="text"
                        value={entity?.companyName || ""}
                        onChange={e => updateBillTo(propName, { companyName: e.target.value })}
                        placeholder="Company name *"
                        className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        value={entity?.address || ""}
                        onChange={e => updateBillTo(propName, { address: e.target.value })}
                        placeholder="Address"
                        className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        value={entity?.phone || ""}
                        onChange={e => updateBillTo(propName, { phone: e.target.value })}
                        placeholder="Phone"
                        className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="email"
                        value={entity?.email || ""}
                        onChange={e => updateBillTo(propName, { email: e.target.value })}
                        placeholder="Email"
                        className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep("map-columns")}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={saveMappingsAndContinue}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Continue to Preview
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Preview & Generate ──────────────────────── */}
      {step === "preview" && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-slate-900">{validCount}</div>
              <div className="text-xs text-slate-500">Valid Invoices</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-green-600">
                {fmt(mappedRows.filter(r => !r._errors).reduce((s, r) => s + r.amount, 0))}
              </div>
              <div className="text-xs text-slate-500">Total Amount</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-slate-900">{propertyNames.length}</div>
              <div className="text-xs text-slate-500">Properties</div>
            </div>
          </div>

          {errorCount > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {errorCount} row{errorCount > 1 ? "s" : ""} with errors will be skipped
            </div>
          )}

          {/* From info — read-only by default, click to edit */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700">From (Brokerage)</h3>
              <button
                onClick={() => setEditingFrom(!editingFrom)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors"
              >
                {editingFrom ? (
                  <><Check className="h-3.5 w-3.5" /> Done</>
                ) : (
                  <><Pencil className="h-3.5 w-3.5" /> Edit</>
                )}
              </button>
            </div>

            {editingFrom ? (
              <div className="space-y-2">
                {fromInfoLoaded && !fromInfo.name && !fromInfo.address && (
                  <p className="text-xs text-amber-600 mb-1">
                    Set up your brokerage info in <a href="/brokerage/settings" className="underline hover:text-amber-700">Settings</a> for faster invoicing
                  </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={fromInfo.name || ""}
                    onChange={e => setFromInfo(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Brokerage name"
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={fromInfo.address || ""}
                    onChange={e => setFromInfo(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Address"
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={fromInfo.phone || ""}
                    onChange={e => setFromInfo(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="Phone"
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="email"
                    value={fromInfo.email || ""}
                    onChange={e => setFromInfo(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="Email"
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-600">
                <div className="font-medium text-slate-800">{fromInfo.name || "—"}</div>
                {fromInfo.address && <div>{fromInfo.address}</div>}
                {fromInfo.phone && <div>{fromInfo.phone}</div>}
                {fromInfo.email && <div>{fromInfo.email}</div>}
              </div>
            )}
          </div>

          {/* Default notes */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Default Notes / Payment Instructions</h3>
            <textarea
              value={defaultNotes}
              onChange={e => setDefaultNotes(e.target.value)}
              rows={2}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Please make checks payable to Company LLC..."
            />
          </div>

          {/* Payment instructions status */}
          <div className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4 text-slate-400 flex-shrink-0" />
            {paymentInstructions && paymentInstructions.enabled !== false && (
              paymentInstructions.achBankName || paymentInstructions.wireBankName || paymentInstructions.checkPayableTo
            ) ? (
              <span className="text-green-600">
                Payment instructions: {[
                  paymentInstructions.achBankName && "ACH",
                  paymentInstructions.wireBankName && "Wire",
                  paymentInstructions.checkPayableTo && "Check",
                ].filter(Boolean).join(" + ")} configured
              </span>
            ) : (
              <span className="text-amber-600">
                No payment instructions configured — <a href="/brokerage/settings" className="underline hover:text-amber-700">add in Settings</a>
              </span>
            )}
          </div>

          {/* Invoice preview table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">#</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Invoice #</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Bill To</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Tenant</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Property</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Move-In</th>
                    <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Rent</th>
                    <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Commission</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Agent</th>
                    <th className="text-center px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(() => {
                    const previewInvNums = deduplicateInvoiceNumbers(mappedRows, invoiceFormat, baseSeq);
                    return mappedRows.map((row, i) => {
                    const hasErrors = row._errors && row._errors.length > 0;
                    const normAddr = normalizePropertyName(row.propertyAddress);
                    const billTo = billToMappings[normAddr];
                    const billToDisplay = billToOverrides[row._rowIndex] ?? billTo?.companyName ?? "";
                    const invNum = previewInvNums[i];

                    return (
                      <tr key={i} className={hasErrors ? "bg-red-50/40" : ""}>
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-700">{invNum}</td>
                        <td className="px-3 py-1">
                          <input
                            type="text"
                            value={billToDisplay}
                            onChange={e => setBillToOverrides(prev => ({ ...prev, [row._rowIndex]: e.target.value }))}
                            placeholder="Bill To"
                            className="w-full min-w-[100px] border border-transparent hover:border-slate-300 focus:border-blue-400 rounded px-1.5 py-1 text-sm text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-transparent transition-colors"
                          />
                        </td>
                        <td className="px-3 py-2 text-slate-800 max-w-[140px] truncate" title={row.tenantName}>
                          {row.tenantName || "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-800 max-w-[160px] truncate" title={row.propertyAddress}>
                          {row.propertyAddress || "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">
                          {row.moveInDate || "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600">
                          {row.rentalPrice ? fmt(row.rentalPrice) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-green-600">{fmt(row.amount)}</td>
                        <td className="px-3 py-2 text-slate-800 max-w-[120px] truncate" title={row.agentName}>
                          {row.agentName || "—"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {hasErrors ? (
                            <span className="inline-flex items-center gap-1 text-xs text-red-600" title={row._errors!.join("; ")}>
                              <X className="h-3.5 w-3.5" /> Error
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-green-600">
                              <CheckCircle className="h-3.5 w-3.5" /> Ready
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  });
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep("bill-to")}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={generateAndDownload}
              disabled={generating || validCount === 0}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {generating ? (
                <>
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Download {validCount} Invoice{validCount !== 1 ? "s" : ""} (ZIP)
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
