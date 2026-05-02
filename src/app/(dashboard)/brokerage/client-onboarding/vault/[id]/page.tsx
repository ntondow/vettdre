"use client";

import { useState, useEffect, useCallback, useRef, use, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle,
  X,
  GripVertical,
  Type,
  Calendar,
  PenTool,
  Hash,
  CheckSquare,
} from "lucide-react";
import { getDocumentTemplates, updateTemplateFields } from "../../vault-actions";
import type { TemplateFieldDefinition, TemplateFieldType } from "@/lib/onboarding-types";

// ── Types ────────────────────────────────────────────────────

interface TemplateData {
  id: string;
  name: string;
  templatePdfUrl: string;
  fields: TemplateFieldDefinition[];
  isDefault: boolean;
}

interface RenderedPage {
  dataUrl: string;
  width: number;
  height: number;
}

const FIELD_TYPE_ICONS: Record<TemplateFieldType, React.ReactNode> = {
  text: <Type className="w-3 h-3" />,
  date: <Calendar className="w-3 h-3" />,
  signature: <PenTool className="w-3 h-3" />,
  initials: <Hash className="w-3 h-3" />,
  checkbox: <CheckSquare className="w-3 h-3" />,
};

const FIELD_TYPE_LABELS: Record<TemplateFieldType, string> = {
  text: "Text",
  date: "Date",
  signature: "Signature",
  initials: "Initials",
  checkbox: "Checkbox",
};

const PREFILL_KEYS = [
  { value: "", label: "None" },
  { value: "clientName", label: "Client Name" },
  { value: "propertyAddress", label: "Property Address" },
  { value: "rent", label: "Monthly Rent" },
  { value: "commissionPct", label: "Commission %" },
  { value: "moveInDate", label: "Move-in Date" },
  { value: "agentName", label: "Agent Name" },
  { value: "brokerageName", label: "Brokerage Name" },
];

// Slice 19-B2b: minimum field size in percent of page. 3% × 2% renders
// as ≈18 × 16px on a US Letter page — small enough for tight forms (DOS-1736
// has 8 fields close together) but big enough that a deliberately-shrunk
// field is still discoverable via its corner handles. Pixel-tap-target
// concerns evaporate because handles render whenever selectedFieldId === id.
const MIN_FIELD_WIDTH = 3;
const MIN_FIELD_HEIGHT = 2;

type ResizeCorner = "nw" | "ne" | "sw" | "se";

// ── Component ────────────────────────────────────────────────

