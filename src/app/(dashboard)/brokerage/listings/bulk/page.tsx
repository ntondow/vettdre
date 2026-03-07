"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  X,
  Building2,
  Plus,
} from "lucide-react";
import {
  bulkCreateListings,
  fuzzyMatchProperties,
  fuzzyMatchAgents,
  createProperty,
} from "../actions";
import { LISTING_COLUMN_ALIASES } from "@/lib/bms-types";
import type { ListingBulkRow, BmsPropertyInput } from "@/lib/bms-types";

// ── Types ──────────────────────────────────────────────────

interface ParsedRow {
  [key: string]: string | number | undefined;
}

type Step = "upload" | "map-columns" | "resolve" | "preview";

const STANDARD_COLUMNS = [
  { key: "propertyName", label: "Property/Complex Name", required: true },
  { key: "address", label: "Address", required: true },
  { key: "unit", label: "Unit", required: false },
  { key: "rentPrice", label: "Rent Price", required: false },
  { key: "bedrooms", label: "Bedrooms", required: false },
  { key: "bathrooms", label: "Bathrooms", required: false },
  { key: "sqft", label: "Sqft", required: false },
  { key: "availableDate", label: "Available Date", required: false },
  { key: "agentName", label: "Agent", required: false },
  { key: "notes", label: "Notes", required: false },
];

function parseExcelDate(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "number") {
    // Excel serial date
    const utc = new Date(Date.UTC(1899, 11, 30 + Math.floor(value)));
    return utc.toISOString().split("T")[0];
  }
  const str = String(value).trim();
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return str;
}

// ── Component ────────────────────────────────────────────────

