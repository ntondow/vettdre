"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { MonitorDot, Filter, X, ChevronLeft, ChevronRight } from "lucide-react";
import TerminalEventCard from "./terminal-event-card";
import WatchlistManager from "./watchlist-manager";
import NeighborhoodFilter from "./neighborhood-filter";
import KeyboardShortcutsHelp from "./keyboard-shortcuts-help";
import AlertDropdown from "./alert-dropdown";
import TerminalSearch from "./terminal-search";
import { getTerminalEvents, updateTerminalPreferences, getEventCategoryCounts, getTerminalEventDetail, getTerminalEventsByIds, getWatchlists, createWatchlist, fetchNeighborhoodCounts } from "../actions";
import type { WebIntelResult } from "../types";
import { useTerminalRealtime } from "@/lib/terminal-realtime";
import type { PlutoDataProp } from "@/app/(dashboard)/market-intel/building-profile";

const BuildingProfile = dynamic(
  () => import("@/app/(dashboard)/market-intel/building-profile"),
  { ssr: false, loading: () => <BuildingProfileSkeleton /> },
);

// ── Types ─────────────────────────────────────────────────────

interface CategoryDef {
  eventType: string;
  category: string;
  tier: number;
  displayLabel: string;
  defaultEnabled: boolean;
  sortOrder: number;
}

interface Props {
  orgId: string;
  initialEvents: any[];
  initialHasMore: boolean;
  initialBoroughs: number[];
  initialCategories: string[];
  initialNtas: string[];
  categories: CategoryDef[];
  categoryCounts: Record<string, number>;
}

const MAX_FEED_EVENTS = 500;

const BOROUGHS = [
  { code: 1, short: "MN", name: "Manhattan" },
  { code: 2, short: "BX", name: "Bronx" },
  { code: 3, short: "BK", name: "Brooklyn" },
  { code: 4, short: "QN", name: "Queens" },
  { code: 5, short: "SI", name: "Staten Is." },
];

// ── Component ─────────────────────────────────────────────────

