"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import {
  Building2,
  Search,
  X,
  SlidersHorizontal,
  ArrowUpDown,
  ExternalLink,
  MapPin,
  FileText,
  CalendarDays,
  Users,
  TrendingUp,
  DollarSign,
  Home,
} from "lucide-react";
import { getUnifiedProperties, getPropertiesStats } from "./actions";
import type { UnifiedProperty, PropertiesStats, PropertySource } from "./types";

// ── Constants ────────────────────────────────────────────────

const SOURCE_BADGES: Record<
  PropertySource,
  { label: string; classes: string; icon: typeof Building2 }
> = {
  listing: {
    label: "Listing",
    classes: "bg-emerald-500/15 text-emerald-400",
    icon: Home,
  },
  deal: {
    label: "Deal",
    classes: "bg-blue-500/15 text-blue-400",
    icon: FileText,
  },
  showing: {
    label: "Showing",
    classes: "bg-amber-500/15 text-amber-400",
    icon: CalendarDays,
  },
  prospect: {
    label: "Prospect",
    classes: "bg-purple-500/15 text-purple-400",
    icon: MapPin,
  },
};

const SORT_OPTIONS = [
  { value: "recent", label: "Recently Added" },
  { value: "price", label: "Price" },
  { value: "dom", label: "Days on Market" },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]["value"];

// ── Helpers ──────────────────────────────────────────────────

