"use client";

import { useState, useRef, useCallback } from "react";
import { bulkCreateAgents } from "./actions";
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet, X } from "lucide-react";

interface Props {
  onComplete: () => void;
}

type Stage = "upload" | "preview" | "success";

// ── Parsed Row ──────────────────────────────────────────────

interface AgentRow {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  licenseNumber: string;
  defaultSplitPct: number;
  _errors: string[];
  _rowIndex: number;
}

// ── Column Aliases ──────────────────────────────────────────

const COLUMN_ALIASES: Record<string, string[]> = {
  firstName: ["first_name", "first name", "firstname", "first", "given name"],
  lastName: ["last_name", "last name", "lastname", "last", "surname", "family name"],
  email: ["email", "email address", "e-mail", "agent email", "agent_email"],
  phone: ["phone", "phone number", "telephone", "cell", "mobile", "agent phone", "agent_phone"],
  licenseNumber: ["license_number", "license number", "license #", "license", "lic #", "lic", "license_no"],
  defaultSplitPct: ["default_split_pct", "default split %", "split %", "split", "agent split", "agent split %", "agent %", "split_pct", "default split"],
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
  "First Name",
  "Last Name",
  "Email",
  "Phone",
  "License Number",
  "Default Split %",
];

const TEMPLATE_ROWS = [
  ["Jane", "Smith", "jane@brokerage.com", "(212) 555-0100", "10401234567", "70"],
  ["Mike", "Jones", "mike@brokerage.com", "(347) 555-0200", "10401234568", "65"],
];

function downloadTemplate() {
  const csv = [TEMPLATE_HEADERS.join(","), ...TEMPLATE_ROWS.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "agent-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Parse & Validate ────────────────────────────────────────

function parseRows(rawRows: Record<string, unknown>[]): AgentRow[] {
  // Build column map from first row keys
  const columnMap: Record<string, string> = {};
  if (rawRows.length > 0) {
    for (const key of Object.keys(rawRows[0])) {
      const resolved = resolveColumn(key);
      if (resolved) columnMap[key] = resolved;
    }
  }

  const emailsSeen = new Set<string>();

  return rawRows.map((raw, idx) => {
    const mapped: Record<string, unknown> = {};
    for (const [rawKey, field] of Object.entries(columnMap)) {
      mapped[field] = raw[rawKey];
    }

    const errors: string[] = [];

    const firstName = String(mapped.firstName || "").trim();
    const lastName = String(mapped.lastName || "").trim();
    const email = String(mapped.email || "").trim();
    const phone = String(mapped.phone || "").trim();
    const licenseNumber = String(mapped.licenseNumber || "").trim();
    const splitRaw = mapped.defaultSplitPct;
    const defaultSplitPct = splitRaw ? parseFloat(String(splitRaw)) : 70;

    if (!firstName) errors.push("First name required");
    if (!lastName) errors.push("Last name required");
    if (!email) {
      errors.push("Email required");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push("Invalid email");
    } else if (emailsSeen.has(email.toLowerCase())) {
      errors.push("Duplicate email in file");
    }

    if (email) emailsSeen.add(email.toLowerCase());

    if (defaultSplitPct < 0 || defaultSplitPct > 100) {
      errors.push("Split must be 0–100");
    }

    return {
      firstName,
      lastName,
      email,
      phone,
      licenseNumber,
      defaultSplitPct: isNaN(defaultSplitPct) ? 70 : defaultSplitPct,
      _errors: errors,
      _rowIndex: idx,
    };
  });
}

// ── Component ───────────────────────────────────────────────

export default function AgentImport({ onComplete }: Props) {
  const [stage, setStage] = useState<Stage>("upload");
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [parsing, setParsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; total: number }>({ created: 0, skipped: 0, total: 0 });

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
      if (next.has(idx)) next.delete(idx); else next.add(idx);
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

  // ── Create Agents ─────────────────────────────────────────

  async function handleCreate() {
    const selectedRows = rows.filter((_, i) => selected.has(i));
    if (selectedRows.length === 0) return;

    setCreating(true);
    try {
      const res = await bulkCreateAgents(
        selectedRows.map((r) => ({
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email,
          phone: r.phone || undefined,
          licenseNumber: r.licenseNumber || undefined,
          defaultSplitPct: r.defaultSplitPct,
        })),
      );
      setResult({ created: res.created, skipped: res.skipped, total: res.total });
      setStage("success");
    } catch {
      setError("Failed to import agents");
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
    setResult({ created: 0, skipped: 0, total: 0 });
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
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
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
                <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">#</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">First Name</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Last Name</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Phone</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">License #</th>
                <th className="text-center px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Split %</th>
                <th className="text-center px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, idx) => {
                const hasErrors = row._errors.length > 0;
                const isSelected = selected.has(idx);
                return (
                  <tr
                    key={idx}
                    className={hasErrors ? "bg-red-50/50" : isSelected ? "bg-blue-50/30" : ""}
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
                    <td className="px-3 py-2 text-slate-400">{row._rowIndex + 1}</td>
                    <td className="px-3 py-2 text-slate-800">{row.firstName || "\u2014"}</td>
                    <td className="px-3 py-2 text-slate-800">{row.lastName || "\u2014"}</td>
                    <td className="px-3 py-2 text-slate-800">{row.email || "\u2014"}</td>
                    <td className="px-3 py-2 text-slate-600">{row.phone || "\u2014"}</td>
                    <td className="px-3 py-2 text-slate-600 font-mono">{row.licenseNumber || "\u2014"}</td>
                    <td className="px-3 py-2 text-center text-slate-700">{row.defaultSplitPct}%</td>
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
            {creating ? "Importing..." : `Import ${selected.size} Agent${selected.size === 1 ? "" : "s"}`}
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
        {result.created} agent{result.created !== 1 ? "s" : ""} imported
      </p>
      {result.skipped > 0 && (
        <p className="text-sm text-amber-600 mb-1">
          {result.skipped} skipped (duplicate emails in brokerage)
        </p>
      )}
      {result.created + result.skipped < result.total && (
        <p className="text-sm text-red-500 mb-1">
          {result.total - result.created - result.skipped} failed — check the data and try again
        </p>
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
