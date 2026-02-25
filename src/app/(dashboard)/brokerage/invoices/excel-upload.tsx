"use client";

import { useState, useRef, useCallback } from "react";
import { validateExcelData, createBulkInvoices } from "./actions";
import type { ExcelDealRow } from "@/lib/bms-types";
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet, X } from "lucide-react";

interface Props {
  onComplete: () => void;
}

type Stage = "upload" | "preview" | "success";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

// ── CSV Template ──────────────────────────────────────────────

const TEMPLATE_HEADERS = [
  "Agent Name",
  "Property Address",
  "Deal Type",
  "Transaction Value",
  "Commission %",
  "Commission Amount",
  "Agent Split %",
  "Client Name",
  "Closing Date",
  "Notes",
];

const TEMPLATE_ROWS = [
  ["Jane Smith", "123 Main St, Brooklyn, NY 11201", "Sale", "1250000", "6", "", "70", "John Buyer", "2026-03-15", "First-time buyer"],
  ["Mike Jones", "456 Park Ave, Manhattan, NY 10022", "Lease", "84000", "", "5000", "65", "ABC Corp", "2026-04-01", "3-year commercial lease"],
];

function downloadTemplate() {
  const csv = [TEMPLATE_HEADERS.join(","), ...TEMPLATE_ROWS.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "deal-upload-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────

export default function ExcelUpload({ onComplete }: Props) {
  const [stage, setStage] = useState<Stage>("upload");
  const [rows, setRows] = useState<ExcelDealRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [defaultSplit, setDefaultSplit] = useState(70);
  const [parsing, setParsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<{ created: number; total: number }>({ created: 0, total: 0 });

  const fileRef = useRef<HTMLInputElement>(null);

  // ── Parse File ──────────────────────────────────────────────

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

      const validated = await validateExcelData(rawRows);
      setRows(validated.rows);

      // Auto-select valid rows
      const validIndices = new Set<number>();
      validated.rows.forEach((r, i) => {
        if (!r._errors || r._errors.length === 0) validIndices.add(i);
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

  // ── Selection ───────────────────────────────────────────────

  const validIndices = rows.map((r, i) => (!r._errors || r._errors.length === 0) ? i : -1).filter(i => i >= 0);

  function toggleSelect(idx: number) {
    setSelected(prev => {
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

  // ── Create Invoices ─────────────────────────────────────────

  async function handleCreate() {
    const selectedRows = rows.filter((_, i) => selected.has(i));
    if (selectedRows.length === 0) return;

    setCreating(true);
    try {
      const res = await createBulkInvoices(selectedRows, defaultSplit);
      setResult({ created: res.created, total: res.total });
      setStage("success");
    } catch {
      setError("Failed to create invoices");
    } finally {
      setCreating(false);
    }
  }

  // ── Reset ───────────────────────────────────────────────────

  function reset() {
    setStage("upload");
    setRows([]);
    setSelected(new Set());
    setError("");
    setResult({ created: 0, total: 0 });
  }

  // ── Render: Upload ──────────────────────────────────────────

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
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
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

  // ── Render: Preview ─────────────────────────────────────────

  if (stage === "preview") {
    const validCount = validIndices.length;
    const errorCount = rows.length - validCount;

    return (
      <div className="space-y-4">
        {/* Summary bar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
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
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Default Agent Split %</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={defaultSplit}
              onChange={e => setDefaultSplit(parseFloat(e.target.value) || 70)}
              className="w-20 border border-slate-300 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
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
                <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Agent Name</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Property</th>
                <th className="text-center px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Trans. Value</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Commission</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Agent Payout</th>
                <th className="text-center px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, idx) => {
                const hasErrors = row._errors && row._errors.length > 0;
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
                        disabled={!!hasErrors}
                        onChange={() => toggleSelect(idx)}
                        className="rounded border-slate-300 text-blue-600 disabled:opacity-30"
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-400">{(row._rowIndex ?? idx) + 1}</td>
                    <td className="px-3 py-2 text-slate-800">{row.agentName || "\u2014"}</td>
                    <td className="px-3 py-2 text-slate-800 max-w-[180px] truncate" title={row.propertyAddress}>
                      {row.propertyAddress || "\u2014"}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-600 capitalize">{row.dealType || "\u2014"}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{fmt(row.transactionValue || 0)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{fmt(row._totalCommission || 0)}</td>
                    <td className="px-3 py-2 text-right font-medium text-green-600">{fmt(row._agentPayout || 0)}</td>
                    <td className="px-3 py-2 text-center">
                      {hasErrors ? (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-red-600"
                          title={row._errors!.join("; ")}
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
            {creating ? "Creating..." : `Create ${selected.size} Invoice${selected.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    );
  }

  // ── Render: Success ─────────────────────────────────────────

  return (
    <div className="flex flex-col items-center py-8">
      <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center mb-4">
        <CheckCircle className="h-7 w-7 text-green-600" />
      </div>
      <p className="text-lg font-semibold text-slate-900 mb-1">
        {result.created} of {result.total} invoices created
      </p>
      {result.created < result.total && (
        <p className="text-sm text-amber-600 mb-4">
          {result.total - result.created} row{result.total - result.created > 1 ? "s" : ""} failed — check the data and try again
        </p>
      )}
      <button
        onClick={onComplete}
        className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
      >
        Done
      </button>
    </div>
  );
}
