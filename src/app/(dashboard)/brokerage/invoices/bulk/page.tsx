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
} from "lucide-react";
import {
  getBillToMappings,
  saveBillToMappings,
  getNextInvoiceNumber,
  getFromInfo,
  getInvoiceSettings,
} from "./bulk-actions";
import type { BillToEntity, BillToMappings, FromInfo, InvoiceSettings } from "./bulk-actions";
import { generateBatchInvoiceZip } from "@/lib/invoice-simple-pdf";
import type { SimpleInvoiceData } from "@/lib/invoice-simple-pdf";

// ── Types ─────────────────────────────────────────────────────

interface ParsedRow {
  [key: string]: string | number | undefined;
}

interface MappedRow {
  agentName: string;
  propertyAddress: string;
  tenantName: string;
  amount: number;
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
  { key: "tenantName", label: "Tenant / Client Name", required: false },
  { key: "amount", label: "Commission Amount", required: true },
  { key: "notes", label: "Notes", required: false },
] as const;

type StandardColumnKey = (typeof STANDARD_COLUMNS)[number]["key"];

const COLUMN_ALIASES: Record<StandardColumnKey, string[]> = {
  agentName: ["agent name", "agent", "salesperson", "rep", "representative", "agent_name"],
  propertyAddress: ["property address", "address", "property", "location", "property_address", "unit address"],
  tenantName: ["tenant", "tenant name", "client", "client name", "buyer", "lessee", "tenant_name", "client_name"],
  amount: ["amount", "commission", "commission amount", "fee", "total", "commission_amount", "comm amount", "commission amt"],
  notes: ["notes", "note", "memo", "comments", "remarks", "description"],
};

// ── Helpers ───────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

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