export default function TemplateEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const sp = useSearchParams();
  const asOrg = sp.get("as_org") ?? undefined;
  const overrideOpts = useMemo(
    () => (asOrg ? { overrideAsOrg: asOrg } : {}),
    [asOrg],
  );
  const detailQs = asOrg ? `?as_org=${encodeURIComponent(asOrg)}` : "";
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const [template, setTemplate] = useState<TemplateData | null>(null);
  const [fields, setFields] = useState<TemplateFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [addingFieldType, setAddingFieldType] = useState<TemplateFieldType | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Slice 19-B1: pdfjs render path replaces the iframe (iOS Safari black
  // hole — same fix as slice 20-fixes-C for the public viewer).
  // Slice 19-B2a: multi-page navigation. The editor now renders one page
  // at a time, scoped via currentPage; new fields placed via the toolbar
  // get page: currentPage. Drag/resize is B2b.
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [renderProgress, setRenderProgress] = useState({ current: 0, total: 0 });
  const [currentPage, setCurrentPage] = useState(0);

  // Slice 19-B2b: drag + resize state. Each is independent — only one
  // of dragState/resizeState is non-null at a time because the pointer
  // is captured by exactly one element (field body OR resize handle).
  // Resize handles call e.stopPropagation() in their pointerDown so the
  // field's drag handler never fires when the user grabs a corner.
  const [dragState, setDragState] = useState<{
    fieldId: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [resizeState, setResizeState] = useState<{
    fieldId: string;
    corner: ResizeCorner;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  useEffect(() => {
    async function load() {
      const result = await getDocumentTemplates(overrideOpts);
      if (result.success && Array.isArray(result.data)) {
        const found = result.data.find((t: Record<string, unknown>) => t.id === id) as unknown as TemplateData | undefined;
        if (found) {
          setTemplate(found);
          setFields(Array.isArray(found.fields) ? found.fields : []);
        } else {
          setError("Template not found");
        }
      }
      setLoading(false);
    }
    load();
  }, [id, overrideOpts]);

  // Render PDF pages via pdfjs (slice 19-B1). Mirrors pdf-field-viewer.tsx
  // exactly so the public viewer and the editor share one rendering pattern.
  // Worker + cmaps are self-hosted under /public/pdfjs/ (slice 20-fixes-A);
  // no CDN dependency.
  const renderPdf = useCallback(async () => {
    if (!template?.templatePdfUrl) return;
    setPdfLoading(true);
    setPdfError(null);

    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

      const loadingTask = pdfjsLib.getDocument({
        url: template.templatePdfUrl,
        cMapUrl: "/pdfjs/cmaps/",
        cMapPacked: true,
      });

      const pdf = await loadingTask.promise;
      const rendered: RenderedPage[] = [];
      // Editor canvas is fixed at 612px wide (B2 will make this dynamic per
      // page). Render at 2x for retina sharpness.
      const containerWidth = 612;

      setRenderProgress({ current: 0, total: pdf.numPages });

      for (let i = 0; i < pdf.numPages; i++) {
        const page = await pdf.getPage(i + 1);
        const defaultViewport = page.getViewport({ scale: 1 });
        const scale = (containerWidth / defaultViewport.width) * 2;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;

        await page.render({ canvasContext: ctx, viewport }).promise;

        rendered.push({
          dataUrl: canvas.toDataURL("image/png"),
          width: viewport.width,
          height: viewport.height,
        });

        setRenderProgress({ current: i + 1, total: pdf.numPages });
      }

      setPages(rendered);
    } catch (err) {
      console.error("[VaultEditor] Failed to render PDF:", err);
      setPdfError("Failed to load PDF preview");
    } finally {
      setPdfLoading(false);
    }
  }, [template?.templatePdfUrl]);

  useEffect(() => {
    if (template?.templatePdfUrl) renderPdf();
  }, [template?.templatePdfUrl, renderPdf]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    const result = await updateTemplateFields(id, fields, overrideOpts);
    setSaving(false);
    if (result.success) {
      setSuccess("Fields saved");
      setHasChanges(false);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(result.error ?? "Failed to save");
    }
  }, [id, fields, overrideOpts]);

  const addField = useCallback((type: TemplateFieldType) => {
    const newField: TemplateFieldDefinition = {
      id: crypto.randomUUID().replace(/-/g, "").slice(0, 12),
      label: `${FIELD_TYPE_LABELS[type]} Field`,
      type,
      page: currentPage,
      x: 25,
      y: 50,
      width: type === "signature" ? 30 : type === "checkbox" ? 4 : 20,
      height: type === "signature" ? 8 : type === "checkbox" ? 4 : 5,
      required: type === "signature",
    };
    setFields((prev) => [...prev, newField]);
    setSelectedFieldId(newField.id);
    setAddingFieldType(null);
    setHasChanges(true);
  }, [currentPage]);

  const updateField = useCallback((fieldId: string, updates: Partial<TemplateFieldDefinition>) => {
    setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)));
    setHasChanges(true);
  }, []);

  const removeField = useCallback((fieldId: string) => {
    setFields((prev) => prev.filter((f) => f.id !== fieldId));
    if (selectedFieldId === fieldId) setSelectedFieldId(null);
    setHasChanges(true);
  }, [selectedFieldId]);

  const handlePdfClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!addingFieldType) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const newField: TemplateFieldDefinition = {
      id: crypto.randomUUID().replace(/-/g, "").slice(0, 12),
      label: `${FIELD_TYPE_LABELS[addingFieldType]} Field`,
      type: addingFieldType,
      page: currentPage,
      x: Math.max(0, Math.min(x, 90)),
      y: Math.max(0, Math.min(y, 95)),
      width: addingFieldType === "signature" ? 30 : addingFieldType === "checkbox" ? 4 : 20,
      height: addingFieldType === "signature" ? 8 : addingFieldType === "checkbox" ? 4 : 5,
      required: addingFieldType === "signature",
    };
    setFields((prev) => [...prev, newField]);
    setSelectedFieldId(newField.id);
    setAddingFieldType(null);
    setHasChanges(true);
  }, [addingFieldType, currentPage]);

  // ── Slice 19-B2b: drag-to-move ──────────────────────────────
  // Pointer Events API unifies mouse + touch + pen. setPointerCapture()
  // keeps events flowing to the original element even when the cursor
  // leaves the field, so a fast drag toward the canvas edge doesn't
  // drop frames. Boundary clamping uses percentage math (0..100), which
  // is page-size-agnostic — works for letter, legal, A4, landscape.

  const handleFieldPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, fieldId: string) => {
    if (addingFieldType) return; // placement mode wins; don't start a drag
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const field = fields.find((f) => f.id === fieldId);
    if (!field) return;
    setSelectedFieldId(fieldId);
    setDragState({
      fieldId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: field.x,
      origY: field.y,
    });
  }, [addingFieldType, fields]);

  const handleFieldPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;
    const rect = pdfContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dxPct = ((e.clientX - dragState.startClientX) / rect.width) * 100;
    const dyPct = ((e.clientY - dragState.startClientY) / rect.height) * 100;
    const field = fields.find((f) => f.id === dragState.fieldId);
    if (!field) return;
    // Clamp so the field stays fully on the page. Page-agnostic by
    // construction — percentages don't care about pixel dimensions.
    const newX = Math.max(0, Math.min(dragState.origX + dxPct, 100 - field.width));
    const newY = Math.max(0, Math.min(dragState.origY + dyPct, 100 - field.height));
    updateField(dragState.fieldId, { x: newX, y: newY });
  }, [dragState, fields, updateField]);

  const handleFieldPointerUp = useCallback(() => {
    setDragState(null);
  }, []);

  // ── Slice 19-B2b: 4-corner resize ───────────────────────────
  // Each corner anchors the OPPOSITE corner. nw-drag pins (origX+origW,
  // origY+origH); se-drag pins (origX, origY); etc. Min-size enforcement
  // keeps the anchored corner fixed when the dragged corner crosses it.
  // Page-bound clamps prevent off-page resize.

  const handleResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, fieldId: string, corner: ResizeCorner) => {
    e.stopPropagation(); // don't trigger field's drag handler
    e.currentTarget.setPointerCapture(e.pointerId);
    const field = fields.find((f) => f.id === fieldId);
    if (!field) return;
    setResizeState({
      fieldId,
      corner,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: field.x,
      origY: field.y,
      origW: field.width,
      origH: field.height,
    });
  }, [fields]);

  const handleResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeState) return;
    const rect = pdfContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dxPct = ((e.clientX - resizeState.startClientX) / rect.width) * 100;
    const dyPct = ((e.clientY - resizeState.startClientY) / rect.height) * 100;

    const { corner, origX, origY, origW, origH } = resizeState;
    let x = origX, y = origY, w = origW, h = origH;

    switch (corner) {
      case "se":
        // bottom-right: width grows right, height grows down (simplest)
        w = origW + dxPct;
        h = origH + dyPct;
        if (w < MIN_FIELD_WIDTH) w = MIN_FIELD_WIDTH;
        if (h < MIN_FIELD_HEIGHT) h = MIN_FIELD_HEIGHT;
        if (x + w > 100) w = 100 - x;
        if (y + h > 100) h = 100 - y;
        break;
      case "ne":
        // top-right: width grows right, top moves up
        w = origW + dxPct;
        y = origY + dyPct;
        h = origH - dyPct;
        if (w < MIN_FIELD_WIDTH) w = MIN_FIELD_WIDTH;
        if (h < MIN_FIELD_HEIGHT) {
          h = MIN_FIELD_HEIGHT;
          y = origY + origH - MIN_FIELD_HEIGHT; // bottom edge anchors
        }
        if (x + w > 100) w = 100 - x;
        if (y < 0) { h = h + y; y = 0; }
        break;
      case "sw":
        // bottom-left: left edge moves, height grows down
        x = origX + dxPct;
        w = origW - dxPct;
        h = origH + dyPct;
        if (w < MIN_FIELD_WIDTH) {
          w = MIN_FIELD_WIDTH;
          x = origX + origW - MIN_FIELD_WIDTH; // right edge anchors
        }
        if (h < MIN_FIELD_HEIGHT) h = MIN_FIELD_HEIGHT;
        if (x < 0) { w = w + x; x = 0; }
        if (y + h > 100) h = 100 - y;
        break;
      case "nw":
        // top-left: both edges move toward origin
        x = origX + dxPct;
        y = origY + dyPct;
        w = origW - dxPct;
        h = origH - dyPct;
        if (w < MIN_FIELD_WIDTH) {
          w = MIN_FIELD_WIDTH;
          x = origX + origW - MIN_FIELD_WIDTH;
        }
        if (h < MIN_FIELD_HEIGHT) {
          h = MIN_FIELD_HEIGHT;
          y = origY + origH - MIN_FIELD_HEIGHT;
        }
        if (x < 0) { w = w + x; x = 0; }
        if (y < 0) { h = h + y; y = 0; }
        break;
    }

    updateField(resizeState.fieldId, { x, y, width: w, height: h });
  }, [resizeState, updateField]);

  const handleResizePointerUp = useCallback(() => {
    setResizeState(null);
  }, []);

  if (loading) {
    return <div className="min-h-dvh bg-slate-50 flex items-center justify-center"><Loader2 className="w-6 h-6 text-blue-600 animate-spin" /></div>;
  }

  if (!template) {
    return (
      <div className="min-h-dvh bg-slate-50 flex flex-col items-center justify-center">
        <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
        <p className="text-slate-600">{error || "Template not found"}</p>
        <button onClick={() => router.back()} className="mt-4 text-sm text-blue-600">Go back</button>
      </div>
    );
  }

  const selectedField = fields.find((f) => f.id === selectedFieldId);

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push(`/brokerage/client-onboarding/vault${detailQs}`)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">{template.name}</h1>
              <p className="text-xs text-slate-500">{fields.length} field{fields.length !== 1 ? "s" : ""} defined</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {success && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" />{success}</span>}
            {error && <span className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{error}</span>}
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Fields
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: PDF Preview with field overlays */}
        <div className="flex-1 overflow-auto p-6 bg-slate-100">
          {/* Slice 19-B2a: page tab strip. Hidden on single-page templates
              to avoid clutter; shown when pages.length > 1. Lives outside
              the canvas div so tab clicks don't trigger handlePdfClick. */}
          {pages.length > 1 && (
            <div className="mx-auto mb-3 flex flex-wrap gap-1.5" style={{ maxWidth: pages[currentPage] ? `${pages[currentPage].width / 2}px` : "612px" }}>
              {pages.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCurrentPage(i)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    i === currentPage
                      ? "bg-blue-600 text-white"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  Page {i + 1}
                </button>
              ))}
            </div>
          )}
          <div
            ref={pdfContainerRef}
            className={`relative mx-auto bg-white shadow-lg rounded-sm overflow-hidden ${addingFieldType ? "cursor-crosshair" : ""}`}
            // Slice 19-B2a: variable per-page canvas size. Pages render at 2x
            // for retina (see renderPdf scale), so display at half. Falls
            // back to legacy 612x792 only during initial load before pages
            // are rendered.
            style={pages[currentPage]
              ? { width: `${pages[currentPage].width / 2}px`, minHeight: `${pages[currentPage].height / 2}px` }
              : { width: "612px", minHeight: "792px" }}
            onClick={handlePdfClick}
          >
            {/* PDF render via pdfjs (slice 19-B1). Replaces the iframe that
                broke silently on iOS Safari. Slice 19-B2a wires multi-page
                navigation: only the currentPage image renders, and the
                field-overlay filter below scopes to currentPage. Drag and
                resize on the rendered overlays is B2b. */}
            {pdfLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
                <div className="text-center">
                  <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-slate-500">
                    {renderProgress.total > 0
                      ? `Loading page ${renderProgress.current} of ${renderProgress.total}...`
                      : "Loading template..."}
                  </p>
                </div>
              </div>
            )}
            {pdfError && !pdfLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-50">
                <AlertTriangle className="w-8 h-8 text-amber-400" />
                <p className="text-sm text-slate-600">{pdfError}</p>
                <button
                  type="button"
                  onClick={() => renderPdf()}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
                >
                  Retry
                </button>
              </div>
            )}
            {!pdfLoading && !pdfError && pages[currentPage] && (
              <img
                src={pages[currentPage].dataUrl}
                alt={`Template page ${currentPage + 1}`}
                className="w-full block pointer-events-none"
                draggable={false}
              />
            )}
            {/* Field overlays — scoped to currentPage (slice 19-B2a).
                Slice 19-B2b: drag-to-move via Pointer Events; the onClick
                handler stays for keyboard a11y (Enter activates click)
                and is harmlessly redundant with onPointerDown's selection. */}
            {fields.filter((f) => f.page === currentPage).map((field) => (
              <div
                key={field.id}
                onClick={(e) => { e.stopPropagation(); setSelectedFieldId(field.id); }}
                onPointerDown={(e) => handleFieldPointerDown(e, field.id)}
                onPointerMove={handleFieldPointerMove}
                onPointerUp={handleFieldPointerUp}
                className={`absolute border-2 rounded-sm flex items-center justify-center text-[10px] font-medium cursor-move transition-colors ${
                  selectedFieldId === field.id
                    ? "border-blue-600 bg-blue-100/60 text-blue-700 z-10"
                    : "border-blue-400/50 bg-blue-50/40 text-blue-600 hover:border-blue-500"
                }`}
                style={{
                  left: `${field.x}%`,
                  top: `${field.y}%`,
                  width: `${field.width}%`,
                  height: `${field.height}%`,
                  // Slice 19-B2b: mandatory for iOS Safari — without it,
                  // a touch-drag gets interpreted as native scroll/pinch
                  // and our Pointer Events never fire.
                  touchAction: "none",
                }}
              >
                <span className="truncate px-1 pointer-events-none">{field.label}</span>
                {/* Slice 19-B2b: 4 corner resize handles, only on selected
                    field. Each anchors its opposite corner during resize.
                    stopPropagation in pointerDown so the field's drag
                    handler doesn't also fire. */}
                {selectedFieldId === field.id && (["nw", "ne", "sw", "se"] as const).map((corner) => {
                  const cornerPos: Record<ResizeCorner, React.CSSProperties> = {
                    nw: { left: "-6px", top: "-6px", cursor: "nw-resize" },
                    ne: { right: "-6px", top: "-6px", cursor: "ne-resize" },
                    sw: { left: "-6px", bottom: "-6px", cursor: "sw-resize" },
                    se: { right: "-6px", bottom: "-6px", cursor: "se-resize" },
                  };
                  return (
                    <div
                      key={corner}
                      onPointerDown={(e) => handleResizePointerDown(e, field.id, corner)}
                      onPointerMove={handleResizePointerMove}
                      onPointerUp={handleResizePointerUp}
                      className="absolute w-3 h-3 bg-blue-600 border-2 border-white rounded-sm z-20"
                      style={{ ...cornerPos[corner], touchAction: "none" }}
                    />
                  );
                })}
              </div>
            ))}
            {/* Placement hint */}
            {addingFieldType && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg">
                  Click to place {FIELD_TYPE_LABELS[addingFieldType]} field
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Field list + editor */}
        <div className="w-80 bg-white border-l border-slate-200 flex flex-col overflow-hidden flex-shrink-0">
          {/* Add field toolbar */}
          <div className="p-4 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Add Field</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(FIELD_TYPE_LABELS) as TemplateFieldType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setAddingFieldType(addingFieldType === type ? null : type)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    addingFieldType === type
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {FIELD_TYPE_ICONS[type]}
                  {FIELD_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          {/* Field list */}
          <div className="flex-1 overflow-auto">
            {fields.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">
                No fields yet. Click a field type above, then click on the PDF to place it.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {fields.map((field) => (
                  <button
                    key={field.id}
                    onClick={() => setSelectedFieldId(field.id === selectedFieldId ? null : field.id)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-2 transition-colors ${
                      selectedFieldId === field.id ? "bg-blue-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="text-slate-400">{FIELD_TYPE_ICONS[field.type]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700 truncate">{field.label}</div>
                      <div className="text-xs text-slate-400">{FIELD_TYPE_LABELS[field.type]} · Page {field.page + 1}</div>
                    </div>
                    {field.required && <span className="text-[10px] text-red-500 font-medium">REQ</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected field editor */}
          {selectedField && (
            <div className="border-t border-slate-200 p-4 space-y-3 bg-slate-50">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Edit Field</p>
                <button onClick={() => removeField(selectedField.id)} className="text-red-500 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Label</label>
                <input type="text" value={selectedField.label} onChange={(e) => updateField(selectedField.id, { label: e.target.value })} className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                  <select value={selectedField.type} onChange={(e) => updateField(selectedField.id, { type: e.target.value as TemplateFieldType })} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {(Object.keys(FIELD_TYPE_LABELS) as TemplateFieldType[]).map((t) => (
                      <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Prefill</label>
                  <select value={selectedField.prefillKey || ""} onChange={(e) => updateField(selectedField.id, { prefillKey: e.target.value || undefined })} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {PREFILL_KEYS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </div>
              </div>
              {/* Slice 19-B2a: Page selector. Lets the user reassign a field
                  to a different page without delete + re-place. Hidden on
                  single-page templates to avoid a no-op control. Companion
                  to the page-tab strip on the canvas; switching the page
                  here moves the field's overlay to that page. */}
              {pages.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Page</label>
                  <select
                    value={selectedField.page}
                    onChange={(e) => updateField(selectedField.id, { page: parseInt(e.target.value, 10) })}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {pages.map((_, i) => (
                      <option key={i} value={i}>Page {i + 1}</option>
                    ))}
                  </select>
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={selectedField.required} onChange={(e) => updateField(selectedField.id, { required: e.target.checked })} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-xs text-slate-600">Required field</span>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
