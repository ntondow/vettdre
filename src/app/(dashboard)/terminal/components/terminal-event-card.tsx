"use client";

import { useMemo } from "react";
import { Bookmark, ChevronDown } from "lucide-react";
import EventDetailExpanded from "./event-detail-expanded";
import type { WebIntelResult } from "../types";

interface ColorTag {
  text: string;
  color: "green" | "red" | "amber" | "blue" | "neutral";
}

interface Props {
  event: {
    id: string;
    eventType: string;
    bbl: string;
    borough: number;
    detectedAt: string;
    aiBrief: string | null;
    metadata: any;
    enrichmentPackage: any;
  };
  onBblClick?: (eventId: string, bbl: string) => void;
  isWatched?: boolean;
  onQuickWatch?: (bbl: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: (eventId: string) => void;
  cachedWebIntel?: WebIntelResult | null;
  onWebIntelLoaded?: (eventId: string, data: WebIntelResult) => void;
}

const BORO_SHORT: Record<number, string> = { 1: "MN", 2: "BX", 3: "BK", 4: "QN", 5: "SI" };

const CATEGORY_COLORS: Record<string, string> = {
  SALE_RECORDED: "border-l-[#30D158]",
  LOAN_RECORDED: "border-l-[#0A84FF]",
  NEW_BUILDING_PERMIT: "border-l-[#0A84FF]",
  MAJOR_ALTERATION: "border-l-[#0A84FF]",
  HPD_VIOLATION: "border-l-[#FF6B6B]",
  DOB_STOP_WORK: "border-l-[#FF6B6B]",
  ECB_HIGH_PENALTY: "border-l-[#FF6B6B]",
  STALLED_SITE: "border-l-[#FFD93D]",
  FORECLOSURE_FILED: "border-l-[#FF6B6B]",
  TAX_LIEN_SOLD: "border-l-[#FF6B6B]",
  ZONING_CHANGE: "border-l-[#0A84FF]",
  CERTIFICATE_OF_OCCUPANCY: "border-l-[#30D158]",
};

const CATEGORY_BADGES: Record<string, { label: string; bg: string }> = {
  SALE_RECORDED: { label: "Sale", bg: "bg-[#30D158]/15 text-[#30D158]" },
  LOAN_RECORDED: { label: "Loan", bg: "bg-[#0A84FF]/15 text-[#0A84FF]" },
  NEW_BUILDING_PERMIT: { label: "New Build", bg: "bg-[#0A84FF]/15 text-[#0A84FF]" },
  MAJOR_ALTERATION: { label: "Alt-1", bg: "bg-[#0A84FF]/15 text-[#0A84FF]" },
  HPD_VIOLATION: { label: "HPD Viol", bg: "bg-[#FF6B6B]/15 text-[#FF6B6B]" },
  DOB_STOP_WORK: { label: "SWO", bg: "bg-[#FF6B6B]/15 text-[#FF6B6B]" },
  ECB_HIGH_PENALTY: { label: "ECB", bg: "bg-[#FF6B6B]/15 text-[#FF6B6B]" },
  STALLED_SITE: { label: "Stalled", bg: "bg-[#FFD93D]/15 text-[#FFD93D]" },
};

const COLOR_MAP: Record<string, string> = {
  green: "text-[#30D158]",
  red: "text-[#FF6B6B]",
  amber: "text-[#FFD93D]",
  blue: "text-[#0A84FF]",
  neutral: "text-[#8B949E]",
};

// Raw hex colors for hover glow shadow
const GLOW_COLORS: Record<string, string> = {
  SALE_RECORDED: "#30D158",
  LOAN_RECORDED: "#0A84FF",
  NEW_BUILDING_PERMIT: "#0A84FF",
  MAJOR_ALTERATION: "#0A84FF",
  HPD_VIOLATION: "#FF6B6B",
  DOB_STOP_WORK: "#FF6B6B",
  ECB_HIGH_PENALTY: "#FF6B6B",
  STALLED_SITE: "#FFD93D",
  FORECLOSURE_FILED: "#FF6B6B",
  TAX_LIEN_SOLD: "#FF6B6B",
  ZONING_CHANGE: "#0A84FF",
  CERTIFICATE_OF_OCCUPANCY: "#30D158",
};

// Dollar amount color by event type
const AMOUNT_COLORS: Record<string, string> = {
  SALE_RECORDED: "text-[#30D158]",
  LOAN_RECORDED: "text-[#0A84FF]",
  FORECLOSURE_FILED: "text-[#FF6B6B]",
  TAX_LIEN_SOLD: "text-[#FF6B6B]",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDollar(amount: number): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `$${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (amount >= 1_000) {
    return `$${Math.round(amount / 1_000)}K`;
  }
  return `$${amount}`;
}

const FALLBACK_LABELS: Record<string, string> = {
  SALE_RECORDED: "Property sale recorded",
  LOAN_RECORDED: "Mortgage/loan filing recorded",
  NEW_BUILDING_PERMIT: "New building permit filed",
  MAJOR_ALTERATION: "Major alteration permit filed",
  HPD_VIOLATION: "HPD housing violation issued",
  DOB_STOP_WORK: "DOB stop work order issued",
  ECB_HIGH_PENALTY: "ECB high-penalty violation",
  STALLED_SITE: "Stalled construction site flagged",
  FORECLOSURE_FILED: "Foreclosure action filed",
  TAX_LIEN_SOLD: "Tax lien sold",
  ZONING_CHANGE: "Zoning change recorded",
  CERTIFICATE_OF_OCCUPANCY: "Certificate of occupancy issued",
};

function BriefFallback({ event }: { event: Props["event"] }) {
  const label = FALLBACK_LABELS[event.eventType] || event.eventType.replace(/_/g, " ").toLowerCase();
  const retries = (event.metadata as any)?._briefRetries || 0;
  const hasError = retries >= 3;

  return (
    <>
      <span>{label}</span>
      {hasError ? (
        <span className="ml-2 text-[10px] text-[#484F58]">Brief unavailable</span>
      ) : (
        <span className="ml-2 text-[10px] text-[#484F58]">Brief pending</span>
      )}
    </>
  );
}

export default function TerminalEventCard({
  event, onBblClick, isWatched, onQuickWatch, isExpanded, onToggleExpand,
  cachedWebIntel, onWebIntelLoaded,
}: Props) {
  const colorTags: ColorTag[] = event.metadata?._colorTags || [];
  const badge = CATEGORY_BADGES[event.eventType];
  const borderColor = CATEGORY_COLORS[event.eventType] || "border-l-[#21262D]";
  const glowColor = GLOW_COLORS[event.eventType] || "#21262D";

  const profile = event.enrichmentPackage?.property_profile;
  const address = profile?.address || "";
  const neighborhood = profile?.neighborhood || "";
  const boroShort = BORO_SHORT[event.borough] || "?";

  // Dollar amount from metadata
  const rawAmount = parseFloat(event.metadata?.doc_amount || event.metadata?.amount || "0");
  const hasAmount = rawAmount > 0 && AMOUNT_COLORS[event.eventType];
  const amountColor = AMOUNT_COLORS[event.eventType] || "text-[#8B949E]";

  // Unit count from enrichment
  const totalUnits = profile?.residentialUnits || 0;
  const showUnits = totalUnits > 1;

  // Apply color tags to brief text
  const renderedBrief = useMemo(() => {
    if (!event.aiBrief) return null;
    const text = event.aiBrief;
    if (colorTags.length === 0) return text;

    const segments: Array<{ text: string; color?: string }> = [];
    let remaining = text;

    for (const tag of colorTags) {
      const idx = remaining.indexOf(tag.text);
      if (idx === -1) continue;
      if (idx > 0) segments.push({ text: remaining.slice(0, idx) });
      segments.push({ text: tag.text, color: COLOR_MAP[tag.color] || "" });
      remaining = remaining.slice(idx + tag.text.length);
    }
    if (remaining) segments.push({ text: remaining });

    return segments;
  }, [event.aiBrief, colorTags]);

  const handleCardClick = () => {
    onToggleExpand?.(event.id);
  };

  return (
    <div
      className={`terminal-card-enter border-l-[3px] ${borderColor} ${
        isExpanded ? "bg-[#1C2333]" : "bg-[#161B22] hover:bg-[#1C2333]"
      } rounded-r-lg transition-all duration-150 cursor-pointer hover:shadow-[inset_3px_0_0_var(--glow)]`}
      style={{ "--glow": glowColor } as React.CSSProperties}
      role="article"
      aria-label={`${badge?.label || event.eventType} event at ${address || event.bbl}`}
      aria-expanded={isExpanded}
      onClick={handleCardClick}
    >
      {/* Clickable card body */}
      <div className="px-4 py-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {address ? (
              <>
                <span
                  className="text-[#E6EDF3] text-[12px] font-semibold truncate cursor-pointer hover:text-[#0A84FF] transition-colors"
                  title={`BBL: ${event.bbl}`}
                  onClick={(e) => { e.stopPropagation(); onBblClick?.(event.id, event.bbl); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onBblClick?.(event.id, event.bbl); } }}
                >
                  {address}
                </span>
                <span className="text-[#484F58] text-[11px] shrink-0">·</span>
                <span className="text-[#8B949E] text-[11px] truncate shrink-0">
                  {neighborhood ? `${neighborhood} · ${boroShort}` : boroShort}
                </span>
              </>
            ) : (
              <span
                className="text-[#8B949E] text-[11px] font-mono cursor-pointer hover:text-[#0A84FF] transition-colors"
                title={`BBL: ${event.bbl}`}
                onClick={(e) => { e.stopPropagation(); onBblClick?.(event.id, event.bbl); }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onBblClick?.(event.id, event.bbl); } }}
              >
                {boroShort} · {event.bbl}
              </span>
            )}
            <span
              className="text-[#8B949E] text-[10px] shrink-0"
              title={new Date(event.detectedAt).toLocaleString()}
            >
              {relativeTime(event.detectedAt)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {badge && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge.bg}`}>
                {badge.label}
              </span>
            )}
            {onQuickWatch && (
              <button
                onClick={(e) => { e.stopPropagation(); onQuickWatch(event.bbl); }}
                className={`p-0.5 rounded transition-colors ${
                  isWatched
                    ? "text-[#0A84FF]"
                    : "text-[#484F58] hover:text-[#8B949E]"
                }`}
                aria-label={isWatched ? "Watching this BBL" : "Watch this BBL"}
                title={isWatched ? "Watching this BBL" : "Quick watch"}
              >
                <Bookmark size={12} fill={isWatched ? "currentColor" : "none"} />
              </button>
            )}
            {/* Expand chevron */}
            <span className={`text-[#484F58] transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
              <ChevronDown size={12} />
            </span>
          </div>
        </div>

        {/* Metadata row — dollar amount + unit count */}
        {(hasAmount || showUnits) && (
          <div className="flex items-center gap-2 mb-1.5">
            {hasAmount && (
              <span className={`font-mono text-[11px] font-semibold ${amountColor}`}>
                {formatDollar(rawAmount)}
              </span>
            )}
            {showUnits && (
              <span className="text-[10px] text-[#8B949E] bg-[#21262D] px-1.5 py-0.5 rounded font-mono">
                {totalUnits} units
              </span>
            )}
          </div>
        )}

        {/* Brief content */}
        {event.aiBrief ? (
          <div className="font-mono text-[13px] leading-[1.6] text-[#E6EDF3] whitespace-pre-wrap">
            {Array.isArray(renderedBrief) ? (
              renderedBrief.map((seg, i) =>
                seg.color ? (
                  <span key={i} className={`font-semibold ${seg.color}`}>{seg.text}</span>
                ) : (
                  <span key={i}>{seg.text}</span>
                ),
              )
            ) : (
              renderedBrief
            )}
          </div>
        ) : (
          <div className="font-mono text-[12px] leading-[1.5] text-[#8B949E]">
            <BriefFallback event={event} />
          </div>
        )}
      </div>

      {/* Expandable detail — CSS grid height animation */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {isExpanded && (
            <div className="border-t border-[#21262D]">
              <EventDetailExpanded
                event={event}
                onBblClick={onBblClick}
                cachedWebIntel={cachedWebIntel}
                onWebIntelLoaded={onWebIntelLoaded}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
