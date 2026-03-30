"use client";

import { useState, useEffect, useRef } from "react";
import { FileText, Download, Eye } from "lucide-react";

interface Props {
  pdfUrl: string;
  title: string;
  onViewed?: () => void;
}

const VIEW_DELAY_MS = 3000; // 3 seconds before considered "viewed"

export default function PdfViewer({ pdfUrl, title, onViewed }: Props) {
  const [viewed, setViewed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track viewing — mark as viewed after the PDF has been visible for VIEW_DELAY_MS
  useEffect(() => {
    if (viewed || !pdfUrl) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timerRef.current = setTimeout(() => {
            setViewed(true);
            onViewed?.();
          }, VIEW_DELAY_MS);
        } else {
          if (timerRef.current) clearTimeout(timerRef.current);
        }
      },
      { threshold: 0.5 },
    );

    const el = containerRef.current;
    if (el) observer.observe(el);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (el) observer.unobserve(el);
    };
  }, [pdfUrl, viewed, onViewed]);

  return (
    <div ref={containerRef} className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {viewed && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600">
              <Eye className="w-3 h-3" />
              Reviewed
            </span>
          )}
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Download className="w-3 h-3" />
            Download PDF
          </a>
        </div>
      </div>

      {/* PDF embed */}
      <div className="relative rounded-lg border border-slate-200 shadow-sm overflow-hidden bg-slate-100">
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-slate-500">Loading document...</p>
            </div>
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <FileText className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-sm text-slate-500 mb-2">Unable to display PDF inline</p>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Open PDF in New Tab
            </a>
          </div>
        )}
        {!error && (
          <iframe
            src={`${pdfUrl}#toolbar=0&navpanes=0`}
            title={title}
            className="w-full border-0"
            style={{ height: "650px" }}
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError(true);
            }}
          />
        )}
      </div>

      {/* Viewing hint */}
      {!viewed && !error && (
        <p className="text-center text-xs text-slate-400">
          Please review this document before signing
        </p>
      )}
    </div>
  );
}
