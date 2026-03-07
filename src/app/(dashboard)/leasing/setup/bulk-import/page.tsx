"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Upload, FileSpreadsheet, Check, AlertTriangle, ArrowRight,
  ArrowLeft, Loader2, Download, X, ChevronDown, Building2,
} from "lucide-react";
import {
  parseFile, detectColumns, validateRows, generateTemplate,
} from "@/lib/leasing-import";
import type { ColumnMapping, MappedRow, ValidationError, ValidationResult } from "@/lib/leasing-import";

// ── Target fields ────────────────────────────────────────────

const TARGET_FIELDS: { key: keyof ColumnMapping; label: string; required: boolean }[] = [
  { key: "unit", label: "Unit #", required: true },
  { key: "bedrooms", label: "Bedrooms", required: true },
  { key: "bathrooms", label: "Bathrooms", required: false },
  { key: "rentAmount", label: "Rent / Month", required: true },
  { key: "sqft", label: "Square Feet", required: false },
  { key: "floor", label: "Floor", required: false },
  { key: "availableDate", label: "Available Date", required: false },
  { key: "description", label: "Description", required: false },
];

// ── Step Dots ────────────────────────────────────────────────

function StepDots({ current }: { current: number }) {
  const labels = ["Upload", "Map", "Preview", "Done"];
  return (
    <div className="flex items-center justify-center gap-2 py-6">
      {[1, 2, 3, 4].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-1">
            <div className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
              s === current ? "bg-blue-600 scale-125" : s < current ? "bg-blue-400" : "bg-slate-200"
            }`} />
            <span className="text-[10px] text-slate-400">{labels[s - 1]}</span>
          </div>
          {s < 4 && <div className={`w-6 h-0.5 mb-4 transition-colors duration-300 ${s < current ? "bg-blue-400" : "bg-slate-200"}`} />}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function BulkImportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const propertyId = searchParams.get("propertyId") || "";
  const configId = searchParams.get("configId") || "";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: File
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);

  // Step 2: Mapping
  const [mapping, setMapping] = useState<ColumnMapping>({
    unit: null, bedrooms: null, bathrooms: null, rentAmount: null,
    sqft: null, floor: null, availableDate: null, description: null,
  });

  // Step 3: Validation
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  // Step 4: Result
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; errors: { row: number; message: string }[] } | null>(null);

  // ── Step 1: File Upload ────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("File exceeds 5MB limit. Please use a smaller file.");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext || "")) {
      setError("Please upload a CSV or Excel file (.csv, .xlsx, .xls)");
      return;
    }

    setLoading(true);
    try {
      const { headers: h, rows: r } = await parseFile(file);
      if (r.length > 1000) {
        setError("File has more than 1,000 rows. Please split into smaller files.");
        setLoading(false);
        return;
      }
      setHeaders(h);
      setRawRows(r);
      setFileName(file.name);
      // Auto-detect columns
      const detected = detectColumns(h);
      setMapping(detected);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse file");
    }
    setLoading(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handlePickFile = () => fileInputRef.current?.click();

  const handleDownloadTemplate = () => {
    const csv = generateTemplate();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "unit-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Step 2: Column Mapping ─────────────────────────────────

  const handleMappingChange = (field: keyof ColumnMapping, colIndex: number | null) => {
    setMapping((prev) => ({ ...prev, [field]: colIndex }));
  };

  const requiredMapped = mapping.unit !== null && mapping.bedrooms !== null && mapping.rentAmount !== null;

  const handleValidate = () => {
    const result = validateRows(rawRows, mapping);
    setValidation(result);
    setStep(3);
  };

  // ── Step 3: Import ─────────────────────────────────────────

  const handleImport = async () => {
    if (!validation || validation.valid.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/leasing/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, rows: validation.valid }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Import failed");
      }
      const data = await res.json();
      setResult(data);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    }
    setLoading(false);
  };

  // ── Missing property guard ─────────────────────────────────

  if (!propertyId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <AlertTriangle size={40} className="text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">No property selected</h2>
          <p className="text-sm text-slate-500 mb-4">Set up a property first, then use bulk import to add units.</p>
          <button
            onClick={() => router.push("/leasing/setup")}
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Go to Setup
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="min-h-screen bg-slate-50 pb-20 md:pb-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="text-center pt-8 pb-2">
          <div className="inline-flex items-center gap-2 text-blue-600 mb-2">
            <FileSpreadsheet size={20} />
            <span className="text-sm font-semibold tracking-wide uppercase">Bulk Import</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {step === 1 && "Upload Your Spreadsheet"}
            {step === 2 && "Map Your Columns"}
            {step === 3 && "Review & Import"}
            {step === 4 && "Import Complete"}
          </h1>
        </div>

        <StepDots current={step} />

        {/* Error Banner */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
            <p className="text-sm text-red-800 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              <X size={14} />
            </button>
          </div>
        )}

        {/* ── STEP 1: Upload ──────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={handlePickFile}
              className="border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-xl p-12 text-center cursor-pointer transition-colors bg-white"
            >
              {loading ? (
                <Loader2 size={40} className="mx-auto text-blue-500 animate-spin mb-3" />
              ) : (
                <Upload size={40} className="mx-auto text-slate-400 mb-3" />
              )}
              <p className="text-sm font-medium text-slate-700">
                {loading ? "Parsing file..." : "Drop your CSV or Excel file here"}
              </p>
              <p className="text-xs text-slate-400 mt-1">or click to browse &middot; 5MB max &middot; up to 1,000 rows</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>

            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium mx-auto"
            >
              <Download size={16} /> Download sample template
            </button>
          </div>
        )}

        {/* ── STEP 2: Column Mapping ──────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-medium text-slate-700">
                  <FileSpreadsheet size={14} className="inline mr-1.5 text-slate-400" />
                  {fileName} &middot; {rawRows.length} rows
                </p>
              </div>

              <div className="space-y-3">
                {TARGET_FIELDS.map((field) => (
                  <div key={field.key} className="flex items-center gap-3">
                    <div className="w-36 shrink-0">
                      <span className="text-sm text-slate-700">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-0.5">*</span>}
                      </span>
                    </div>
                    <div className="flex-1 relative">
                      <select
                        value={mapping[field.key] ?? -1}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          handleMappingChange(field.key, v === -1 ? null : v);
                        }}
                        className={`w-full border rounded-lg px-3 py-2.5 text-sm bg-white appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          mapping[field.key] !== null
                            ? "border-blue-300 bg-blue-50/50"
                            : field.required
                              ? "border-amber-300"
                              : "border-slate-200"
                        }`}
                      >
                        <option value={-1}>{field.required ? "— Select column —" : "— Skip —"}</option>
                        {headers.map((h, i) => (
                          <option key={i} value={i}>{h}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
                    </div>
                    {mapping[field.key] !== null && (
                      <Check size={16} className="text-green-500 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Preview of first 3 raw rows */}
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs font-medium text-slate-400 mb-2">Raw data preview (first 3 rows)</p>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr>
                      {headers.map((h, i) => (
                        <th key={i} className="text-left text-slate-500 font-medium px-2 py-1 border-b border-slate-200">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rawRows.slice(0, 3).map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} className="px-2 py-1 text-slate-600 border-b border-slate-100 whitespace-nowrap">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setStep(1); setHeaders([]); setRawRows([]); setFileName(""); }}
                className="px-5 py-3 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <ArrowLeft size={16} className="inline mr-1" /> Back
              </button>
              <button
                onClick={handleValidate}
                disabled={!requiredMapped}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Validate & Preview <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Preview & Validate ──────────────────────── */}
        {step === 3 && validation && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-lg border border-slate-200 p-4 text-center">
                <p className="text-2xl font-bold text-slate-900">{validation.totalRows}</p>
                <p className="text-xs text-slate-500">Total rows</p>
              </div>
              <div className="bg-white rounded-lg border border-green-200 p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{validation.valid.length}</p>
                <p className="text-xs text-slate-500">Valid</p>
              </div>
              <div className={`bg-white rounded-lg border p-4 text-center ${validation.errors.length > 0 ? "border-red-200" : "border-slate-200"}`}>
                <p className={`text-2xl font-bold ${validation.errors.length > 0 ? "text-red-600" : "text-slate-400"}`}>{validation.errors.length}</p>
                <p className="text-xs text-slate-500">Errors</p>
              </div>
            </div>

            {/* Error list */}
            {validation.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm font-medium text-red-800 mb-2">Validation errors</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {validation.errors.slice(0, 20).map((e, i) => (
                    <p key={i} className="text-xs text-red-700">
                      Row {e.row}: <span className="font-medium">{e.column}</span> — {e.message}
                    </p>
                  ))}
                  {validation.errors.length > 20 && (
                    <p className="text-xs text-red-500 font-medium">
                      + {validation.errors.length - 20} more errors
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Valid rows preview table */}
            {validation.valid.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-sm font-medium text-slate-700">Preview (first 10 rows)</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Unit</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Beds</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Bath</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-slate-500">Rent</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-slate-500">Sqft</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Floor</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">Available</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validation.valid.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-medium text-slate-800">{row.unit}</td>
                          <td className="px-3 py-2 text-slate-600">{row.bedrooms === "0" ? "Studio" : row.bedrooms}</td>
                          <td className="px-3 py-2 text-slate-600">{row.bathrooms}</td>
                          <td className="px-3 py-2 text-right text-slate-800">${row.rentAmount.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{row.sqft ?? "—"}</td>
                          <td className="px-3 py-2 text-slate-600">{row.floor ?? "—"}</td>
                          <td className="px-3 py-2 text-slate-600">{row.availableDate ?? "Now"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {validation.valid.length > 10 && (
                  <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-400">
                    + {validation.valid.length - 10} more rows
                  </div>
                )}
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="px-5 py-3 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <ArrowLeft size={16} className="inline mr-1" /> Back
              </button>
              <button
                onClick={handleImport}
                disabled={loading || validation.valid.length === 0}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <><Loader2 size={16} className="animate-spin" /> Importing...</>
                ) : (
                  <>Import {validation.valid.length} Units</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Result ──────────────────────────────────── */}
        {step === 4 && result && (
          <div className="space-y-6">
            {/* Success card */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
              <div className="w-14 h-14 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
                <Check size={28} className="text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">Import Successful</h2>
              <p className="text-sm text-slate-500">{result.created + result.updated} units processed</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-700">{result.created}</p>
                <p className="text-xs text-green-600 font-medium">Created</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-blue-700">{result.updated}</p>
                <p className="text-xs text-blue-600 font-medium">Updated</p>
              </div>
              <div className={`rounded-lg p-4 text-center ${result.skipped > 0 ? "bg-amber-50 border border-amber-200" : "bg-slate-50 border border-slate-200"}`}>
                <p className={`text-2xl font-bold ${result.skipped > 0 ? "text-amber-700" : "text-slate-400"}`}>{result.skipped}</p>
                <p className="text-xs text-slate-500 font-medium">Skipped</p>
              </div>
            </div>

            {/* Errors */}
            {result.errors.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm font-medium text-amber-800 mb-2">Some rows had issues</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-amber-700">Row {e.row}: {e.message}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3">
              <button
                onClick={() => router.push(configId ? `/leasing` : "/leasing")}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-3.5 text-base font-semibold hover:bg-blue-700 transition-colors"
              >
                <Building2 size={18} /> View Conversations
              </button>
              <button
                onClick={() => router.push(`/leasing/setup`)}
                className="w-full flex items-center justify-center gap-2 bg-white text-slate-700 border border-slate-200 rounded-lg py-3 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Set Up Another Property
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
