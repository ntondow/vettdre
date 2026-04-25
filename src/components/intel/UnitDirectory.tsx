"use client";

import { useState, useEffect, useCallback } from "react";
import { FixedSizeList } from "react-window";
import { Home, MapPin, DollarSign } from "lucide-react";
import { intelApi } from "@/lib/intel-api-client";
import type { IntelUnit } from "@/lib/intel-api-types";

interface Props {
  bbl: string;
  height?: number;
}

type FilterType = "all" | "investor_only" | "primary_only";

export default function UnitDirectory({ bbl, height = 400 }: Props) {
  const [units, setUnits] = useState<IntelUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [totalCount, setTotalCount] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchUnits = useCallback(async (append = false) => {
    setLoading(true);
    const result = await intelApi.getUnits(bbl, {
      limit: 100,
      filter,
      cursor: append ? cursor || undefined : undefined,
    });
    if (result) {
      setUnits(prev => append ? [...prev, ...result.units] : result.units);
      setTotalCount(result.totalCount);
      setCursor(result.nextCursor);
      setHasMore(result.nextCursor !== null);
    }
    setLoading(false);
  }, [bbl, filter, cursor]);

  useEffect(() => {
    setCursor(null);
    fetchUnits(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bbl, filter]);

  const ROW_HEIGHT = 56;

  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const unit = units[index];
    if (!unit) return null;

    return (
      <div
        style={style}
        className={`flex items-center gap-3 px-3 border-b border-slate-100 hover:bg-slate-50 ${
          index % 2 === 0 ? "bg-white" : "bg-slate-50/30"
        }`}
      >
        {/* Unit number */}
        <div className="w-14 shrink-0">
          <span className="text-xs font-mono font-semibold text-slate-900">
            {unit.unitNumber || "—"}
          </span>
        </div>

        {/* Owner name */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-800 truncate">{unit.currentOwnerName || "Unknown"}</p>
          {unit.mailingAddress && (
            <p className="text-[10px] text-slate-400 truncate flex items-center gap-0.5">
              <MapPin size={8} />
              {unit.mailingAddress}
            </p>
          )}
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1 shrink-0">
          {unit.primaryResidence && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
              <Home size={8} className="inline mr-0.5" />Primary
            </span>
          )}
          {unit.investorBadge && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Investor
            </span>
          )}
        </div>

        {/* Last sale */}
        <div className="w-20 shrink-0 text-right">
          {unit.lastSalePrice ? (
            <span className="text-[10px] font-mono text-slate-600">
              <DollarSign size={8} className="inline" />
              {unit.lastSalePrice >= 1_000_000
                ? `${(unit.lastSalePrice / 1_000_000).toFixed(1)}M`
                : `${Math.round(unit.lastSalePrice / 1000)}K`}
            </span>
          ) : (
            <span className="text-[10px] text-slate-300">—</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Filter pills */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-200">
        {(["all", "investor_only", "primary_only"] as FilterType[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors ${
              filter === f
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {f === "all" ? `All (${totalCount})` : f === "investor_only" ? "Investors" : "Primary Res."}
          </button>
        ))}
      </div>

      {/* Virtualized list */}
      {loading ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      ) : units.length === 0 ? (
        <div className="px-3 py-8 text-center text-sm text-slate-400">
          {filter !== "all" ? "No units match this filter" : "Unit data not available for this building"}
        </div>
      ) : (
        <>
          {/* Header row */}
          <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-[9px] uppercase tracking-wider text-slate-400 font-semibold">
            <div className="w-14 shrink-0">Unit</div>
            <div className="flex-1">Owner</div>
            <div className="w-20 shrink-0">Status</div>
            <div className="w-20 shrink-0 text-right">Last Sale</div>
          </div>
          <FixedSizeList
            height={Math.min(height, units.length * ROW_HEIGHT)}
            itemCount={units.length}
            itemSize={ROW_HEIGHT}
            width="100%"
          >
            {Row}
          </FixedSizeList>
          {hasMore && (
            <button
              onClick={() => fetchUnits(true)}
              className="w-full py-2 text-xs text-blue-600 hover:text-blue-800 text-center border-t border-slate-100"
            >
              Load more units...
            </button>
          )}
        </>
      )}
    </div>
  );
}
