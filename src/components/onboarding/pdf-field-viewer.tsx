"use client";

import { useRef } from "react";
import { Lock, PenTool, Type, Calendar, CheckSquare, Hash } from "lucide-react";
import type { TemplateFieldDefinition } from "@/lib/onboarding-types";

interface Props {
  pdfUrl: string;
  fields: TemplateFieldDefinition[];
  fieldValues: Record<string, string>;
  selectedFieldId?: string | null;
  onFieldClick?: (fieldId: string) => void;
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
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="relative bg-white shadow-lg rounded-sm overflow-hidden" style={{ width: "100%", maxWidth: "612px" }}>
      {/* PDF embed */}
      <iframe
        src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`}
        className="w-full border-0 pointer-events-none"
        style={{ height: "792px" }}
        title="Document Preview"
      />

      {/* Field overlays */}
      {fields.filter((f) => f.page === 0).map((field) => {
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
    </div>
  );
}
