"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowRight, ChevronDown, Plus, Loader2 } from "lucide-react";
import { getDealAnalyses } from "@/app/(dashboard)/deals/actions";

interface ApplyToDealButtonProps {
  /** Called when user selects a deal to apply research to */
  onApply: (dealId: string, dealName: string) => void;
  disabled?: boolean;
}

interface DealOption {
  id: string;
  name: string;
  address: string | null;
  borough: string | null;
}

export default function ApplyToDealButton({ onApply, disabled }: ApplyToDealButtonProps) {
  const [open, setOpen] = useState(false);
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load deals on first open
  useEffect(() => {
    if (open && !loaded) {
      setLoading(true);
      getDealAnalyses()
        .then((data) => {
          setDeals(
            data.map((d) => ({
              id: d.id,
              name: d.name || "Untitled",
              address: d.address ?? null,
              borough: d.borough ?? null,
            }))
          );
          setLoaded(true);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open, loaded]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
      >
        <ArrowRight className="w-4 h-4" />
        Apply to Deal
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-72 bg-[#161B2E] border border-white/10 rounded-xl shadow-xl z-50 max-h-64 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
            </div>
          )}
          {!loading && deals.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-slate-500">
              No saved deals yet
            </div>
          )}
          {!loading &&
            deals.map((deal) => (
              <button
                key={deal.id}
                onClick={() => {
                  onApply(deal.id, deal.name);
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0"
              >
                <p className="text-sm font-medium text-white truncate">{deal.name}</p>
                {deal.address && (
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {deal.address}{deal.borough ? `, ${deal.borough}` : ""}
                  </p>
                )}
              </button>
            ))}
          <button
            onClick={() => {
              onApply("new", "New Deal");
              setOpen(false);
            }}
            className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-t border-white/10"
          >
            <div className="flex items-center gap-2 text-blue-400 text-sm font-medium">
              <Plus className="w-4 h-4" />
              Create New Deal
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
