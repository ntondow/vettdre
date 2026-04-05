"use client";

import { useMemo } from "react";

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

export default function TerminalEventCard({ event, onBblClick }: Props) {
  const colorTags: ColorTag[] = event.metadata?._colorTags || [];
  const headline = event.metadata?._headline || "";
  const badge = CATEGORY_BADGES[event.eventType];
  const borderColor = CATEGORY_COLORS[event.eventType] || "border-l-[#21262D]";
  const address = event.enrichmentPackage?.property_profile?.address || "";

  // Apply color tags to brief text
  const renderedBrief = useMemo(() => {
    if (!event.aiBrief) return null;
    let text = event.aiBrief;
    if (colorTags.length === 0) return text;

    // Build segments with color annotations
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

  return (
    <div
      className={`terminal-card-enter border-l-[3px] ${borderColor} bg-[#161B22] rounded-r-lg px-4 py-3 hover:bg-[#1C2333] transition-colors`}
      role="article"
      aria-label={`${event.eventType} event at ${address || event.bbl}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-[#8B949E] text-[11px] font-mono cursor-pointer hover:text-[#0A84FF] transition-colors"
            title={`BBL: ${event.bbl}`}
            onClick={() => onBblClick?.(event.id, event.bbl)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") onBblClick?.(event.id, event.bbl); }}
          >
            {BORO_SHORT[event.borough] || "?"} · {event.bbl}
          </span>
          <span
            className="text-[#8B949E] text-[10px]"
            title={new Date(event.detectedAt).toLocaleString()}
          >
            {relativeTime(event.detectedAt)}
          </span>
        </div>
        {badge && (
          <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${badge.bg}`}>
            {badge.label}
          </span>
        )}
      </div>

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
        // Brief not yet generated — show shimmer
        <div className="space-y-1.5 py-1">
          <div className="h-3 bg-[#21262D] rounded w-3/4 terminal-shimmer" />
          <div className="h-3 bg-[#21262D] rounded w-full terminal-shimmer" />
          <div className="h-3 bg-[#21262D] rounded w-5/6 terminal-shimmer" />
          <p className="text-[10px] text-[#8B949E] mt-1.5 font-mono">Generating brief...</p>
        </div>
      )}
    </div>
  );
}
