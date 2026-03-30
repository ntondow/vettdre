"use client";

import { useMemo } from "react";
import { Lock, PenTool, Type, Calendar, CheckSquare, Hash } from "lucide-react";
import type { TemplateFieldDefinition } from "@/lib/onboarding-types";

interface Props {
  pdfUrl: string;
  fields: TemplateFieldDefinition[];
  fieldValues: Record<string, string>;
  selectedFieldId?: string | null;
  onFieldClick?: (fieldId: string) => void;
}

const PAGE_HEIGHT = 792; // US Letter height in CSS px at 72 DPI

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

  return (
    <div className="bg-white shadow-lg rounded-sm overflow-hidden" style={{ width: "100%", maxWidth: "612px" }}>
      {/* Render a page container per page — each with its own iframe slice + overlays */}
      {Array.from({ length: totalPages }, (_, pageIndex) => (
        <div key={pageIndex} className="relative" style={{ height: `${PAGE_HEIGHT}px` }}>
          {/* PDF iframe — offset to show the correct page */}
          <iframe
            src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&page=${pageIndex + 1}`}
            className="w-full border-0 pointer-events-none absolute inset-0"
            style={{
              height: `${PAGE_HEIGHT * totalPages}px`,
              marginTop: `-${pageIndex * PAGE_HEIGHT}px`,
              clipPath: `inset(${pageIndex * PAGE_HEIGHT}px 0 ${(totalPages - pageIndex - 1) * PAGE_HEIGHT}px 0)`,
            }}
            title={`Document Page ${pageIndex + 1}`}
          />

          {/* Field overlays for this page */}
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
          {pageIndex < totalPages - 1 && (
            <div className="absolute bottom-0 left-0 right-0 h-px bg-slate-200" />
          )}
        </div>
      ))}
    </div>
  );
}
