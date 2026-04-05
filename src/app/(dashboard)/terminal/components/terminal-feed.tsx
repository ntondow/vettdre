"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MonitorDot, Bell, Filter, X, ChevronRight, Lock } from "lucide-react";
import TerminalEventCard from "./terminal-event-card";
import { getTerminalEvents, updateTerminalPreferences, getEventCategoryCounts, getTerminalEventDetail } from "../actions";

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
  initialEvents: any[];
  initialHasMore: boolean;
  initialBoroughs: number[];
  initialCategories: string[];
  initialNtas: string[];
  categories: CategoryDef[];
  categoryCounts: Record<string, number>;
}

const BOROUGHS = [
  { code: 1, short: "MN", name: "Manhattan" },
  { code: 2, short: "BX", name: "Bronx" },
  { code: 3, short: "BK", name: "Brooklyn" },
  { code: 4, short: "QN", name: "Queens" },
  { code: 5, short: "SI", name: "Staten Is." },
];

// ── Component ─────────────────────────────────────────────────

export default function TerminalFeed({
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
  const [selectedNtas] = useState<string[]>(initialNtas);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>(initialCounts);
  const [detailEvent, setDetailEvent] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [recentBbls, setRecentBbls] = useState<string[]>([]);

  const feedEndRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

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
        limit: 50,
      });
      if (cursor) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boroughs, enabledCategories]);

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

  // ── Detail Panel ───────────────────────────────────────────

  const handleBblClick = async (eventId: string, bbl: string) => {
    setDetailLoading(true);
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

  // ── Data freshness ─────────────────────────────────────────

  const latestEventTime = events[0]?.detectedAt ? new Date(events[0].detectedAt).getTime() : 0;
  const minutesStale = latestEventTime ? Math.floor((Date.now() - latestEventTime) / 60000) : 999;
  const statusColor = minutesStale < 30 ? "bg-[#30D158]" : "bg-[#FFD93D]";

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-[#0D1117] text-[#E6EDF3] overflow-hidden -m-4 md:-m-6">
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
          <div className="flex items-center gap-1.5" title={`Data ${minutesStale < 30 ? "fresh" : "stale"} (${minutesStale}m)`}>
            <div className={`w-2 h-2 rounded-full ${statusColor}`} />
            <MonitorDot size={14} className="text-[#8B949E]" />
          </div>
          <Bell size={14} className="text-[#8B949E]" />
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

          {/* Watchlists placeholder */}
          <div className="p-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-[#8B949E] mb-2">Watchlists</h2>
            <div className="flex items-center gap-2 text-[12px] text-[#8B949E] py-4 justify-center">
              <Lock size={12} />
              <span>Coming in Phase 2</span>
            </div>
          </div>

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
        <main className="flex-1 overflow-y-auto" role="feed" aria-label="Terminal event feed">
          <div className="max-w-3xl mx-auto px-3 py-3 space-y-2">
            {events.length === 0 && !loading && (
              <div className="text-center py-20">
                <p className="text-[#8B949E] text-sm font-mono">No events match your filters</p>
                <p className="text-[#8B949E] text-[11px] mt-1">Try enabling more boroughs or event categories</p>
              </div>
            )}

            {events.map(event => (
              <TerminalEventCard
                key={event.id}
                event={event}
                onBblClick={handleBblClick}
              />
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

        {/* ── Right Panel (desktop, detail view) ──────────── */}
        {detailEvent && (
          <aside className="hidden lg:flex flex-col w-[400px] border-l border-[#21262D] bg-[#161B22] overflow-y-auto shrink-0">
            <div className="flex items-center justify-between p-3 border-b border-[#21262D]">
              <h2 className="text-xs font-semibold font-mono text-[#E6EDF3]">
                {detailEvent.enrichmentPackage?.property_profile?.address || detailEvent.bbl}
              </h2>
              <button
                onClick={() => setDetailEvent(null)}
                className="text-[#8B949E] hover:text-[#E6EDF3] p-1"
                aria-label="Close detail panel"
              >
                <X size={14} />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-5 h-5 border-2 border-[#0A84FF] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="p-3 space-y-3">
                {/* Property Profile */}
                {detailEvent.enrichmentPackage?.property_profile && (
                  <DetailSection title="Property">
                    <DetailRow label="Address" value={detailEvent.enrichmentPackage.property_profile.address} />
                    <DetailRow label="Borough" value={detailEvent.enrichmentPackage.property_profile.borough} />
                    <DetailRow label="Units" value={detailEvent.enrichmentPackage.property_profile.residentialUnits} />
                    <DetailRow label="Floors" value={detailEvent.enrichmentPackage.property_profile.floors} />
                    <DetailRow label="Year Built" value={detailEvent.enrichmentPackage.property_profile.yearBuilt} />
                    <DetailRow label="Zoning" value={detailEvent.enrichmentPackage.property_profile.zoningDistricts?.join(", ")} />
                    <DetailRow label="Owner" value={detailEvent.enrichmentPackage.property_profile.ownerName} />
                    <DetailRow label="Building Area" value={detailEvent.enrichmentPackage.property_profile.buildingArea?.toLocaleString()} />
                  </DetailSection>
                )}

                {/* Violations */}
                {detailEvent.enrichmentPackage?.violation_profile && (
                  <DetailSection title="Violations">
                    <DetailRow label="HPD Class C" value={detailEvent.enrichmentPackage.violation_profile.openHpdViolations?.classC} />
                    <DetailRow label="HPD Class B" value={detailEvent.enrichmentPackage.violation_profile.openHpdViolations?.classB} />
                    <DetailRow label="ECB Penalty" value={detailEvent.enrichmentPackage.violation_profile.ecbPenaltyBalance ? `$${detailEvent.enrichmentPackage.violation_profile.ecbPenaltyBalance.toLocaleString()}` : null} />
                    <DetailRow label="Litigation" value={detailEvent.enrichmentPackage.violation_profile.hpdLitigationCount} />
                  </DetailSection>
                )}

                {/* Permits */}
                {detailEvent.enrichmentPackage?.permit_history?.activePermits?.length > 0 && (
                  <DetailSection title="Active Permits">
                    {detailEvent.enrichmentPackage.permit_history.activePermits.slice(0, 5).map((p: any, i: number) => (
                      <div key={i} className="text-[11px] text-[#8B949E] py-1 border-b border-[#21262D] last:border-0">
                        <span className="text-[#E6EDF3]">{p.jobType}</span> · {p.status} · {p.filingDate?.split("T")[0]}
                      </div>
                    ))}
                  </DetailSection>
                )}

                {/* Raw event brief */}
                {detailEvent.aiBrief && (
                  <DetailSection title="AI Brief">
                    <div className="font-mono text-[11px] text-[#E6EDF3] whitespace-pre-wrap leading-relaxed">
                      {detailEvent.aiBrief}
                    </div>
                  </DetailSection>
                )}
              </div>
            )}
          </aside>
        )}
      </div>

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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[#8B949E] mb-1.5">{title}</h3>
      <div className="bg-[#0D1117] rounded-lg p-2.5 space-y-1">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: any }) {
  if (value == null || value === "" || value === 0) return null;
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-[#8B949E]">{label}</span>
      <span className="text-[#E6EDF3] font-mono">{value}</span>
    </div>
  );
}
