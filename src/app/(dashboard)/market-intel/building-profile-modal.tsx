"use client";

import { useRef, useState, useEffect } from "react";
import { fmtPhone } from "./sections/format-utils";

interface ProfileModalProps {
  address: string;
  borough: string;
  primaryPhone?: string | null;
  onClose: () => void;
  onCallClick?: () => void;
  onSmsClick?: (phone: string) => void;
  children: React.ReactNode;
}

export default function ProfileModal({
  address,
  borough,
  primaryPhone,
  onClose,
  onSmsClick,
  children,
}: ProfileModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // IntersectionObserver to detect when user scrolls past top area
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

  return (
    <div className="fixed inset-0 z-[2000] flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative ml-auto w-full md:max-w-3xl bg-white shadow-2xl overflow-y-auto max-md:mt-16 max-md:rounded-t-2xl">
        {/* Sticky header */}
        <div
          className={`sticky top-0 z-10 bg-white border-b border-slate-200 px-4 md:px-5 py-3 flex items-center justify-between transition-shadow duration-200 ${
            scrolled ? "shadow-sm" : ""
          }`}
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-slate-900 truncate">
              {address}
            </h2>
            <p className="text-xs text-slate-500">{borough}</p>
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            {primaryPhone && scrolled && (
              <a
                href={`tel:${primaryPhone}`}
                className="hidden md:flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors animate-fade-in-fast"
              >
                📞 {fmtPhone(primaryPhone)}
              </a>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 text-lg"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Scroll sentinel — placed near top for IntersectionObserver */}
        <div ref={sentinelRef} className="h-px" />

        {/* Content */}
        <div ref={scrollRef} className="p-4 md:p-5">
          {children}
        </div>

        {/* Mobile sticky footer — call bar */}
        {primaryPhone && (
          <div className="md:hidden sticky bottom-0 bg-white border-t border-slate-200 px-4 py-3 flex items-center gap-2 pb-safe">
            <a
              href={`tel:${primaryPhone}`}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors text-center"
            >
              📞 Call Owner
            </a>
            {onSmsClick && (
              <button
                onClick={() => onSmsClick(primaryPhone)}
                className="py-3 px-4 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-bold rounded-xl transition-colors"
              >
                💬 SMS
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
