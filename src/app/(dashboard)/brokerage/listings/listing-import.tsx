"use client";

import { useState, useRef, useCallback } from "react";
import { bulkCreateListings, fuzzyMatchProperties, fuzzyMatchAgents } from "./actions";
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet, X } from "lucide-react";
import type { ListingBulkRow } from "@/lib/bms-types";

interface Props {
  onComplete: () => void;
}

type Stage = "upload" | "preview" | "success";

// ── Parsed Row ────────────────────────────────────────────────

interface ListingRow extends ListingBulkRow {
  _errors: string[];
  _rowIndex: number;
}

// ── Column Aliases ────────────────────────────────────────────

const COLUMN_ALIASES: Record<string, string[]> = {
  address: ["address", "street address", "street"],
  unit: ["unit", "unit number", "apt", "apartment", "suite"],
  city: ["city"],
  state: ["state", "state code"],
  zip: ["zip", "zip code", "postal code"],
  bedrooms: ["bedrooms", "beds", "bed", "bedrooms count", "number of beds"],
  bathrooms: ["bathrooms", "baths", "bath", "bathrooms count", "number of baths"],
  sqft: ["sqft", "square feet", "sf", "square footage"],
  rentPrice: ["rent_price", "rent price", "rent", "monthly rent", "rental price"],
  askingPrice: ["asking_price", "asking price", "price", "sale price"],
  type: ["type", "listing type", "property type"],
  description: ["description", "notes", "property notes"],
  availableDate: ["available_date", "available date", "available", "move in date"],
  agentName: ["agent_name", "agent name", "agent", "listing agent"],
  propertyName: ["property_name", "property name", "property", "building name"],
};

function resolveColumn(header: string): string | null {
  const h = header.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(h) || h === field.toLowerCase()) return field;
  }
  return null;
}

// ── CSV Template ────────────────────────────────────────────

const TEMPLATE_HEADERS = [
  "Address",
  "Unit",
  "City",
  "State",
  "Bedrooms",
  "Bathrooms",
  "Sqft",
  "Rent Price",
  "Available Date",
  "Agent Name",
  "Property Name",
  "Notes",
];

const TEMPLATE_ROWS = [
  ["123 Main St", "1A", "New York", "NY", "2", "1", "1000", "3500", "2026-04-01", "Jane Smith", "Main Towers", "Corner unit, bright"],
  ["456 Park Ave", "5B", "New York", "NY", "3", "2", "1500", "5000", "2026-04-15", "Mike Jones", "Park Plaza", "Recently renovated"],
];

