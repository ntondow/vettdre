"use client";

import { useRef, useState, useEffect } from "react";
import { X, Maximize2, Minimize2, Phone } from "lucide-react";

// ── Types ────────────────────────────────────────────────────

export interface ProfilePanelProps {
  address: string;
  borough: string;
  primaryPhone?: string | null;
  expanded?: boolean;
  onClose: () => void;
  onToggleExpand?: () => void;
  children: React.ReactNode;
}

// ── Helpers ──────────────────────────────────────────────────

function fmtPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === "1") return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return raw;
}

// ── Component ────────────────────────────────────────────────

export default function ProfilePanel({
  address,
  borough,
  primaryPhone,
  expanded,
  onClose,
  onToggleExpand,
  children,
}: ProfilePanelProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // Detect scroll to show compact sticky header
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Escape to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Sticky header */}
      <div
        className={`flex-shrink-0 sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between transition-shadow duration-200 ${
          scrolled ? "shadow-sm" : ""
        }`}
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-slate-900 truncate">{address}</h2>
          <p className="text-[11px] text-slate-500">{borough}</p>
        </div>
        <div className="flex items-center gap-1.5 ml-3 shrink-0">
          {/* Phone quick-dial when scrolled */}
          {primaryPhone && scrolled && (
            <a
              href={`tel:${primaryPhone}`}
              className="hidden md:flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-colors"
            >
              <Phone className="w-3 h-3" />
              {fmtPhone(primaryPhone)}
            </a>
          )}
          {/* Expand / collapse toggle */}
          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              title={expanded ? "Collapse panel" : "Expand panel"}
            >
              {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
          {/* Close */}
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scroll sentinel */}
      <div ref={sentinelRef} className="h-px flex-shrink-0" />

      {/* Content — scrollable */}
      <div className="flex-1 overflow-y-auto p-4">
        {children}
      </div>

      {/* Mobile footer — call bar */}
      {primaryPhone && (
        <div className="md:hidden flex-shrink-0 bg-white border-t border-slate-200 px-4 py-3 flex items-center gap-2 pb-safe">
          <a
            href={`tel:${primaryPhone}`}
            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors text-center"
          >
            Call Owner
          </a>
        </div>
      )}
    </div>
  );
}