export default function TerminalFeed({
  orgId,
  initialEvents,
  initialHasMore,
  initialBoroughs,
  initialCategories,
  initialNtas,
  categories,
  categoryCounts: initialCounts,
}: Props) {
  // State
  const [events, setEvents] = useState<any[]>(initialEvents);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [boroughs, setBoroughs] = useState<number[]>(initialBoroughs);
  const [enabledCategories, setEnabledCategories] = useState<string[]>(initialCategories);
  const [selectedNtas, setSelectedNtas] = useState<string[]>(initialNtas);
  const [neighborhoodCounts, setNeighborhoodCounts] = useState<Array<{ nta: string; name: string; count: number }>>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>(initialCounts);
  const [detailEvent, setDetailEvent] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [recentBbls, setRecentBbls] = useState<string[]>([]);
  const [watchlists, setWatchlists] = useState<any[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const [pendingEvents, setPendingEvents] = useState<any[]>([]);
  const [isScrolledDown, setIsScrolledDown] = useState(false);

  const feedEndRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLElement>(null);
  const loadingRef = useRef(false);
  const eventIdsRef = useRef(new Set(initialEvents.map((e: any) => e.id)));
  const webIntelCacheRef = useRef<Map<string, WebIntelResult>>(new Map());

  // ── Realtime ───────────────────────────────────────────────

  const handleNewEvents = useCallback(async (eventIds: string[]) => {
    // Dedup against existing events
    const newIds = eventIds.filter((id) => !eventIdsRef.current.has(id));
    if (newIds.length === 0) return;

    try {
      const fetched = await getTerminalEventsByIds(newIds);
      if (fetched.length === 0) return;

      // Register IDs to prevent future dupes
      for (const e of fetched) eventIdsRef.current.add(e.id);

      if (isScrolledDown) {
        // Buffer events — show banner
        setPendingEvents((prev) => [...fetched, ...prev].slice(0, MAX_FEED_EVENTS));
      } else {
        // At top — prepend immediately
        setEvents((prev) => [...fetched, ...prev].slice(0, MAX_FEED_EVENTS));
      }
    } catch (err) {
      console.error("[Terminal] Realtime fetch error:", err);
    }
  }, [isScrolledDown]);

  const realtimeStatus = useTerminalRealtime({
    orgId,
    boroughs,
    categories: enabledCategories,
    enabled: !!orgId,
    onNewEvents: handleNewEvents,
  });

  // Track scroll position for "new events" banner
  const handleFeedScroll = useCallback(() => {
    if (feedRef.current) {
      setIsScrolledDown(feedRef.current.scrollTop > 200);
    }
  }, []);

  // Flush pending events banner
  const flushPending = useCallback(() => {
    if (pendingEvents.length > 0) {
      setEvents((prev) => [...pendingEvents, ...prev].slice(0, MAX_FEED_EVENTS));
      setPendingEvents([]);
      feedRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [pendingEvents]);

  // ── Watchlist Data ─────────────────────────────────────────

  const refreshWatchlists = useCallback(async () => {
    try {
      const wl = await getWatchlists();
      setWatchlists(wl);
    } catch {}
  }, []);

  useEffect(() => { refreshWatchlists(); }, [refreshWatchlists]);

  // Build a set of watched BBLs for quick-watch icon state
  const watchedBbls = new Set(
    watchlists.filter((w) => w.watchType === "bbl" && w.isActive).map((w) => w.watchValue),
  );

  const handleQuickWatch = async (bbl: string) => {
    if (watchedBbls.has(bbl)) {
      setToast("Already watching this BBL");
    } else {
      const result = await createWatchlist({ watchType: "bbl", watchValue: bbl });
      if (result.success) {
        setToast(`Watching ${bbl}`);
        refreshWatchlists();
      } else {
        setToast(result.error || "Failed to create watch");
      }
    }
    setTimeout(() => setToast(null), 2500);
  };

  // ── Data Fetching ──────────────────────────────────────────

  const fetchEvents = useCallback(async (cursorId?: string) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const result = await getTerminalEvents({
        boroughs,
        categories: enabledCategories,
        ntas: selectedNtas,
        cursorId,
        limit: 20,
      });
      // Track IDs for Realtime dedup
      for (const e of result.events) eventIdsRef.current.add(e.id);

      if (cursorId) {
        setEvents(prev => [...prev, ...result.events]);
      } else {
        setEvents(result.events);
      }
      setHasMore(result.hasMore);
    } catch (err) {
      console.error("[Terminal] Fetch error:", err);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [boroughs, enabledCategories, selectedNtas]);

  // Re-fetch when filters change
  useEffect(() => {
    fetchEvents();
    // Update counts
    getEventCategoryCounts(boroughs).then(setCategoryCounts).catch(() => {});
    fetchNeighborhoodCounts(boroughs, enabledCategories).then(setNeighborhoodCounts).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boroughs, enabledCategories, selectedNtas]);

  // ── Infinite Scroll ────────────────────────────────────────

  useEffect(() => {
    if (!feedEndRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingRef.current) {
          const lastEvent = events[events.length - 1];
          if (lastEvent) {
            fetchEvents(lastEvent.id);
          }
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(feedEndRef.current);
    return () => observer.disconnect();
  }, [events, hasMore, fetchEvents]);

  // ── Detail Panel ───────────────────────────────────────────

  const handleBblClick = async (eventId: string, bbl: string) => {
    setDetailLoading(true);
    setIsPanelCollapsed(false); // Auto-expand panel when clicking a new building
    setRecentBbls(prev => [bbl, ...prev.filter(b => b !== bbl)].slice(0, 5));
    try {
      const detail = await getTerminalEventDetail(eventId);
      setDetailEvent(detail);
    } catch {
      setDetailEvent(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Keyboard Navigation ───────────────────────────────────

  // Reset focus when mouse clicks a card (let hover states take over)
  const clearFocusOnClick = useCallback(() => setFocusedIndex(null), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable) return;

      switch (e.key) {
        case "j": {
          e.preventDefault();
          setFocusedIndex(prev => {
            const next = prev === null ? 0 : Math.min(prev + 1, events.length - 1);
            document.querySelector(`[data-event-index="${next}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            return next;
          });
          break;
        }
        case "k": {
          e.preventDefault();
          setFocusedIndex(prev => {
            const next = prev === null ? 0 : Math.max(prev - 1, 0);
            document.querySelector(`[data-event-index="${next}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            return next;
          });
          break;
        }
        case "Enter": {
          if (focusedIndex !== null && events[focusedIndex]) {
            e.preventDefault();
            const id = events[focusedIndex].id;
            setExpandedEventId(prev => prev === id ? null : id);
          }
          break;
        }
        case "o": {
          if (focusedIndex !== null && events[focusedIndex]) {
            e.preventDefault();
            const ev = events[focusedIndex];
            handleBblClick(ev.id, ev.bbl);
          }
          break;
        }
        case "w": {
          if (focusedIndex !== null && events[focusedIndex]) {
            e.preventDefault();
            handleQuickWatch(events[focusedIndex].bbl);
          }
          break;
        }
        case "Escape": {
          if (expandedEventId) {
            setExpandedEventId(null);
          } else if (detailEvent) {
            setDetailEvent(null);
          } else if (isSearching) {
            setIsSearching(false);
          } else if (showShortcuts) {
            setShowShortcuts(false);
          }
          break;
        }
        case "/": {
          if (!isSearching) {
            e.preventDefault();
            setIsSearching(true);
          }
          break;
        }
        case "?": {
          e.preventDefault();
          setShowShortcuts(prev => !prev);
          break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [events, focusedIndex, expandedEventId, detailEvent, isSearching, showShortcuts, handleBblClick, handleQuickWatch]);

  // ── Filter Handlers ────────────────────────────────────────

  const toggleBorough = (code: number) => {
    const next = boroughs.includes(code)
      ? boroughs.filter(b => b !== code)
      : [...boroughs, code];
    if (next.length === 0) return; // Must have at least 1
    setBoroughs(next);
    updateTerminalPreferences({ enabledBoroughs: next }).catch(() => {});
  };

  const toggleCategory = (eventType: string) => {
    const next = enabledCategories.includes(eventType)
      ? enabledCategories.filter(c => c !== eventType)
      : [...enabledCategories, eventType];
    setEnabledCategories(next);
    updateTerminalPreferences({ enabledCategories: next }).catch(() => {});
  };

  const toggleNta = (nta: string) => {
    const next = selectedNtas.includes(nta)
      ? selectedNtas.filter(n => n !== nta)
      : [...selectedNtas, nta];
    setSelectedNtas(next);
    updateTerminalPreferences({ selectedNtas: next }).catch(() => {});
  };

  // ── Status (Realtime + freshness) ───────────────────────────

  const latestEventTime = events[0]?.detectedAt ? new Date(events[0].detectedAt).getTime() : 0;
  const minutesStale = latestEventTime ? Math.floor((Date.now() - latestEventTime) / 60000) : 999;

  let statusColor: string;
  let statusTitle: string;
  if (realtimeStatus === "connected") {
    statusColor = "bg-[#30D158]";
    statusTitle = `Live (${minutesStale < 999 ? `${minutesStale}m ago` : "no data"})`;
  } else if (realtimeStatus === "connecting") {
    statusColor = "bg-[#FFD93D]";
    statusTitle = "Connecting...";
  } else if (realtimeStatus === "error") {
    statusColor = "bg-[#FF6B6B]";
    statusTitle = "Connection error — events may be delayed";
  } else {
    statusColor = minutesStale < 30 ? "bg-[#FFD93D]" : "bg-[#FF6B6B]";
    statusTitle = "Disconnected — pull to refresh";
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col bg-[#0D1117] text-[#E6EDF3] overflow-hidden">
      {/* ── Top Bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#21262D] shrink-0">
        <h1 className="text-sm font-bold font-mono tracking-wide text-[#E6EDF3]">
          VettdRE <span className="text-[#0A84FF]">Terminal</span>
        </h1>

        {/* Borough toggles — horizontal scroll on mobile */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {BOROUGHS.map(b => (
            <button
              key={b.code}
              onClick={() => toggleBorough(b.code)}
              className={`px-2.5 py-1 text-[11px] font-semibold font-mono rounded transition-colors shrink-0 ${
                boroughs.includes(b.code)
                  ? "bg-[#0A84FF] text-white"
                  : "bg-[#1C2333] text-[#8B949E] hover:bg-[#21262D]"
              }`}
              aria-label={`Toggle ${b.name}`}
              aria-pressed={boroughs.includes(b.code)}
            >
              {b.short}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5" title={statusTitle}>
            <div className={`w-2 h-2 rounded-full ${statusColor} ${realtimeStatus === "connected" ? "animate-pulse" : ""}`} />
            <MonitorDot size={14} className="text-[#8B949E]" />
          </div>
          <AlertDropdown onAlertClick={handleBblClick} />
          {!isSearching && (
            <TerminalSearch
              boroughs={boroughs}
              isActive={false}
              onActivate={() => setIsSearching(true)}
              onDeactivate={() => setIsSearching(false)}
              onBblClick={handleBblClick}
              watchedBbls={watchedBbls}
              onQuickWatch={handleQuickWatch}
            />
          )}
          <button
            onClick={() => setMobileFilters(true)}
            className="md:hidden p-1 text-[#8B949E] hover:text-[#E6EDF3]"
            aria-label="Open filters"
          >
            <Filter size={16} />
          </button>
        </div>
      </div>

      {/* ── Main Content ────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Search Mode ──────────────────────────────────── */}
        {isSearching ? (
          <TerminalSearch
            boroughs={boroughs}
            isActive={true}
            onActivate={() => setIsSearching(true)}
            onDeactivate={() => setIsSearching(false)}
            onBblClick={handleBblClick}
            watchedBbls={watchedBbls}
            onQuickWatch={handleQuickWatch}
          />
        ) : (
        <>
        {/* ── Left Sidebar (desktop) ──────────────────────── */}
        <aside className="hidden md:flex flex-col w-[260px] border-r border-[#21262D] overflow-y-auto shrink-0">
          {/* Category Toggles */}
          <div className="p-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-[#8B949E] mb-2">Event Types</h2>
            <div className="space-y-0.5">
              {categories.map(cat => {
                const active = enabledCategories.includes(cat.eventType);
                const count = categoryCounts[cat.eventType] || 0;
                return (
                  <button
                    key={cat.eventType}
                    onClick={() => toggleCategory(cat.eventType)}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-[12px] transition-colors ${
                      active ? "bg-[#1C2333] text-[#E6EDF3]" : "text-[#8B949E] hover:bg-[#161B22]"
                    }`}
                    aria-pressed={active}
                  >
                    <span className="truncate">{cat.displayLabel}</span>
                    {count > 0 && (
                      <span className="text-[10px] font-mono bg-[#21262D] px-1.5 py-0.5 rounded ml-1 shrink-0">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-[#21262D] mx-3" />

          {/* Neighborhood Filter */}
          {neighborhoodCounts.length > 0 && (
            <>
              <NeighborhoodFilter
                neighborhoods={neighborhoodCounts}
                selectedNtas={selectedNtas}
                onToggle={toggleNta}
              />
              <div className="border-t border-[#21262D] mx-3" />
            </>
          )}

          {/* Watchlists */}
          <WatchlistManager watchlists={watchlists} onRefresh={refreshWatchlists} />

          <div className="border-t border-[#21262D] mx-3" />

          {/* Recently Viewed */}
          {recentBbls.length > 0 && (
            <div className="p-3">
              <h2 className="text-[10px] font-semibold uppercase tracking-widest text-[#8B949E] mb-2">Recent</h2>
              <div className="space-y-1">
                {recentBbls.map(bbl => (
                  <div key={bbl} className="text-[11px] font-mono text-[#8B949E]">{bbl}</div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ── Feed (center) ───────────────────────────────── */}
        <main ref={feedRef} onScroll={handleFeedScroll} className="flex-1 overflow-y-auto" role="feed" aria-label="Terminal event feed">
          {/* New events banner */}
          {pendingEvents.length > 0 && (
            <button
              onClick={flushPending}
              className="sticky top-0 z-10 w-full py-2 bg-[#0A84FF] text-white text-xs font-semibold text-center hover:bg-[#0A84FF]/90 transition-colors"
            >
              {pendingEvents.length >= MAX_FEED_EVENTS
                ? `${MAX_FEED_EVENTS}+ new events`
                : `${pendingEvents.length} new event${pendingEvents.length === 1 ? "" : "s"}`} ↑
            </button>
          )}

          <div className="max-w-3xl mx-auto px-3 py-3 space-y-2">
            {events.length === 0 && !loading && (
              <div className="text-center py-20">
                <p className="text-[#8B949E] text-sm font-mono">No events match your current filters</p>
                <p className="text-[#8B949E] text-[11px] mt-1">Try enabling more boroughs, event types, or neighborhoods</p>
                <button
                  onClick={() => {
                    setBoroughs([1, 2, 3, 4, 5]);
                    setEnabledCategories(categories.filter(c => c.defaultEnabled).map(c => c.eventType));
                    setSelectedNtas([]);
                    updateTerminalPreferences({
                      enabledBoroughs: [1, 2, 3, 4, 5],
                      enabledCategories: categories.filter(c => c.defaultEnabled).map(c => c.eventType),
                      selectedNtas: [],
                    }).catch(() => {});
                  }}
                  className="mt-3 text-[12px] font-medium bg-[#0A84FF] text-white px-4 py-1.5 rounded hover:bg-[#0A84FF]/90 transition-colors"
                >
                  Reset filters
                </button>
              </div>
            )}

            {/* TODO: pagination — defensive cap, query already limits to 20 */}
            {events.slice(0, 200).map((event, idx) => (
              <div
                key={event.id}
                data-event-index={idx}
                onClick={clearFocusOnClick}
                aria-current={focusedIndex === idx ? "true" : undefined}
                className={focusedIndex === idx ? "ring-1 ring-[#0A84FF]/50 rounded-r-lg" : ""}
              >
                <TerminalEventCard
                  event={event}
                  onBblClick={handleBblClick}
                  isWatched={watchedBbls.has(event.bbl)}
                  onQuickWatch={handleQuickWatch}
                  isExpanded={expandedEventId === event.id}
                  onToggleExpand={(id) => setExpandedEventId(prev => prev === id ? null : id)}
                  cachedWebIntel={webIntelCacheRef.current.get(event.id) ?? null}
                  onWebIntelLoaded={(id, data) => { webIntelCacheRef.current.set(id, data); }}
                />
              </div>
            ))}

            {/* Infinite scroll sentinel */}
            <div ref={feedEndRef} className="h-1" />

            {loading && (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-[#0A84FF] border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!hasMore && events.length > 0 && (
              <p className="text-center text-[11px] text-[#8B949E] font-mono py-4">End of feed</p>
            )}
          </div>
        </main>
        </>
        )}

        {/* ── Right Panel (desktop, detail view) ──────────── */}
        {detailEvent && (
          <div className="hidden lg:flex shrink-0 relative">
            {/* Chevron toggle — always visible, sits on the left edge of the panel area */}
            <button
              onClick={() => setIsPanelCollapsed(prev => !prev)}
              className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-6 h-12 flex items-center justify-center bg-[#21262D] hover:bg-[#30363D] text-[#8B949E] hover:text-[#E6EDF3] rounded-l-lg transition-colors shadow-lg"
              aria-label={isPanelCollapsed ? "Expand building panel" : "Collapse building panel"}
            >
              {isPanelCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            </button>

            <aside
              className={`flex flex-col border-l border-slate-200 bg-white text-gray-900 overflow-hidden transition-[width] duration-300 ease-out will-change-[width] ${
                isPanelCollapsed ? "w-0 border-l-0" : "w-[480px]"
              }`}
            >
              <div className="w-[480px] h-full overflow-y-auto">
                {detailLoading ? (
                  <BuildingProfileSkeleton />
                ) : (() => {
                  const parsed = parseBbl(detailEvent.bbl);
                  if (!parsed) {
                    return (
                      <div>
                        <div className="flex items-center justify-between p-3 border-b border-slate-200">
                          <h2 className="text-xs font-semibold font-mono text-slate-900">
                            {detailEvent.enrichmentPackage?.property_profile?.address || detailEvent.bbl}
                          </h2>
                          <button
                            onClick={() => setDetailEvent(null)}
                            className="text-slate-400 hover:text-slate-600 p-1"
                            aria-label="Close detail panel"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <div className="p-3 text-sm text-slate-500">
                          Unable to parse BBL: {detailEvent.bbl}
                        </div>
                      </div>
                    );
                  }

                  const profile = detailEvent.enrichmentPackage?.property_profile;
                  const valuation = detailEvent.enrichmentPackage?.valuation_context;
                  const plutoData = profile ? mapEnrichmentToPluto(profile, valuation) : undefined;

                  return (
                    <BuildingProfile
                      boroCode={parsed.boroCode}
                      block={parsed.block}
                      lot={parsed.lot}
                      address={profile?.address}
                      borough={profile?.borough}
                      ownerName={profile?.ownerName ?? undefined}
                      plutoData={plutoData}
                      onClose={() => setDetailEvent(null)}
                    />
                  );
                })()}
              </div>
            </aside>
          </div>
        )}
      </div>

      {/* ── Toast ────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1C2333] border border-[#21262D] text-[#E6EDF3] text-xs font-medium px-4 py-2 rounded-lg shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      {/* ── Keyboard Shortcuts Help ─────────────────────── */}
      {showShortcuts && (
        <KeyboardShortcutsHelp onClose={() => setShowShortcuts(false)} />
      )}

      {/* ── Mobile Filter Sheet ──────────────────────────── */}
      {mobileFilters && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileFilters(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-[#161B22] rounded-t-2xl max-h-[70vh] overflow-y-auto pb-safe animate-slide-up">
            <div className="flex items-center justify-between p-4 border-b border-[#21262D]">
              <h2 className="text-sm font-semibold text-[#E6EDF3]">Filters</h2>
              <button onClick={() => setMobileFilters(false)} className="text-[#8B949E]">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[#8B949E]">Event Types</h3>
              {categories.map(cat => {
                const active = enabledCategories.includes(cat.eventType);
                const count = categoryCounts[cat.eventType] || 0;
                return (
                  <button
                    key={cat.eventType}
                    onClick={() => toggleCategory(cat.eventType)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      active ? "bg-[#1C2333] text-[#E6EDF3]" : "text-[#8B949E]"
                    }`}
                  >
                    <span>{cat.displayLabel}</span>
                    {count > 0 && (
                      <span className="text-xs font-mono bg-[#21262D] px-2 py-0.5 rounded">{count}</span>
                    )}
                  </button>
                );
              })}

              {/* Neighborhoods in mobile */}
              {neighborhoodCounts.length > 0 && (
                <>
                  <div className="border-t border-[#21262D] pt-3 mt-3" />
                  <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[#8B949E]">Neighborhoods</h3>
                  {neighborhoodCounts.map(n => {
                    const active = selectedNtas.includes(n.nta);
                    return (
                      <button
                        key={n.nta}
                        onClick={() => toggleNta(n.nta)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${
                          active ? "bg-[#1C2333] text-[#E6EDF3]" : "text-[#8B949E]"
                        }`}
                      >
                        <span>{n.name}</span>
                        <span className="text-xs font-mono bg-[#21262D] px-2 py-0.5 rounded">{n.count}</span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── BBL Parser ───────────────────────────────────────────────

function parseBbl(bbl: string): { boroCode: string; block: string; lot: string } | null {
  if (!bbl) return null;

  // Hyphenated format: "3-07265-0001"
  const hyphenated = bbl.match(/^(\d)-(\d{5})-(\d{4})$/);
  if (hyphenated) {
    return { boroCode: hyphenated[1], block: hyphenated[2], lot: hyphenated[3] };
  }

  // 10-character format: "3072650001"
  const flat = bbl.replace(/\D/g, "");
  if (flat.length === 10) {
    return { boroCode: flat[0], block: flat.slice(1, 6), lot: flat.slice(6, 10) };
  }

  return null;
}

// ── Enrichment → PlutoDataProp Mapper ────────────────────────

function mapEnrichmentToPluto(
  profile: any,
  valuation?: any,
): PlutoDataProp {
  return {
    address: profile.address || "",
    ownerName: profile.ownerName || "",
    unitsRes: profile.residentialUnits || 0,
    unitsTot: (profile.residentialUnits || 0) + (profile.commercialUnits || 0),
    yearBuilt: profile.yearBuilt || 0,
    numFloors: profile.floors || 0,
    bldgArea: profile.buildingArea || 0,
    lotArea: profile.lotArea || 0,
    assessTotal: valuation?.dofAssessedValue || 0,
    bldgClass: profile.buildingClass || "",
    zoneDist: profile.zoningDistricts?.join(", ") || "",
    borough: profile.borough || "",
    zip: profile.zipCode || "",
    lat: 0,
    lng: 0,
  };
}

// ── Skeleton for BuildingProfile loading ─────────────────────

function BuildingProfileSkeleton() {
  return (
    <div className="p-4 space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-5 w-48 bg-slate-200 rounded" />
        <div className="h-5 w-5 bg-slate-200 rounded" />
      </div>
      <div className="h-3 w-32 bg-slate-100 rounded" />
      <div className="space-y-3 mt-6">
        <div className="h-4 w-20 bg-slate-200 rounded" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-16 bg-slate-100 rounded" />
              <div className="h-4 w-24 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3 mt-4">
        <div className="h-4 w-24 bg-slate-200 rounded" />
        <div className="h-20 bg-slate-100 rounded" />
      </div>
      <div className="space-y-3 mt-4">
        <div className="h-4 w-28 bg-slate-200 rounded" />
        <div className="h-16 bg-slate-100 rounded" />
        <div className="h-16 bg-slate-100 rounded" />
      </div>
    </div>
  );
}
