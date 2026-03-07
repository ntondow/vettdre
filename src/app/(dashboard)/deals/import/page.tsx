"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import ResearchLayout from "@/components/research/research-layout";
import {
  Upload,
  FileText,
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Zap,
  Calculator,
  Layers,
  Bookmark,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import type { FileParseResult, ParsedDealData, DocumentType } from "@/lib/document-parser";
import type { ParsedField } from "@/lib/document-parser";
import {
  parseSingleFile,
  mergeParseResults,
  prepareQuickScreenData,
  sendToDealModeler,
  sendToPipeline,
  saveParseDraft,
} from "./actions";

// ── Constants ───────────────────────────────────────────────

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
];
const ACCEPTED_EXT = [".pdf", ".xlsx", ".xls", ".csv"];
const MAX_FILES = 5;
const MAX_SIZE_MB = 25;
const CONFIDENCE_THRESHOLD = 0.75;

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  om: "Offering Memorandum",
  rent_roll: "Rent Roll",
  t12: "T-12 Statement",
  pro_forma: "Pro Forma",
  unknown: "Unknown",
};

const DOC_TYPE_COLORS: Record<DocumentType, string> = {
  om: "bg-violet-500/20 text-violet-300",
  rent_roll: "bg-emerald-500/20 text-emerald-300",
  t12: "bg-amber-500/20 text-amber-300",
  pro_forma: "bg-blue-500/20 text-blue-300",
  unknown: "bg-slate-500/20 text-slate-300",
};

// ── Types ───────────────────────────────────────────────────

interface UploadedFile {
  file: File;
  id: string;
  status: "queued" | "extracting" | "parsing" | "done" | "error";
  documentType: DocumentType;
  error?: string;
  result?: FileParseResult;
}

type Step = "upload" | "parse" | "review" | "send";
const STEPS: Step[] = ["upload", "parse", "review", "send"];
const STEP_LABELS: Record<Step, string> = {
  upload: "Upload",
  parse: "Parse",
  review: "Review",
  send: "Send To",
};

// ── Page Component ──────────────────────────────────────────