export default function BulkUploadListingsPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<ParsedRow[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [mappedRows, setMappedRows] = useState<ListingBulkRow[]>([]);

  // Property resolution
  const [propertyNames, setPropertyNames] = useState<string[]>([]);
  const [propertyMatches, setPropertyMatches] = useState<Record<string, { id: string; name: string; listingCount: number } | null>>({});
  const [newPropertyForms, setNewPropertyForms] = useState<Record<string, { name: string; landlordName: string }>>({});

  // Agent resolution
  const [agentMatches, setAgentMatches] = useState<Record<string, { id: string; name: string } | null>>({});

  // Preview
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null);

  // ── Step 1: Upload ──────────────────────────────────────────

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<ParsedRow>(ws, { defval: "" });

    if (json.length === 0) return;

    const hdrs = Object.keys(json[0]);
    setHeaders(hdrs);
    setRawRows(json);

    // Auto-detect column mapping
    const map: Record<string, string> = {};
    for (const col of STANDARD_COLUMNS) {
      const aliases = LISTING_COLUMN_ALIASES[col.key] || [col.key];
      const match = hdrs.find((h) =>
        aliases.some((a) => h.toLowerCase().trim() === a.toLowerCase()),
      );
      if (match) map[col.key] = match;
    }
    setColumnMap(map);
    setStep("map-columns");
  }

  // ── Step 2: Column Mapping → Step 3: Resolution ─────────

  async function handleMapColumns() {
    const rows: ListingBulkRow[] = rawRows.map((raw, i) => {
      const get = (key: string) => {
        const col = columnMap[key];
        return col ? raw[col] : undefined;
      };

      return {
        propertyName: String(get("propertyName") || ""),
        address: String(get("address") || ""),
        unit: get("unit") ? String(get("unit")) : undefined,
        rentPrice: get("rentPrice") ? Number(get("rentPrice")) : undefined,
        bedrooms: get("bedrooms") ? String(get("bedrooms")) : undefined,
        bathrooms: get("bathrooms") ? String(get("bathrooms")) : undefined,
        sqft: get("sqft") ? Number(get("sqft")) : undefined,
        availableDate: parseExcelDate(get("availableDate")),
        agentName: get("agentName") ? String(get("agentName")) : undefined,
        notes: get("notes") ? String(get("notes")) : undefined,
        _rowIndex: i,
      };
    });

    setMappedRows(rows);
    setSelectedRows(new Set(rows.map((_, i) => i)));

    // Extract unique property names and agent names
    const uniqueProps = [...new Set(rows.map((r) => r.propertyName).filter(Boolean))];
    const uniqueAgents = [...new Set(rows.map((r) => r.agentName).filter(Boolean))] as string[];

    setPropertyNames(uniqueProps);

    // Fuzzy match
    const [propMatches, agentResults] = await Promise.all([
      uniqueProps.length > 0 ? fuzzyMatchProperties(uniqueProps) : {} as Record<string, { id: string; name: string; listingCount: number } | null>,
      uniqueAgents.length > 0 ? fuzzyMatchAgents(uniqueAgents) : {} as Record<string, { id: string; name: string } | null>,
    ]);

    setPropertyMatches(propMatches);
    setAgentMatches(agentResults);

    // Initialize new property forms for unmatched
    const newForms: Record<string, { name: string; landlordName: string }> = {};
    for (const name of uniqueProps) {
      if (!propMatches[name]) {
        newForms[name] = { name, landlordName: "" };
      }
    }
    setNewPropertyForms(newForms);

    setStep("resolve");
  }

  // ── Step 3: Resolution → Step 4: Preview ────────────────

  async function handleResolve() {
    // Create new properties for unmatched
    const createdProps: Record<string, string> = {};
    for (const [origName, form] of Object.entries(newPropertyForms)) {
      if (!propertyMatches[origName]) {
        try {
          const prop = await createProperty({
            name: form.name,
            landlordName: form.landlordName || undefined,
          });
          createdProps[origName] = prop.id;
        } catch {
          // Will be handled in preview
        }
      }
    }

    // Assign property IDs and agent IDs to rows
    const updated = mappedRows.map((row) => ({
      ...row,
      _propertyId: propertyMatches[row.propertyName]?.id || createdProps[row.propertyName] || undefined,
      _agentId: row.agentName ? agentMatches[row.agentName]?.id || undefined : undefined,
    }));

    setMappedRows(updated);
    setStep("preview");
  }

  // ── Step 4: Create ─────────────────────────────────────────

  async function handleCreate() {
    setCreating(true);
    try {
      const rowsToCreate = mappedRows.filter((_, i) => selectedRows.has(i));
      const result = await bulkCreateListings(rowsToCreate);
      setResult(result);
    } catch (err) {
      setResult({ created: 0, errors: [err instanceof Error ? err.message : "Unknown error"] });
    } finally {
      setCreating(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50/40 p-4 md:p-6">
      {/* Header */}
      <button
        onClick={() => router.push("/brokerage/listings")}
        className="flex items-center gap-1 text-sm text-blue-600 hover:underline mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Listings
      </button>
      <h1 className="text-xl font-bold text-slate-800 mb-1">Bulk Upload Listings</h1>
      <p className="text-sm text-slate-500 mb-6">Upload an Excel file to create multiple listings at once</p>

      {/* Step Indicator */}
      <div className="flex items-center gap-1.5 md:gap-2 mb-6 overflow-x-auto no-scrollbar">
        {(["upload", "map-columns", "resolve", "preview"] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-1.5 md:gap-2">
            {i > 0 && <div className="w-4 md:w-8 h-0.5 bg-slate-200 flex-shrink-0" />}
            <div className={`flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
              step === s
                ? "bg-blue-600 text-white"
                : ["upload", "map-columns", "resolve", "preview"].indexOf(step) > i
                  ? "bg-blue-100 text-blue-700"
                  : "bg-slate-100 text-slate-500"
            }`}>
              <span className="font-bold">{i + 1}</span>
              <span className="hidden sm:inline">{s === "upload" ? "Upload" : s === "map-columns" ? "Map Columns" : s === "resolve" ? "Properties" : "Preview"}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div
          className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-12 text-center cursor-pointer hover:border-blue-300 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-sm font-medium text-slate-600 mb-1">
            Drop your Excel file here or click to browse
          </p>
          <p className="text-xs text-slate-400">Supports .xlsx, .xls, .csv</p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      )}

      {/* Step 2: Column Mapping */}
      {step === "map-columns" && (
        <div className="bg-white border border-slate-200 rounded-xl">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-700">Column Mapping</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  <FileSpreadsheet className="w-3 h-3 inline mr-1" />
                  {fileName} — {rawRows.length} rows, {headers.length} columns
                </p>
              </div>
            </div>
          </div>
          <div className="px-5 py-4 space-y-3">
            {STANDARD_COLUMNS.map((col) => (
              <div key={col.key} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
                <div className="sm:w-40 text-sm text-slate-700">
                  {col.label}
                  {col.required && <span className="text-red-500 ml-0.5">*</span>}
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 hidden sm:block" />
                <select
                  value={columnMap[col.key] || ""}
                  onChange={(e) => setColumnMap({ ...columnMap, [col.key]: e.target.value })}
                  className={`flex-1 px-3 py-1.5 text-base sm:text-sm border rounded-lg ${
                    col.required && !columnMap[col.key]
                      ? "border-red-200 bg-red-50"
                      : "border-slate-200"
                  }`}
                >
                  <option value="">— Skip —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                {columnMap[col.key] && (
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 hidden sm:block" />
                )}
              </div>
            ))}

            {/* Preview first 3 rows */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-500 mb-2">Preview (first 3 rows)</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      {STANDARD_COLUMNS.filter((c) => columnMap[c.key]).map((c) => (
                        <th key={c.key} className="px-2 py-1.5 text-left text-slate-500 font-medium">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rawRows.slice(0, 3).map((row, i) => (
                      <tr key={i} className="border-t border-slate-50">
                        {STANDARD_COLUMNS.filter((c) => columnMap[c.key]).map((c) => (
                          <td key={c.key} className="px-2 py-1.5 text-slate-700 truncate max-w-[200px]">
                            {String(row[columnMap[c.key]] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100">
            <button
              onClick={() => setStep("upload")}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Back
            </button>
            <button
              onClick={handleMapColumns}
              disabled={!columnMap.propertyName || !columnMap.address}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Next: Resolve Properties <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Property Resolution */}
      {step === "resolve" && (
        <div className="bg-white border border-slate-200 rounded-xl">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">Property Resolution</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {propertyNames.length} unique propert{propertyNames.length === 1 ? "y" : "ies"} found
            </p>
          </div>
          <div className="px-5 py-4 space-y-3">
            {propertyNames.map((name) => {
              const match = propertyMatches[name];
              return (
                <div key={name} className={`flex items-start gap-3 p-3 rounded-lg border ${
                  match ? "border-green-200 bg-green-50/50" : "border-amber-200 bg-amber-50/50"
                }`}>
                  <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                    match ? "bg-green-500 text-white" : "bg-amber-500 text-white"
                  }`}>
                    {match ? <CheckCircle className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{name}</p>
                    {match ? (
                      <p className="text-xs text-green-600">
                        Matched to existing property ({match.listingCount} listing{match.listingCount !== 1 ? "s" : ""})
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <p className="text-xs text-amber-600">New property — will be created</p>
                        <input
                          type="text"
                          value={newPropertyForms[name]?.landlordName || ""}
                          onChange={(e) => setNewPropertyForms({
                            ...newPropertyForms,
                            [name]: { ...newPropertyForms[name], landlordName: e.target.value },
                          })}
                          placeholder="Landlord Name (optional)"
                          className="w-full px-3 py-1.5 text-base sm:text-sm border border-slate-200 rounded-lg"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Agent matches */}
            {Object.keys(agentMatches).length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-2">Agent Matching</p>
                {Object.entries(agentMatches).map(([name, match]) => (
                  <div key={name} className="flex items-center gap-2 py-1">
                    {match ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                    )}
                    <span className="text-sm text-slate-700">{name}</span>
                    <span className="text-xs text-slate-400">→</span>
                    <span className="text-sm text-slate-600">
                      {match ? match.name : "No match — will be left unassigned"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100">
            <button
              onClick={() => setStep("map-columns")}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Back
            </button>
            <button
              onClick={handleResolve}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Next: Preview <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Preview & Create */}
      {step === "preview" && !result && (
        <div className="bg-white border border-slate-200 rounded-xl">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">Preview & Create</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {selectedRows.size} of {mappedRows.length} listings selected across{" "}
              {new Set(mappedRows.filter((_, i) => selectedRows.has(i)).map((r) => r.propertyName)).size} properties
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selectedRows.size === mappedRows.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRows(new Set(mappedRows.map((_, i) => i)));
                        } else {
                          setSelectedRows(new Set());
                        }
                      }}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-2 text-xs font-semibold text-slate-500">Property</th>
                  <th className="px-4 py-2 text-xs font-semibold text-slate-500">Address</th>
                  <th className="px-4 py-2 text-xs font-semibold text-slate-500">Rent</th>
                  <th className="px-4 py-2 text-xs font-semibold text-slate-500">Beds/Baths</th>
                  <th className="px-4 py-2 text-xs font-semibold text-slate-500">Available</th>
                  <th className="px-4 py-2 text-xs font-semibold text-slate-500">Agent</th>
                </tr>
              </thead>
              <tbody>
                {mappedRows.map((row, i) => (
                  <tr key={i} className={`border-b border-slate-50 ${!selectedRows.has(i) ? "opacity-40" : ""}`}>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(i)}
                        onChange={(e) => {
                          const next = new Set(selectedRows);
                          if (e.target.checked) next.add(i);
                          else next.delete(i);
                          setSelectedRows(next);
                        }}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">{row.propertyName}</td>
                    <td className="px-4 py-2 text-sm text-slate-800">
                      {row.address}{row.unit ? ` ${row.unit}` : ""}
                    </td>
                    <td className="px-4 py-2 text-sm text-slate-700">
                      {row.rentPrice ? `$${row.rentPrice.toLocaleString()}` : "\u2014"}
                    </td>
                    <td className="px-4 py-2 text-sm text-slate-500">
                      {row.bedrooms || "\u2014"}{row.bathrooms ? ` / ${row.bathrooms}` : ""}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">{row.availableDate || "\u2014"}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {row.agentName ? (
                        row._agentId ? (
                          <span className="text-green-600">{row.agentName}</span>
                        ) : (
                          <span className="text-amber-600">{row.agentName} (no match)</span>
                        )
                      ) : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100">
            <button
              onClick={() => setStep("resolve")}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Back
            </button>
            <button
              onClick={handleCreate}
              disabled={selectedRows.size === 0 || creating}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? "Creating..." : `Create ${selectedRows.size} Listings`}
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="text-center mb-4">
            {result.created > 0 ? (
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
            ) : (
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            )}
            <h3 className="text-lg font-semibold text-slate-800">
              {result.created > 0 ? `${result.created} Listings Created` : "Upload Failed"}
            </h3>
          </div>
          {result.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm font-medium text-red-700 mb-2">{result.errors.length} error(s):</p>
              <ul className="text-xs text-red-600 space-y-1">
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={() => router.push("/brokerage/listings")}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              View Listings
            </button>
            <button
              onClick={() => {
                setStep("upload");
                setResult(null);
                setRawRows([]);
                setHeaders([]);
                setMappedRows([]);
              }}
              className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Upload Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