function fmtPrice(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtNumber(n: number): string {
  return n.toLocaleString();
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// ── Main Component ───────────────────────────────────────────

export default function PropertiesPage() {
  const [properties, setProperties] = useState<UnifiedProperty[]>([]);
  const [stats, setStats] = useState<PropertiesStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [sourceFilter, setSourceFilter] = useState<PropertySource | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [showSort, setShowSort] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Load Data ──────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [props, st] = await Promise.all([
        getUnifiedProperties(),
        getPropertiesStats(),
      ]);
      setProperties(props);
      setStats(st);
    } catch {
      // Auth error — empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Search Debounce ────────────────────────────────────────

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  // ── Client-side Filtering & Sorting ────────────────────────

  const filtered = useMemo(() => {
    let result = [...properties];

    // Source filter
    if (sourceFilter !== "all") {
      result = result.filter((p) => p.source === sourceFilter);
    }

    // Search
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (p) =>
          p.address.toLowerCase().includes(q) ||
          p.unit?.toLowerCase().includes(q) ||
          p.city?.toLowerCase().includes(q) ||
          p.agentName?.toLowerCase().includes(q) ||
          p.ownerName?.toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === "recent") {
        return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
      }
      if (sortBy === "price") {
        return (b.price || b.rent || 0) - (a.price || a.rent || 0);
      }
      if (sortBy === "dom") {
        return (b.daysOnMarket ?? -1) - (a.daysOnMarket ?? -1);
      }
      return 0;
    });

    return result;
  }, [properties, sourceFilter, debouncedSearch, sortBy]);

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-5 max-w-7xl mx-auto">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">My Properties</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {loading
              ? "Loading..."
              : `${filtered.length} propert${filtered.length === 1 ? "y" : "ies"} across all sources`}
          </p>
        </div>
      </div>

      {/* ── Stats Bar ───────────────────────────────────────── */}
      {!loading && stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard
            icon={<Building2 className="h-4 w-4" />}
            label="Total"
            value={stats.total}
            color="text-white"
          />
          <StatCard
            icon={<Home className="h-4 w-4" />}
            label="Listings"
            value={stats.listings}
            color="text-emerald-400"
            active={sourceFilter === "listing"}
            onClick={() =>
              setSourceFilter(sourceFilter === "listing" ? "all" : "listing")
            }
          />
          <StatCard
            icon={<FileText className="h-4 w-4" />}
            label="Deals"
            value={stats.deals}
            color="text-blue-400"
            active={sourceFilter === "deal"}
            onClick={() =>
              setSourceFilter(sourceFilter === "deal" ? "all" : "deal")
            }
          />
          <StatCard
            icon={<CalendarDays className="h-4 w-4" />}
            label="Showings"
            value={stats.showings}
            color="text-amber-400"
            active={sourceFilter === "showing"}
            onClick={() =>
              setSourceFilter(sourceFilter === "showing" ? "all" : "showing")
            }
          />
          <StatCard
            icon={<MapPin className="h-4 w-4" />}
            label="Prospects"
            value={stats.prospects}
            color="text-purple-400"
            active={sourceFilter === "prospect"}
            onClick={() =>
              setSourceFilter(sourceFilter === "prospect" ? "all" : "prospect")
            }
          />
        </div>
      )}

      {/* ── Filter Bar ──────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search address, city, agent, owner..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-9 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-slate-600 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Source pills (desktop) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {(["all", "listing", "deal", "showing", "prospect"] as const).map(
            (src) => (
              <button
                key={src}
                onClick={() => setSourceFilter(src)}
                className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  sourceFilter === src
                    ? "bg-blue-600 text-white"
                    : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                {src === "all" ? "All" : SOURCE_BADGES[src].label}
              </button>
            )
          )}
        </div>

        {/* Sort */}
        <div className="relative">
          <button
            onClick={() => setShowSort(!showSort)}
            className="flex items-center gap-2 px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-400 hover:text-white hover:border-slate-600 transition-colors whitespace-nowrap"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {SORT_OPTIONS.find((o) => o.value === sortBy)?.label}
          </button>
          {showSort && (
            <div className="absolute right-0 mt-1 z-20 bg-slate-900 border border-slate-700 rounded-lg shadow-xl py-1 min-w-[160px]">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setSortBy(opt.value);
                    setShowSort(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                    sortBy === opt.value
                      ? "text-blue-400 bg-blue-500/10"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Loading Skeleton ────────────────────────────────── */}
      {loading && <PropertyGridSkeleton />}

      {/* ── Property Grid ───────────────────────────────────── */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((prop) => (
            <PropertyCard key={prop.id} property={prop} />
          ))}
        </div>
      )}

      {/* ── Empty State ─────────────────────────────────────── */}
      {!loading && filtered.length === 0 && (
        <div className="bg-slate-900 rounded-xl p-12 text-center">
          <Building2 className="h-10 w-10 text-slate-600 mx-auto mb-4" />
          {properties.length === 0 ? (
            <>
              <h3 className="text-sm font-medium text-slate-300 mb-2">
                No properties yet
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-6">
                Properties will appear here as you create BMS listings, add deals
                to your pipeline, schedule showings, or save prospects from Market
                Intel.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Link
                  href="/brokerage/listings"
                  className="px-4 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-500 transition-colors"
                >
                  Create Listing
                </Link>
                <Link
                  href="/market-intel"
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Search Market Intel
                </Link>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-sm font-medium text-slate-300 mb-2">
                No matching properties
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Try adjusting your filters or search query.
              </p>
              <button
                onClick={() => {
                  setSourceFilter("all");
                  setSearch("");
                }}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs rounded-lg hover:bg-slate-700 transition-colors"
              >
                Clear Filters
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stat Card ────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={`bg-slate-900 rounded-xl px-4 py-3 flex items-center gap-3 transition-all ${
        active
          ? "ring-1 ring-blue-500/50 bg-blue-500/5"
          : onClick
            ? "hover:bg-slate-800 cursor-pointer"
            : ""
      }`}
    >
      <div className={color}>{icon}</div>
      <div className="text-left">
        <div className="text-lg font-semibold text-white tabular-nums">
          {fmtNumber(value)}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500">
          {label}
        </div>
      </div>
    </Wrapper>
  );
}

// ── Property Card ────────────────────────────────────────────

function PropertyCard({ property: p }: { property: UnifiedProperty }) {
  const badge = SOURCE_BADGES[p.source];
  const BadgeIcon = badge.icon;

  const priceDisplay = p.rent
    ? `$${fmtNumber(p.rent)}/mo`
    : p.price
      ? fmtPrice(p.price)
      : p.assessedValue
        ? `${fmtPrice(p.assessedValue)} assessed`
        : null;

  const specs: string[] = [];
  if (p.bedrooms != null) specs.push(`${p.bedrooms}BR`);
  if (p.bathrooms != null) specs.push(`${p.bathrooms}BA`);
  if (p.sqft) specs.push(`${fmtNumber(p.sqft)} sf`);
  if (p.totalUnits) specs.push(`${p.totalUnits} units`);

  return (
    <Link
      href={p.href}
      className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 hover:bg-slate-800/50 transition-all group block"
    >
      {/* ── Top: Source + Status badges ── */}
      <div className="flex items-center justify-between mb-3">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${badge.classes}`}
        >
          <BadgeIcon className="h-3 w-3" />
          {badge.label}
        </span>
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize ${p.statusColor}`}
        >
          {p.status}
        </span>
      </div>

      {/* ── Address ── */}
      <h3 className="text-sm font-medium text-white truncate group-hover:text-blue-400 transition-colors">
        {p.address}
      </h3>
      {p.unit && (
        <p className="text-xs text-slate-400 mt-0.5">Unit {p.unit}</p>
      )}
      {p.city && (
        <p className="text-xs text-slate-500 mt-0.5">
          {p.city}
          {p.state ? `, ${p.state}` : ""}
          {p.zip ? ` ${p.zip}` : ""}
        </p>
      )}

      {/* ── Metrics ── */}
      <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
        {priceDisplay && (
          <span className="text-white font-medium">{priceDisplay}</span>
        )}
        {specs.length > 0 && (
          <span className="text-slate-500">{specs.join(" · ")}</span>
        )}
      </div>

      {/* ── Subtitle row ── */}
      <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
        <span className="truncate">
          {p.agentName
            ? `Agent: ${p.agentName}`
            : p.ownerName
              ? `Owner: ${p.ownerName}`
              : p.propertyType
                ? p.propertyType.replace(/_/g, " ")
                : ""}
        </span>
        <span className="flex-shrink-0 ml-2">
          {p.daysOnMarket != null
            ? `${p.daysOnMarket}d on market`
            : relativeTime(p.addedAt)}
        </span>
      </div>

      {/* ── Quick stats ── */}
      {(p.dealCount > 0 || p.showingCount > 0) && (
        <div className="mt-2.5 flex items-center gap-3 text-[10px]">
          {p.dealCount > 0 && (
            <span className="text-blue-400">
              {p.dealCount} deal{p.dealCount > 1 ? "s" : ""}
            </span>
          )}
          {p.showingCount > 0 && (
            <span className="text-amber-400">
              {p.showingCount} showing{p.showingCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

// ── Loading Skeleton ─────────────────────────────────────────

function PropertyGridSkeleton() {
  return (
    <div className="space-y-5">
      {/* Stats skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="bg-slate-900 rounded-xl px-4 py-3 animate-pulse"
          >
            <div className="h-6 w-12 bg-slate-800 rounded mb-1" />
            <div className="h-3 w-16 bg-slate-800 rounded" />
          </div>
        ))}
      </div>
      {/* Grid skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse"
          >
            <div className="flex justify-between mb-3">
              <div className="h-5 w-16 bg-slate-800 rounded" />
              <div className="h-5 w-20 bg-slate-800 rounded" />
            </div>
            <div className="h-4 w-3/4 bg-slate-800 rounded mb-2" />
            <div className="h-3 w-1/2 bg-slate-800 rounded mb-3" />
            <div className="h-3 w-2/3 bg-slate-800 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
