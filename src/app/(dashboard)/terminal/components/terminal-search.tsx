"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, MapPin, Building2, User, FileText, Loader2 } from "lucide-react";
import TerminalEventCard from "./terminal-event-card";
import { searchTerminalEvents } from "../actions";
import type { SearchResult } from "../types";

// ── Types ─────────────────────────────────────────────────────

interface Props {
  boroughs: number[];
  isActive: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onBblClick: (eventId: string, bbl: string) => void;
  watchedBbls: Set<string>;
  onQuickWatch: (bbl: string) => void;
}

// ── Match Field Config ───────────────────────────────────────

const MATCH_CONFIG: Record<string, { icon: typeof MapPin; label: string; color: string }> = {
  bbl: { icon: MapPin, label: "BBL", color: "text-[#0A84FF]" },
  address: { icon: Building2, label: "Address", color: "text-[#30D158]" },
  owner: { icon: User, label: "Owner", color: "text-[#FFD93D]" },
  brief: { icon: FileText, label: "Brief", color: "text-[#8B949E]" },
};

// ── Highlight Utility ────────────────────────────────────────

function highlightMatches(text: string, query: string): React.ReactNode[] {
  if (!query || query.length < 2) return [text];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  const queryLower = query.toLowerCase();
  return parts.map((part, i) =>
    part.toLowerCase() === queryLower ? (
      <mark key={i} className="bg-[#0A84FF]/20 text-[#E6EDF3] rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

// ── Component ────────────────────────────────────────────────

const DEBOUNCE_MS = 300;
const PAGE_SIZE = 30;

export default function TerminalSearch({
  boroughs,
  isActive,
  onActivate,
  onDeactivate,
  onBblClick,
  watchedBbls,
  onQuickWatch,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClose = useCallback(() => {
    setQuery("");
    setResults([]);
    setTotalCount(0);
    setHasMore(false);
    onDeactivate();
  }, [onDeactivate]);

  // Cmd/Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isActive) {
          inputRef.current?.focus();
        } else {
          onActivate();
        }
      }
      if (e.key === "Escape" && isActive) {
        handleClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isActive, onActivate, handleClose]);

  // Auto-focus when activated
  useEffect(() => {
    if (isActive) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isActive]);

  const doSearch = useCallback(async (q: string, offset = 0) => {
    if (q.trim().length < 2) {
      setResults([]);
      setTotalCount(0);
      setHasMore(false);
      return;
    }

    const isLoadMore = offset > 0;
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    try {
      const res = await searchTerminalEvents({
        query: q,
        boroughs,
        limit: PAGE_SIZE,
        offset,
      });
      if (isLoadMore) {
        setResults((prev) => [...prev, ...res.results]);
      } else {
        setResults(res.results);
      }
      setTotalCount(res.totalCount);
      setHasMore(res.hasMore);
    } catch {
      // Silent failure
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [boroughs]);

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), DEBOUNCE_MS);
  };

  const handleLoadMore = () => {
    doSearch(query, results.length);
  };

  // ── Search trigger (when inactive) ─────────────────────────

  if (!isActive) {
    return (
      <button
        onClick={onActivate}
        className="p-1 text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
        aria-label="Search (Cmd+K)"
        title="Search (Cmd+K)"
      >
        <Search size={14} />
      </button>
    );
  }

  // ── Active search UI ───────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Search input bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#21262D] shrink-0">
        <Search size={14} className="text-[#8B949E] shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="Search BBL, address, owner, or brief..."
          className="flex-1 bg-transparent text-sm text-[#E6EDF3] placeholder:text-[#484F58] focus:outline-none font-mono"
          autoComplete="off"
          spellCheck={false}
        />
        {query && (
          <span className="text-[10px] text-[#8B949E] font-mono shrink-0">
            {loading ? "..." : `${totalCount} result${totalCount === 1 ? "" : "s"}`}
          </span>
        )}
        <button
          onClick={handleClose}
          className="p-1 text-[#8B949E] hover:text-[#E6EDF3] transition-colors shrink-0"
          aria-label="Close search"
        >
          <X size={14} />
        </button>
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-3 py-3 space-y-2">
          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-[#161B22] rounded-lg p-4 space-y-2 animate-pulse">
                  <div className="h-3 bg-[#21262D] rounded w-1/3" />
                  <div className="h-3 bg-[#21262D] rounded w-full" />
                  <div className="h-3 bg-[#21262D] rounded w-4/5" />
                </div>
              ))}
            </div>
          )}

          {/* No query yet */}
          {!loading && !query && (
            <div className="text-center py-16">
              <Search size={24} className="text-[#21262D] mx-auto mb-3" />
              <p className="text-[#8B949E] text-sm font-mono">Search across events</p>
              <p className="text-[#484F58] text-[11px] mt-1">
                Try a BBL, address, owner name, or keyword
              </p>
            </div>
          )}

          {/* Query too short */}
          {!loading && query && query.trim().length < 2 && (
            <p className="text-center text-[#484F58] text-xs py-8 font-mono">
              Type at least 2 characters
            </p>
          )}

          {/* No results */}
          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <div className="text-center py-16">
              <p className="text-[#8B949E] text-sm font-mono">No events match &ldquo;{query}&rdquo;</p>
              <p className="text-[#484F58] text-[11px] mt-2">Suggestions:</p>
              <ul className="text-[#484F58] text-[11px] mt-1 space-y-0.5">
                <li>Try a partial BBL (e.g. &ldquo;30726&rdquo;)</li>
                <li>Search by owner LLC name</li>
                <li>Use a broader keyword from the AI brief</li>
              </ul>
            </div>
          )}

          {/* Results */}
          {!loading && results.map((r) => {
            const matchCfg = MATCH_CONFIG[r.matchField];
            const MatchIcon = matchCfg?.icon || FileText;
            return (
              <div key={r.event.id} className="relative">
                {/* Match indicator */}
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
                  <MatchIcon size={10} className={matchCfg?.color || "text-[#8B949E]"} />
                  <span className={`text-[9px] font-semibold ${matchCfg?.color || "text-[#8B949E]"}`}>
                    {matchCfg?.label || "Match"}
                  </span>
                </div>

                {/* Reuse event card */}
                <TerminalEventCard
                  event={r.event}
                  onBblClick={onBblClick}
                  isWatched={watchedBbls.has(r.event.bbl)}
                  onQuickWatch={onQuickWatch}
                />

                {/* Highlighted snippet for brief matches */}
                {r.matchField === "brief" && r.event.aiBrief && query.trim().length >= 2 && (
                  <div className="bg-[#0D1117] border border-[#21262D] rounded-b-lg -mt-1 px-4 py-2 text-[11px] text-[#8B949E] font-mono leading-relaxed">
                    {highlightMatches(
                      r.event.aiBrief.length > 200
                        ? r.event.aiBrief.slice(0, 200) + "..."
                        : r.event.aiBrief,
                      query.trim(),
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Load more */}
          {!loading && hasMore && (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="w-full py-2.5 text-center text-[11px] font-semibold text-[#0A84FF] hover:text-[#0A84FF]/80 font-mono transition-colors"
            >
              {loadingMore ? (
                <Loader2 size={14} className="animate-spin mx-auto" />
              ) : (
                `Load more (${totalCount - results.length} remaining)`
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
