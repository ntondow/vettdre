"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Lock, PenTool, Type, Calendar, CheckSquare, Hash } from "lucide-react";
import type { TemplateFieldDefinition } from "@/lib/onboarding-types";

interface Props {
  pdfUrl: string;
  fields: TemplateFieldDefinition[];
  fieldValues: Record<string, string>;
  selectedFieldId?: string | null;
  onFieldClick?: (fieldId: string) => void;
}

interface RenderedPage {
  dataUrl: string;
  width: number;
  height: number;
}

const FIELD_ICONS: Record<string, React.ReactNode> = {
  text: <Type className="w-2.5 h-2.5" />,
  date: <Calendar className="w-2.5 h-2.5" />,
  signature: <PenTool className="w-2.5 h-2.5" />,
  initials: <Hash className="w-2.5 h-2.5" />,
  checkbox: <CheckSquare className="w-2.5 h-2.5" />,
};

export default function PdfFieldViewer({
  pdfUrl,
  fields,
  fieldValues,
  selectedFieldId,
  onFieldClick,
}: Props) {
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine total pages needed (at least 1, max from field page refs + 1)
  const totalPages = useMemo(() => {
    if (!fields.length) return 1;
    const maxPage = Math.max(...fields.map((f) => f.page));
    return Math.max(maxPage + 1, 1);
  }, [fields]);

  // Group fields by page
  const fieldsByPage = useMemo(() => {
    const grouped: Record<number, TemplateFieldDefinition[]> = {};
    for (const f of fields) {
      if (!grouped[f.page]) grouped[f.page] = [];
      grouped[f.page].push(f);
    }
    return grouped;
  }, [fields]);

  // Render PDF pages to canvas images using pdf.js
  const renderPdf = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Dynamic import to avoid SSR issues
      const pdfjsLib = await import("pdfjs-dist");

      // Use CDN worker to avoid Next.js bundling issues
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

      const loadingTask = pdfjsLib.getDocument({
        url: pdfUrl,
        cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/",
        cMapPacked: true,
      });

      const pdf = await loadingTask.promise;
      const pagesToRender = Math.min(pdf.numPages, totalPages);
      const rendered: RenderedPage[] = [];

      // Get container width to determine render scale
      const containerWidth = containerRef.current?.clientWidth ?? 612;

      for (let i = 0; i < pagesToRender; i++) {
        const page = await pdf.getPage(i + 1);
        const defaultViewport = page.getViewport({ scale: 1 });

        // Scale to fit the container width (renders crisply at 2x for retina)
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
      }

      setPages(rendered);
    } catch (err) {
      console.error("[PdfFieldViewer] Failed to render PDF:", err);
      setError("Failed to load PDF preview");
    } finally {
      setLoading(false);
    }
  }, [pdfUrl, totalPages]);

  useEffect(() => {
    renderPdf();
  }, [renderPdf]);

  if (loading) {
    return (
      <div ref={containerRef} className="bg-white shadow-lg rounded-sm overflow-hidden" style={{ width: "100%", maxWidth: "612px" }}>
        <div className="flex items-center justify-center py-32 text-sm text-slate-400">
          <div className="animate-pulse">Loading preview...</div>
        </div>
      </div>
    );
  }

  if (error || !pages.length) {
    return (
      <div ref={containerRef} className="bg-white shadow-lg rounded-sm overflow-hidden" style={{ width: "100%", maxWidth: "612px" }}>
        <div className="flex items-center justify-center py-32 text-sm text-slate-400">
          {error || "No pages to display"}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="bg-white shadow-lg rounded-sm overflow-hidden" style={{ width: "100%", maxWidth: "612px" }}>
      {pages.map((page, pageIndex) => (
        <div key={pageIndex} className="relative">
          {/* Rendered PDF page as image — width:100% makes height auto-proportional */}
          <img
            src={page.dataUrl}
            alt={`Page ${pageIndex + 1}`}
            className="w-full block"
            draggable={false}
          />

          {/* Field overlays — percentage positions now match the image exactly */}
          {(fieldsByPage[pageIndex] || []).map((field) => {
            const value = fieldValues[field.id];
            const hasValue = !!value;
            const isPrefilled = !!field.prefillKey && hasValue;
            const isSignature = field.type === "signature" || field.type === "initials";
            const isSelected = selectedFieldId === field.id;

            return (
              <div
                key={field.id}
                onClick={() => onFieldClick?.(field.id)}
                className={`absolute rounded-sm cursor-pointer transition-all text-[9px] overflow-hidden ${
                  isSelected
                    ? "ring-2 ring-blue-600 z-20"
                    : isPrefilled
                      ? "border border-green-400 bg-green-50/50"
                      : hasValue
                        ? "border border-blue-400 bg-blue-50/40"
                        : field.required
                          ? "border border-red-300 bg-red-50/30"
                          : "border border-slate-300 bg-slate-50/30"
                }`}
                style={{
                  left: `${field.x}%`,
                  top: `${field.y}%`,
                  width: `${field.width}%`,
                  height: `${field.height}%`,
                }}
              >
                {isSignature && value ? (
                  <img src={value} alt="Signature" className="w-full h-full object-contain" />
                ) : hasValue ? (
                  <span className="px-1 text-slate-700 truncate block leading-tight" style={{ fontSize: "9px" }}>{value}</span>
                ) : (
                  <span className="px-1 text-slate-400 flex items-center gap-0.5 leading-tight">
                    {FIELD_ICONS[field.type]}
                    <span className="truncate">{field.label}</span>
                    {isPrefilled && <Lock className="w-2 h-2 ml-auto flex-shrink-0" />}
                  </span>
                )}
              </div>
            );
          })}

          {/* Page separator line */}
          {pageIndex < pages.length - 1 && (
            <div className="absolute bottom-0 left-0 right-0 h-px bg-slate-200" />
          )}
        </div>
      ))}
    </div>
  );
}