export default function ImportDealPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Step state
  const [step, setStep] = useState<Step>("upload");

  // Upload state
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);

  // Parse state
  const [parsing, setParsing] = useState(false);

  // Review state
  const [merged, setMerged] = useState<ParsedDealData | null>(null);
  const [editedData, setEditedData] = useState<ParsedDealData | null>(null);
  const [reviewSection, setReviewSection] = useState<string>("property");

  // Send state
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // ── File handlers ───────────────────────────────────────

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const toAdd: UploadedFile[] = [];
    for (const file of Array.from(newFiles)) {
      if (files.length + toAdd.length >= MAX_FILES) break;
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (!ACCEPTED_EXT.includes(ext)) continue;
      if (file.size > MAX_SIZE_MB * 1024 * 1024) continue;
      toAdd.push({
        file,
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        status: "queued",
        documentType: "unknown",
      });
    }
    setFiles((prev) => [...prev, ...toAdd]);
  }, [files.length]);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  // ── Parse all files ─────────────────────────────────────

  const startParsing = async () => {
    if (files.length === 0) return;
    setParsing(true);
    setStep("parse");

    const results: FileParseResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const uf = files[i];

      // Update status: extracting
      setFiles((prev) =>
        prev.map((f) => (f.id === uf.id ? { ...f, status: "extracting" as const } : f)),
      );

      try {
        // Build FormData
        const fd = new FormData();
        fd.append("file", uf.file);

        // Update status: parsing
        setFiles((prev) =>
          prev.map((f) => (f.id === uf.id ? { ...f, status: "parsing" as const } : f)),
        );

        const result = await parseSingleFile(fd);

        setFiles((prev) =>
          prev.map((f) =>
            f.id === uf.id
              ? {
                  ...f,
                  status: result.error ? ("error" as const) : ("done" as const),
                  documentType: result.documentType,
                  error: result.error,
                  result,
                }
              : f,
          ),
        );

        if (!result.error) results.push(result);
      } catch (err) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uf.id
              ? { ...f, status: "error" as const, error: err instanceof Error ? err.message : "Parse failed" }
              : f,
          ),
        );
      }
    }

    // Merge results
    if (results.length > 0) {
      const mergedData = await mergeParseResults(results);
      setMerged(mergedData);
      setEditedData(mergedData);
    }

    setParsing(false);
  };

  // ── Navigate ────────────────────────────────────────────

  const canAdvance = () => {
    if (step === "upload") return files.length > 0;
    if (step === "parse") return merged !== null && !parsing;
    if (step === "review") return editedData !== null;
    return false;
  };

  const nextStep = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) {
      if (step === "upload") {
        startParsing();
        return; // startParsing handles step transition
      }
      setStep(STEPS[idx + 1]);
    }
  };

  const prevStep = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  // ── Send handlers ───────────────────────────────────────

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleSendToQuickScreen = async () => {
    if (!editedData) return;
    setSending(true);
    try {
      const { queryString } = await prepareQuickScreenData(editedData);
      router.push(`/deals/screen?${queryString}`);
    } catch {
      showToast("Failed to prepare data for Quick Screen");
    }
    setSending(false);
  };

  const handleSendToDealModeler = async () => {
    if (!editedData) return;
    setSending(true);
    try {
      const { dealId } = await sendToDealModeler(editedData);
      router.push(`/deals/new?id=${dealId}`);
    } catch {
      showToast("Failed to send to Deal Modeler");
    }
    setSending(false);
  };

  const handleSendToPipeline = async () => {
    if (!editedData) return;
    setSending(true);
    try {
      await sendToPipeline(editedData);
      showToast("Deal added to pipeline");
      router.push("/deals/pipeline");
    } catch {
      showToast("Failed to add to pipeline");
    }
    setSending(false);
  };

  const handleSaveDraft = async () => {
    if (!editedData) return;
    setSending(true);
    try {
      const name = editedData.property?.address?.value || "Imported Deal";
      await saveParseDraft(editedData, name);
      showToast("Draft saved");
    } catch {
      showToast("Failed to save draft");
    }
    setSending(false);
  };

  // ── Render ──────────────────────────────────────────────

  return (
    <ResearchLayout
      icon={Upload}
      iconColor="text-cyan-400"
      iconBg="bg-cyan-600/20"
      title="Import Deal"
      subtitle="Upload OMs, rent rolls, T-12s, and pro formas — AI extracts the data"
    >
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => {
          const active = step === s;
          const completed = STEPS.indexOf(step) > i;
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-white/20" />}
              <button
                onClick={() => completed && setStep(s)}
                disabled={!completed}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  active
                    ? "bg-cyan-600 text-white"
                    : completed
                    ? "bg-white/10 text-cyan-400 hover:bg-white/15 cursor-pointer"
                    : "bg-white/[0.03] text-white/30"
                }`}
              >
                {STEP_LABELS[s]}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Step 1: Upload ─────────────────────────────── */}
      {step === "upload" && (
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-cyan-500 bg-cyan-500/10"
                : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
            }`}
          >
            <Upload className="w-10 h-10 mx-auto mb-3 text-cyan-400/60" />
            <p className="text-sm font-medium text-white/80">
              Drop files here or click to browse
            </p>
            <p className="text-xs text-white/40 mt-1">
              PDF, XLSX, XLS, CSV — up to {MAX_SIZE_MB}MB each, max {MAX_FILES} files
            </p>
            <div className="flex gap-2 justify-center mt-3">
              {["OM", "Rent Roll", "T-12", "Pro Forma"].map((label) => (
                <span key={label} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/40">
                  {label}
                </span>
              ))}
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXT.join(",")}
              onChange={(e) => e.target.files && addFiles(e.target.files)}
              className="hidden"
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((uf) => (
                <div
                  key={uf.id}
                  className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-lg px-4 py-3"
                >
                  {uf.file.name.toLowerCase().endsWith(".pdf") ? (
                    <FileText className="w-5 h-5 text-red-400/70 flex-shrink-0" />
                  ) : (
                    <FileSpreadsheet className="w-5 h-5 text-emerald-400/70 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/80 truncate">{uf.file.name}</p>
                    <p className="text-[10px] text-white/30">
                      {(uf.file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(uf.id); }}
                    className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-white/60"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Continue button */}
          <div className="flex justify-end">
            <button
              onClick={nextStep}
              disabled={!canAdvance()}
              className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-white/5 disabled:text-white/20 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Parse Documents
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Parse Progress ─────────────────────── */}
      {step === "parse" && (
        <div className="space-y-4">
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-white/80 mb-4">
              {parsing ? "Parsing documents with AI..." : "Parsing complete"}
            </h3>
            <div className="space-y-3">
              {files.map((uf) => (
                <div key={uf.id} className="flex items-center gap-3">
                  {/* Status icon */}
                  {uf.status === "queued" && (
                    <div className="w-5 h-5 rounded-full border border-white/20" />
                  )}
                  {(uf.status === "extracting" || uf.status === "parsing") && (
                    <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                  )}
                  {uf.status === "done" && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  )}
                  {uf.status === "error" && (
                    <AlertCircle className="w-5 h-5 text-red-400" />
                  )}

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/80 truncate">{uf.file.name}</p>
                    <p className="text-[10px] text-white/30">
                      {uf.status === "queued" && "Waiting..."}
                      {uf.status === "extracting" && "Extracting text..."}
                      {uf.status === "parsing" && "AI analyzing content..."}
                      {uf.status === "done" && `Parsed as ${DOC_TYPE_LABELS[uf.documentType]}`}
                      {uf.status === "error" && (uf.error || "Failed")}
                    </p>
                  </div>

                  {/* Document type badge */}
                  {uf.status === "done" && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${DOC_TYPE_COLORS[uf.documentType]}`}>
                      {DOC_TYPE_LABELS[uf.documentType]}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Confidence summary */}
            {merged && (
              <div className="mt-6 pt-4 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white/60">Overall Confidence</p>
                    <p className="text-2xl font-bold text-white">
                      {Math.round(merged.meta.totalConfidenceScore * 100)}%
                    </p>
                  </div>
                  {merged.meta.flagCount > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span className="text-sm text-amber-300">
                        {merged.meta.flagCount} field{merged.meta.flagCount > 1 ? "s" : ""} flagged
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex justify-between">
            <button
              onClick={prevStep}
              className="flex items-center gap-2 px-4 py-2 text-white/50 hover:text-white/80 text-sm transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={nextStep}
              disabled={!canAdvance()}
              className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-white/5 disabled:text-white/20 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Review Extracted Data
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Review ─────────────────────────────── */}
      {step === "review" && editedData && (
        <div className="space-y-4">
          {/* Section tabs */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {REVIEW_SECTIONS.map((sec) => (
              <button
                key={sec.key}
                onClick={() => setReviewSection(sec.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  reviewSection === sec.key
                    ? "bg-cyan-600 text-white"
                    : "bg-white/[0.05] text-white/50 hover:bg-white/10"
                }`}
              >
                {sec.label}
                {sec.key !== "notes" && countFlags(editedData, sec.key) > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/30 text-amber-300 text-[9px]">
                    {countFlags(editedData, sec.key)}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Fields */}
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
            <ReviewFields
              data={editedData}
              section={reviewSection}
              onUpdate={(path, value) => {
                setEditedData((prev) => {
                  if (!prev) return prev;
                  const updated = JSON.parse(JSON.stringify(prev)) as ParsedDealData;
                  setFieldValue(updated, path, value);
                  return updated;
                });
              }}
            />
          </div>

          {/* Navigation */}
          <div className="flex justify-between">
            <button
              onClick={prevStep}
              className="flex items-center gap-2 px-4 py-2 text-white/50 hover:text-white/80 text-sm transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={nextStep}
              disabled={!canAdvance()}
              className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-white/5 disabled:text-white/20 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Choose Destination
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Send To ────────────────────────────── */}
      {step === "send" && editedData && (
        <div className="space-y-4">
          <p className="text-sm text-white/50">
            Choose where to send the extracted deal data.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Quick Screen */}
            <button
              onClick={handleSendToQuickScreen}
              disabled={sending}
              className="flex items-start gap-4 bg-white/[0.03] border border-white/5 hover:border-cyan-500/30 hover:bg-white/[0.05] rounded-xl p-5 text-left transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-amber-600/20 flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Quick Screen</h3>
                <p className="text-xs text-white/40 mt-0.5">
                  Run a fast go/no-go analysis with the extracted numbers
                </p>
              </div>
            </button>

            {/* Deal Modeler */}
            <button
              onClick={handleSendToDealModeler}
              disabled={sending}
              className="flex items-start gap-4 bg-white/[0.03] border border-white/5 hover:border-cyan-500/30 hover:bg-white/[0.05] rounded-xl p-5 text-left transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                <Calculator className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Deal Modeler</h3>
                <p className="text-xs text-white/40 mt-0.5">
                  Open in the full underwriting model with all fields pre-filled
                </p>
              </div>
            </button>

            {/* Pipeline */}
            <button
              onClick={handleSendToPipeline}
              disabled={sending}
              className="flex items-start gap-4 bg-white/[0.03] border border-white/5 hover:border-cyan-500/30 hover:bg-white/[0.05] rounded-xl p-5 text-left transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-violet-600/20 flex items-center justify-center flex-shrink-0">
                <Layers className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Pipeline</h3>
                <p className="text-xs text-white/40 mt-0.5">
                  Save as a pipeline deal for tracking and collaboration
                </p>
              </div>
            </button>

            {/* Save Draft */}
            <button
              onClick={handleSaveDraft}
              disabled={sending}
              className="flex items-start gap-4 bg-white/[0.03] border border-white/5 hover:border-cyan-500/30 hover:bg-white/[0.05] rounded-xl p-5 text-left transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-slate-600/20 flex items-center justify-center flex-shrink-0">
                <Bookmark className="w-5 h-5 text-slate-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Save Draft</h3>
                <p className="text-xs text-white/40 mt-0.5">
                  Save the parsed data to revisit later
                </p>
              </div>
            </button>
          </div>

          {sending && (
            <div className="flex items-center justify-center gap-2 py-4 text-white/50">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Processing...</span>
            </div>
          )}

          {/* Back */}
          <div className="flex justify-start">
            <button
              onClick={prevStep}
              className="flex items-center gap-2 px-4 py-2 text-white/50 hover:text-white/80 text-sm transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Review
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg shadow-lg z-50 animate-[fade-in_200ms]">
          {toast}
        </div>
      )}
    </ResearchLayout>
  );
}

// ── Review Sections Config ────────────────────────────────────

const REVIEW_SECTIONS = [
  { key: "property", label: "Property" },
  { key: "income", label: "Income" },
  { key: "unitMix", label: "Unit Mix" },
  { key: "expenses", label: "Expenses" },
  { key: "financing", label: "Financing" },
  { key: "notes", label: "Notes" },
];

// ── Review Fields Component ──────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  address: "Address",
  city: "City",
  state: "State",
  zip: "Zip Code",
  borough: "Borough",
  buildingClass: "Building Class",
  yearBuilt: "Year Built",
  totalUnits: "Total Units",
  totalSF: "Total Sq Ft",
  lotSize: "Lot Size (SF)",
  zoning: "Zoning",
  far: "FAR",
  askingPrice: "Asking Price",
  grossPotentialRent: "Gross Potential Rent",
  vacancyRate: "Vacancy Rate (%)",
  vacancyLoss: "Vacancy Loss",
  effectiveGrossIncome: "Effective Gross Income",
  totalGrossIncome: "Total Gross Income",
  realEstateTaxes: "Real Estate Taxes",
  insurance: "Insurance",
  gas: "Gas",
  electric: "Electric",
  waterSewer: "Water & Sewer",
  fuel: "Fuel/Heating",
  repairsMaintenance: "Repairs & Maintenance",
  managementFee: "Management Fee",
  payroll: "Payroll",
  legalAccounting: "Legal & Accounting",
  administrative: "Administrative",
  reserves: "Reserves",
  totalExpenses: "Total Expenses",
  expenseRatio: "Expense Ratio (%)",
  suggestedLTV: "LTV (%)",
  suggestedRate: "Interest Rate (%)",
  suggestedTerm: "Loan Term (Years)",
  statedCapRate: "Stated Cap Rate (%)",
  calculatedCapRate: "Calculated Cap Rate (%)",
  dealSummary: "Deal Summary",
  highlights: "Highlights",
  sellerMotivation: "Seller Motivation",
  buildingCondition: "Building Condition",
  opportunityDescription: "Opportunity",
  avgRent: "Average Rent",
  vacantCount: "Vacant Units",
  stabilizedCount: "Stabilized Units",
};

function ReviewFields({
  data,
  section,
  onUpdate,
}: {
  data: ParsedDealData;
  section: string;
  onUpdate: (path: string, value: string | number) => void;
}) {
  if (section === "unitMix") {
    return <UnitMixReview data={data} />;
  }

  const sectionData = (data as unknown as Record<string, unknown>)[section];
  if (!sectionData || typeof sectionData !== "object") return null;

  const fields = Object.entries(sectionData as Record<string, unknown>).filter(
    ([key, val]) => {
      if (key === "otherIncome" || key === "other" || key === "units" || key === "summary") return false;
      return val && typeof val === "object" && "value" in (val as Record<string, unknown>);
    },
  );

  if (fields.length === 0) {
    return (
      <p className="text-sm text-white/30 text-center py-8">
        No data extracted for this section
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {fields.map(([key, fieldObj]) => {
        const field = fieldObj as ParsedField<string | number | string[]>;
        const label = FIELD_LABELS[key] || key;
        const flagged = field.value !== null && field.confidence < CONFIDENCE_THRESHOLD;

        return (
          <div key={key} className="flex items-center gap-3">
            {/* Confidence indicator */}
            <div className="w-6 flex-shrink-0 flex items-center justify-center">
              {field.value === null ? (
                <div className="w-2 h-2 rounded-full bg-white/10" />
              ) : flagged ? (
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400/60" />
              )}
            </div>

            {/* Label */}
            <label className="text-xs text-white/50 w-40 flex-shrink-0">{label}</label>

            {/* Value (editable) */}
            {Array.isArray(field.value) ? (
              <div className="flex-1 text-sm text-white/80">
                {field.value.join(", ") || "—"}
              </div>
            ) : (
              <input
                type={typeof field.value === "number" ? "number" : "text"}
                value={field.value ?? ""}
                onChange={(e) => {
                  const v = typeof field.value === "number" ? parseFloat(e.target.value) || 0 : e.target.value;
                  onUpdate(`${section}.${key}`, v);
                }}
                className={`flex-1 bg-white/[0.03] border rounded-md px-3 py-1.5 text-sm text-white/80 outline-none focus:ring-1 focus:ring-cyan-500 ${
                  flagged ? "border-amber-500/40" : "border-white/10"
                }`}
                placeholder="—"
              />
            )}

            {/* Confidence */}
            <span className={`text-[10px] w-10 text-right flex-shrink-0 ${
              field.value === null
                ? "text-white/20"
                : flagged
                ? "text-amber-400"
                : "text-emerald-400/60"
            }`}>
              {field.value !== null ? `${Math.round(field.confidence * 100)}%` : "—"}
            </span>

            {/* Source badge */}
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
              DOC_TYPE_COLORS[field.source] || DOC_TYPE_COLORS.unknown
            }`}>
              {field.source}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Unit Mix Review ──────────────────────────────────────────

function UnitMixReview({ data }: { data: ParsedDealData }) {
  const units = data.unitMix?.units || [];
  const summary = data.unitMix?.summary;

  return (
    <div className="space-y-4">
      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Units", field: summary.totalUnits },
            { label: "Avg Rent", field: summary.avgRent },
            { label: "Vacant", field: summary.vacantCount },
            { label: "Stabilized", field: summary.stabilizedCount },
          ].map((item) => (
            <div key={item.label} className="bg-white/[0.03] border border-white/5 rounded-lg p-3">
              <p className="text-[10px] text-white/40">{item.label}</p>
              <p className="text-lg font-semibold text-white">
                {item.field.value !== null ? (
                  item.label === "Avg Rent" ? `$${item.field.value.toLocaleString()}` : item.field.value
                ) : "—"}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Unit details */}
      {units.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-xs border-b border-white/5">
                <th className="text-left py-2 px-2">Unit</th>
                <th className="text-left py-2 px-2">BR</th>
                <th className="text-left py-2 px-2">BA</th>
                <th className="text-right py-2 px-2">Sq Ft</th>
                <th className="text-right py-2 px-2">Legal Rent</th>
                <th className="text-right py-2 px-2">Market Rent</th>
                <th className="text-left py-2 px-2">Status</th>
                <th className="text-center py-2 px-2">Stab</th>
              </tr>
            </thead>
            <tbody>
              {units.slice(0, 50).map((unit, i) => (
                <tr key={i} className="border-b border-white/[0.03] text-white/70">
                  <td className="py-1.5 px-2">{unit.unitNumber.value || `#${i + 1}`}</td>
                  <td className="py-1.5 px-2">{unit.bedrooms.value ?? "—"}</td>
                  <td className="py-1.5 px-2">{unit.bathrooms.value ?? "—"}</td>
                  <td className="py-1.5 px-2 text-right">{unit.sqft.value?.toLocaleString() ?? "—"}</td>
                  <td className="py-1.5 px-2 text-right">
                    {unit.legalRent.value !== null ? `$${unit.legalRent.value.toLocaleString()}` : "—"}
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    {unit.marketRent.value !== null ? `$${unit.marketRent.value.toLocaleString()}` : "—"}
                  </td>
                  <td className="py-1.5 px-2">
                    <span className="text-[10px]">{unit.status.value || "—"}</span>
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    {unit.isStabilized.value === true ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300">RS</span>
                    ) : unit.isStabilized.value === false ? (
                      <span className="text-[10px] text-white/20">No</span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {units.length > 50 && (
            <p className="text-xs text-white/30 text-center mt-2">
              Showing 50 of {units.length} units
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-white/30 text-center py-4">
          No individual unit data extracted
        </p>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function countFlags(data: ParsedDealData, section: string): number {
  const sectionData = (data as unknown as Record<string, unknown>)[section];
  if (!sectionData || typeof sectionData !== "object") return 0;

  let count = 0;
  const entries = Object.values(sectionData as Record<string, unknown>);
  for (const val of entries) {
    if (val && typeof val === "object" && "value" in (val as Record<string, unknown>) && "confidence" in (val as Record<string, unknown>)) {
      const field = val as ParsedField<unknown>;
      if (field.value !== null && field.confidence < CONFIDENCE_THRESHOLD) count++;
    }
  }
  return count;
}

function setFieldValue(data: ParsedDealData, path: string, value: string | number) {
  const parts = path.split(".");
  let obj: Record<string, unknown> = data as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    obj = obj[parts[i]] as Record<string, unknown>;
    if (!obj) return;
  }
  const lastKey = parts[parts.length - 1];
  const field = obj[lastKey];
  if (field && typeof field === "object" && "value" in (field as Record<string, unknown>)) {
    (field as ParsedField<string | number>).value = value;
    // If user edited, bump confidence to 1.0
    (field as ParsedField<string | number>).confidence = 1.0;
  }
}