function downloadTemplate() {
  const csv = [TEMPLATE_HEADERS.join(","), ...TEMPLATE_ROWS.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "listing-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Parse & Validate ────────────────────────────────────────

function parseRows(rawRows: Record<string, unknown>[]): ListingRow[] {
  // Build column map from first row keys
  const columnMap: Record<string, string> = {};
  if (rawRows.length > 0) {
    for (const key of Object.keys(rawRows[0])) {
      const resolved = resolveColumn(key);
      if (resolved) columnMap[key] = resolved;
    }
  }

  return rawRows.map((raw, idx) => {
    const mapped: Record<string, unknown> = {};
    for (const [rawKey, field] of Object.entries(columnMap)) {
      mapped[field] = raw[rawKey];
    }

    const errors: string[] = [];

    const address = String(mapped.address || "").trim();
    const unit = String(mapped.unit || "").trim();
    const city = String(mapped.city || "New York").trim();
    const state = String(mapped.state || "NY").trim();
    const zip = String(mapped.zip || "").trim();
    const bedrooms = String(mapped.bedrooms || "").trim();
    const bathrooms = String(mapped.bathrooms || "").trim();
    const sqftRaw = mapped.sqft ? parseFloat(String(mapped.sqft)) : undefined;
    const rentRaw = mapped.rentPrice ? parseFloat(String(mapped.rentPrice)) : undefined;
    const askingRaw = mapped.askingPrice ? parseFloat(String(mapped.askingPrice)) : undefined;
    const type = String(mapped.type || "rental").trim().toLowerCase();
    const description = String(mapped.description || "").trim();
    const availableDate = String(mapped.availableDate || "").trim();
    const agentName = String(mapped.agentName || "").trim();
    const propertyName = String(mapped.propertyName || "").trim();

    if (!address) errors.push("Address required");
    if (rentRaw === undefined && askingRaw === undefined) {
      errors.push("Either rent price or asking price required");
    }
    if (rentRaw !== undefined && isNaN(rentRaw)) {
      errors.push("Rent price must be numeric");
    }
    if (askingRaw !== undefined && isNaN(askingRaw)) {
      errors.push("Asking price must be numeric");
    }
    if (bedrooms && !/^(?:\d+(?:\.\d)?|studio)$/i.test(bedrooms)) {
      errors.push("Invalid bedrooms format");
    }
    if (bathrooms && !/^\d+(?:\.\d)?$/.test(bathrooms)) {
      errors.push("Invalid bathrooms format");
    }
    if (sqftRaw !== undefined && isNaN(sqftRaw)) {
      errors.push("Sqft must be numeric");
    }
    if (type && !["rental", "sale"].includes(type)) {
      errors.push("Type must be 'rental' or 'sale'");
    }

    return {
      address,
      unit: unit || undefined,
      city,
      state,
      bedrooms: bedrooms || undefined,
      bathrooms: bathrooms || undefined,
      sqft: sqftRaw,
      rentPrice: rentRaw,
      askingPrice: askingRaw,
      type: (type || "rental") as "rental" | "sale",
      description: description || undefined,
      availableDate: availableDate || undefined,
      agentName: agentName || undefined,
      propertyName: propertyName || undefined,
      _errors: errors,
      _rowIndex: idx,
    } as ListingRow;
  });
}

// ── Component ───────────────────────────────────────────────

export default function ListingImport({ onComplete }: Props) {
  const [stage, setStage] = useState<Stage>("upload");
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [parsing, setParsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] }>({
    created: 0,
    skipped: 0,
    errors: [],
  });

  const fileRef = useRef<HTMLInputElement>(null);

  // ── Parse File ────────────────────────────────────────────

  const parseFile = useCallback(async (file: File) => {
    setError("");
    setParsing(true);

    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error("No data found in file");

      const rawRows = XLSX.utils.sheet_to_json(firstSheet) as Record<string, unknown>[];
      if (rawRows.length === 0) throw new Error("File is empty — no rows found");

      const parsed = parseRows(rawRows);
      setRows(parsed);

      // Auto-select valid rows
      const validIndices = new Set<number>();
      parsed.forEach((r, i) => {
        if (r._errors.length === 0) validIndices.add(i);
      });
      setSelected(validIndices);
      setStage("preview");
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

  // ── Selection ─────────────────────────────────────────────

  const validIndices = rows.map((r, i) => r._errors.length === 0 ? i : -1).filter((i) => i >= 0);

  function toggleSelect(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === validIndices.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(validIndices));
    }
  }

  // ── Create Listings ────────────────────────────────────────

  async function handleCreate() {
    const selectedRows = rows.filter((_, i) => selected.has(i));
    if (selectedRows.length === 0) return;

    setCreating(true);
    try {
      // Resolve property and agent names to IDs
      const propertyNames = [...new Set(selectedRows.map((r) => r.propertyName).filter(Boolean))];
      const agentNames = [...new Set(selectedRows.map((r) => r.agentName).filter(Boolean))];

      const [propertyMatches, agentMatches] = await Promise.all([
        propertyNames.length > 0 ? fuzzyMatchProperties(propertyNames) : Promise.resolve({}),
        agentNames.length > 0 ? fuzzyMatchAgents(agentNames) : Promise.resolve({}),
      ]);

      const bulkRows: typeof selectedRows = selectedRows.map((r) => ({
        ...r,
        _propertyId: r.propertyName && propertyMatches[r.propertyName] ? propertyMatches[r.propertyName]?.id : undefined,
        _agentId: r.agentName && agentMatches[r.agentName] ? agentMatches[r.agentName]?.id : undefined,
      }));

      const res = await bulkCreateListings(bulkRows);
      setResult({ created: res.created, skipped: 0, errors: res.errors });
      setStage("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import listings");
    } finally {
      setCreating(false);
    }
  }

  // ── Reset ─────────────────────────────────────────────────

  function reset() {
    setStage("upload");
    setRows([]);
    setSelected(new Set());
    setError("");
    setResult({ created: 0, skipped: 0, errors: [] });
  }

  // ── Render: Upload ────────────────────────────────────────

  if (stage === "upload") {
    return (
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
            dragOver
              ? "border-blue-400 bg-blue-50"
              : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
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
                Drop your Excel or CSV file here, or{" "}
                <span className="text-blue-600">click to browse</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">.xlsx, .xls, or .csv</p>
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

        <button
          onClick={downloadTemplate}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 transition-colors"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Download CSV Template
        </button>
      </div>
    );
  }

  // ── Render: Preview ───────────────────────────────────────

  if (stage === "preview") {
    const validCount = validIndices.length;
    const errorCount = rows.length - validCount;

    return (
      <div className="space-y-4">
        {/* Summary bar */}
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-700">
            <strong>{rows.length}</strong> rows found
          </span>
          <span className="text-green-600">
            <strong>{validCount}</strong> valid
          </span>
          {errorCount > 0 && (
            <span className="text-red-500">
              <strong>{errorCount}</strong> with errors
            </span>
          )}
        </div>

        {/* Preview table */}
        <div className="border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.size === validCount && validCount > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 text-blue-600"
                  />
                </th>
                <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  #
                </th>
                <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Address
                </th>
                <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Unit
                </th>
                <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Beds/Baths
                </th>
                <th className="text-right px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Rent
                </th>
                <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Agent
                </th>
                <th className="text-center px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, idx) => {
                const hasErrors = row._errors.length > 0;
                const isSelected = selected.has(idx);
                return (
                  <tr
                    key={idx}
                    className={
                      hasErrors
                        ? "bg-red-50/50"
                        : isSelected
                          ? "bg-blue-50/30"
                          : ""
                    }
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={hasErrors}
                        onChange={() => toggleSelect(idx)}
                        className="rounded border-slate-300 text-blue-600 disabled:opacity-30"
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {row._rowIndex + 1}
                    </td>
                    <td className="px-3 py-2 text-slate-800">
                      {row.address || "\u2014"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {row.unit || "\u2014"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {row.bedrooms}
                      {row.bathrooms ? `/${row.bathrooms}` : ""} {!row.bedrooms && !row.bathrooms && "\u2014"}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {row.rentPrice ? `$${Number(row.rentPrice).toLocaleString()}` : "\u2014"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {row.agentName || "\u2014"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {hasErrors ? (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-red-600"
                          title={row._errors.join("; ")}
                        >
                          <X className="h-3.5 w-3.5" />
                          Error
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle className="h-3.5 w-3.5" />
                          Ready
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={selected.size === 0 || creating}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {creating
              ? "Importing..."
              : `Import ${selected.size} Listing${selected.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    );
  }

  // ── Render: Success ───────────────────────────────────────

  return (
    <div className="flex flex-col items-center py-8">
      <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center mb-4">
        <CheckCircle className="h-7 w-7 text-green-600" />
      </div>
      <p className="text-lg font-semibold text-slate-900 mb-1">
        {result.created} listing{result.created !== 1 ? "s" : ""} imported
      </p>
      {result.errors.length > 0 && (
        <div className="mt-3 max-h-32 overflow-y-auto bg-red-50 border border-red-200 rounded-lg p-3 w-full">
          <p className="text-xs font-semibold text-red-700 mb-1">
            {result.errors.length} error{result.errors.length !== 1 ? "s" : ""}:
          </p>
          <ul className="text-xs text-red-600 space-y-0.5">
            {result.errors.map((e, i) => (
              <li key={i} className="leading-normal">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        onClick={onComplete}
        className="mt-3 px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
      >
        Done
      </button>
    </div>
  );
}