function formatLineDescription(
  format: string,
  tenantName: string,
  propertyAddress: string,
  agentName: string,
): string {
  switch (format) {
    case "rental_commission_tenant_address":
      return tenantName
        ? `Rental commission - ${tenantName} at ${propertyAddress}`
        : `Commission for lease at ${propertyAddress}`;
    case "commission_address_only":
      return `Commission for lease at ${propertyAddress}`;
    case "agent_commission_address":
      return tenantName
        ? `${agentName} - Rental commission - ${tenantName} at ${propertyAddress}`
        : `${agentName} - Commission for lease at ${propertyAddress}`;
    case "custom_short":
      return `Lease commission - ${propertyAddress}`;
    default:
      return tenantName
        ? `Rental commission - ${tenantName} at ${propertyAddress}`
        : `Commission for lease at ${propertyAddress}`;
  }
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
    tenantName: null,
    amount: null,
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
  const [nextInvoiceNum, setNextInvoiceNum] = useState("");
  const [invoiceDate] = useState(() => new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }));
  const [defaultNotes, setDefaultNotes] = useState("");
  const [notesInitialized, setNotesInitialized] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  // ── Load server data on mount ─────────────────────────────
  useEffect(() => {
    getBillToMappings().then(m => setBillToMappings(m)).catch(() => {});
    getFromInfo().then(f => setFromInfo(f)).catch(() => {});
    getNextInvoiceNumber().then(n => setNextInvoiceNum(n)).catch(() => {});
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
      const workbook = XLSX.read(buffer, { type: "array" });
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
        tenantName: autoMatchColumn(hdrs, "tenantName"),
        amount: autoMatchColumn(hdrs, "amount"),
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
      const tenantName = columnMap.tenantName ? String(raw[columnMap.tenantName] || "").trim() : "";
      const amountRaw = columnMap.amount ? raw[columnMap.amount] : undefined;
      const notes = columnMap.notes ? String(raw[columnMap.notes] || "").trim() : "";

      let amount = 0;
      if (typeof amountRaw === "number") {
        amount = amountRaw;
      } else if (typeof amountRaw === "string") {
        amount = parseFloat(amountRaw.replace(/[$,\s]/g, "")) || 0;
      }

      if (!agentName) errors.push("Missing agent name");
      if (!propertyAddress) errors.push("Missing property address");
      if (amount <= 0) errors.push("Invalid commission amount");

      mapped.push({
        agentName,
        propertyAddress,
        tenantName,
        amount,
        notes: notes || undefined,
        _raw: raw,
        _errors: errors.length > 0 ? errors : undefined,
        _rowIndex: i,
      });
    }

    setMappedRows(mapped);
    setPropertyNames(deduplicatePropertyNames(mapped));
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
      const baseNum = parseInt(nextInvoiceNum.replace(/\D/g, "").slice(-4), 10) || 1;
      const year = new Date().getFullYear();
      const prefix = invoiceSettings.invoicePrefix || "INV";

      // Calculate due date from payment terms
      const dueDate = (() => {
        const terms = invoiceSettings.defaultPaymentTerms || "Net 30";
        const daysMatch = terms.match(/(\d+)/);
        const days = daysMatch ? parseInt(daysMatch[1], 10) : 30;
        const d = new Date();
        d.setDate(d.getDate() + days);
        return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      })();

      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        const invoiceNumber = `${prefix}-${year}-${String(baseNum + i).padStart(4, "0")}`;

        // Look up Bill To entity for this property
        const normAddr = normalizePropertyName(row.propertyAddress);
        const billTo = billToMappings[normAddr];

        // Build description based on invoice line format setting
        const description = formatLineDescription(
          invoiceSettings.invoiceLineFormat,
          row.tenantName,
          row.propertyAddress,
          row.agentName,
        );

        invoices.push({
          fromName: fromInfo.name,
          fromAddress: fromInfo.address,
          fromPhone: fromInfo.phone,
          fromEmail: fromInfo.email,

          billToName: billTo?.companyName || "",
          billToAddress: billTo?.address,
          billToPhone: billTo?.phone,
          billToEmail: billTo?.email,

          invoiceNumber,
          invoiceDate,
          dueDate,

          description,
          amount: row.amount,

          notes: defaultNotes || undefined,
          agentName: row.agentName,
          propertyName: row.propertyAddress,
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
                const csv = "Agent Name,Property Address,Tenant Name,Amount,Notes\nJane Smith,123 Main St Apt 4A,John Buyer,5000,First month rent\nMike Jones,456 Park Ave,ABC Corp,7500,Commercial lease\n";
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
                        <th className="text-left px-3 py-1.5 text-xs font-medium text-slate-500">Tenant</th>
                        <th className="text-right px-3 py-1.5 text-xs font-medium text-slate-500">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rawRows.slice(0, 3).map((row, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 text-slate-700">{columnMap.agentName ? String(row[columnMap.agentName] || "—") : "—"}</td>
                          <td className="px-3 py-1.5 text-slate-700">{columnMap.propertyAddress ? String(row[columnMap.propertyAddress] || "—") : "—"}</td>
                          <td className="px-3 py-1.5 text-slate-500">{columnMap.tenantName ? String(row[columnMap.tenantName] || "—") : "—"}</td>
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
              onClick={applyColumnMapping}
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

          {/* From info */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">From (Brokerage)</h3>
            <div className="text-sm text-slate-600">
              <div className="font-medium">{fromInfo.name || "—"}</div>
              {fromInfo.address && <div>{fromInfo.address}</div>}
              {fromInfo.phone && <div>{fromInfo.phone}</div>}
              {fromInfo.email && <div>{fromInfo.email}</div>}
            </div>
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

          {/* Invoice preview table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">#</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Invoice #</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Agent</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Property</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Bill To</th>
                    <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                    <th className="text-center px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mappedRows.map((row, i) => {
                    const hasErrors = row._errors && row._errors.length > 0;
                    const normAddr = normalizePropertyName(row.propertyAddress);
                    const billTo = billToMappings[normAddr];
                    const baseNum = parseInt(nextInvoiceNum.replace(/\D/g, "").slice(-4), 10) || 1;
                    const year = new Date().getFullYear();
                    const pfx = invoiceSettings.invoicePrefix || "INV";
                    const invNum = hasErrors ? "—" : `${pfx}-${year}-${String(baseNum + mappedRows.filter((r, j) => j < i && !r._errors).length).padStart(4, "0")}`;

                    return (
                      <tr key={i} className={hasErrors ? "bg-red-50/40" : ""}>
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-700">{invNum}</td>
                        <td className="px-3 py-2 text-slate-800">{row.agentName || "—"}</td>
                        <td className="px-3 py-2 text-slate-800 max-w-[180px] truncate" title={row.propertyAddress}>
                          {row.propertyAddress || "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {billTo?.companyName || <span className="text-slate-300">Not set</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-green-600">{fmt(row.amount)}</td>
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
                  })}
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
