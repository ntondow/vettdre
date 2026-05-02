"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { FileText, Download, Eye } from "lucide-react";

interface Props {
  pdfUrl: string;
  title: string;
  onViewed?: () => void;
}

interface RenderedPage {
  dataUrl: string;
  width: number;
  height: number;
}

const VIEW_DELAY_MS = 3000; // 3 seconds before considered "viewed"

// Render legacy (non-template) PDF docs via pdfjs (#9). Replaces the
// previous `<iframe>`-based viewer that was unreliable on iOS Safari —
// the iframe would silently fail to display PDF content but still fire
// onLoad, so the IntersectionObserver-based "viewed" tracker would mark
// the doc as reviewed even when nothing was actually visible. Now we
// render PDF pages to images via the same self-hosted pdfjs path that
// pdf-field-viewer.tsx uses (proven to work on iOS for templates).
export default function PdfViewer({ pdfUrl, title, onViewed }: Props) {
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [viewed, setViewed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Per-page render progress (#20) for the loading UI on slow mobile.
  const [renderProgress, setRenderProgress] = useState({ current: 0, total: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Render PDF pages to images via pdfjs. Self-hosted worker + cmaps
  // (slice 20-fixes-A); no external CDN dependency.
  const renderPdf = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

      const loadingTask = pdfjsLib.getDocument({
        url: pdfUrl,
        cMapUrl: "/pdfjs/cmaps/",
        cMapPacked: true,
      });

      const pdf = await loadingTask.promise;
      const rendered: RenderedPage[] = [];
      const containerWidth = containerRef.current?.clientWidth ?? 612;

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
      console.error("[PdfViewer] Failed to render PDF:", err);
      setError("Failed to load PDF preview");
    } finally {
      setLoading(false);
    }
  }, [pdfUrl]);

  useEffect(() => {
    renderPdf();
  }, [renderPdf]);

  // Track viewing — mark as viewed after the rendered pages are visible
  // for VIEW_DELAY_MS. Anchored to the rendered images container, not the
  // iframe wrapper, so the badge only fires when actual content is on screen.
  useEffect(() => {
    if (viewed || loading || error || !pages.length) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timerRef.current = setTimeout(() => {
            setViewed(true);
            onViewed?.();
          }, VIEW_DELAY_MS);
        } else if (timerRef.current) {
          clearTimeout(timerRef.current);
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
  }, [viewed, loading, error, pages.length, onViewed]);

  return (
    <div className="space-y-3">
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

      {/* PDF render */}
      <div
        ref={containerRef}
        className="relative rounded-lg border border-slate-200 shadow-sm overflow-hidden bg-white"
      >
        {loading && !error && (
          <div className="flex items-center justify-center py-24 sm:py-32">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              {/* #20 — per-page progress so slow mobile users see motion. */}
              <p className="text-sm text-slate-500">
                {renderProgress.total > 0
                  ? `Loading page ${renderProgress.current} of ${renderProgress.total}...`
                  : "Loading document..."}
              </p>
            </div>
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center py-16 px-4 gap-3">
            <FileText className="w-10 h-10 text-slate-300 mb-1" />
            <p className="text-sm text-slate-500">Unable to display PDF inline</p>
            <div className="flex items-center gap-2">
              {/* #21 — retry button so a transient blip doesn't strand the user. */}
              <button
                type="button"
                onClick={() => renderPdf()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Retry
              </button>
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
          </div>
        )}
        {!loading && !error && pages.length > 0 && (
          <div>
            {pages.map((page, pageIndex) => (
              <img
                key={pageIndex}
                src={page.dataUrl}
                alt={`Page ${pageIndex + 1}`}
                className="w-full block"
                draggable={false}
              />
            ))}
          </div>
        )}
      </div>

      {/* Viewing hint */}
      {!viewed && !error && !loading && (
        <p className="text-center text-xs text-slate-400">
          Please review this document before signing
        </p>
      )}
    </div>
  );
}
