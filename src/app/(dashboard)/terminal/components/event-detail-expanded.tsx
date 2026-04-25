"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Building2, FileText, Scale, Search } from "lucide-react";
import { getRelatedEvents, searchEventWebIntel } from "../actions";
import type { WebIntelResult } from "../types";

interface Props {
  event: {
    id: string;
    eventType: string;
    bbl: string;
    borough: number;
    metadata: any;
    enrichmentPackage: any;
  };
  onBblClick?: (eventId: string, bbl: string) => void;
  cachedWebIntel?: WebIntelResult | null;
  onWebIntelLoaded?: (eventId: string, data: WebIntelResult) => void;
}

const BADGE_LABELS: Record<string, string> = {
  SALE_RECORDED: "Sale",
  LOAN_RECORDED: "Loan",
  NEW_BUILDING_PERMIT: "New Build",
  MAJOR_ALTERATION: "Alt-1",
  HPD_VIOLATION: "HPD Viol",
  DOB_STOP_WORK: "SWO",
  ECB_HIGH_PENALTY: "ECB",
  STALLED_SITE: "Stalled",
};

function parseBbl(bbl: string): { boro: string; block: string; lot: string } | null {
  const flat = bbl.replace(/\D/g, "");
  if (flat.length === 10) {
    return { boro: flat[0], block: flat.slice(1, 6), lot: flat.slice(6, 10) };
  }
  return null;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function EventDetailExpanded({ event, onBblClick, cachedWebIntel, onWebIntelLoaded }: Props) {
  const profile = event.enrichmentPackage?.property_profile;
  const ownership = event.enrichmentPackage?.ownership_chain;
  const metadata = event.metadata || {};
  const parsed = parseBbl(event.bbl);

  // Related events — fetched once on mount
  const [relatedEvents, setRelatedEvents] = useState<any[] | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    getRelatedEvents(event.bbl, event.id)
      .then(setRelatedEvents)
      .catch(() => setRelatedEvents([]));
  }, [event.bbl, event.id]);

  // Web intel state
  const [webIntel, setWebIntel] = useState<WebIntelResult | null>(cachedWebIntel ?? null);
  const [webIntelLoading, setWebIntelLoading] = useState(false);

  const handleResearch = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (webIntel || webIntelLoading) return;
    const address = profile?.address;
    if (!address) return;

    setWebIntelLoading(true);
    try {
      const result = await searchEventWebIntel(address, event.eventType);
      setWebIntel(result);
      onWebIntelLoaded?.(event.id, result);
    } catch {
      setWebIntel({ articles: [], listings: [] });
    } finally {
      setWebIntelLoading(false);
    }
  };

  // Filing details from metadata
  const docId = metadata.document_id || "";
  const docType = metadata.doc_type || "";
  const filingDate = metadata.good_through_date || metadata.recorded_datetime || metadata.filing_date || "";

  // Parties from metadata._parties or ownership chain
  // ACRIS: type 1 = grantor (seller), type 2 = grantee (buyer)
  const parties = metadata._parties || [];
  const buyers = parties.filter((p: any) => String(p.type) === "2").map((p: any) => p.name).filter(Boolean);
  const sellers = parties.filter((p: any) => String(p.type) === "1").map((p: any) => p.name).filter(Boolean);
  const deed = ownership?.deedHistory?.[0];
  const buyerNames = buyers.length > 0 ? buyers : deed?.buyerName ? [deed.buyerName] : [];
  const sellerNames = sellers.length > 0 ? sellers : deed?.sellerName ? [deed.sellerName] : [];
  const hasParties = buyerNames.length > 0 || sellerNames.length > 0;

  const isLoan = event.eventType === "LOAN_RECORDED";
  const buyerLabel = isLoan ? "Borrower" : "Buyer";
  const sellerLabel = isLoan ? "Lender" : "Seller";

  // Quick links
  const acrisUrl = docId
    ? `https://a836-acris.nyc.gov/DS/DocumentSearch/DocumentDetail?doc_id=${docId}`
    : null;
  const bisUrl = parsed
    ? `https://a810-bisweb.nyc.gov/bisweb/PropertyProfileOverviewServlet?boro=${parsed.boro}&block=${parsed.block}&lot=${parsed.lot}`
    : null;
  const hpdUrl = parsed
    ? `https://hpdonline.nyc.gov/hpdonline/building/${parsed.boro}/${parsed.block}/${parsed.lot}`
    : null;

  const address = profile?.address || "";
  const underwriteUrl = `/deals/new?address=${encodeURIComponent(address)}&bbl=${event.bbl}`;

  return (
    <div className="px-4 pb-3 pt-1 space-y-3" onClick={(e) => e.stopPropagation()}>
      {/* Filing Details */}
      {(docId || docType || filingDate) && (
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-[#8B949E] font-semibold mb-1.5">Filing Details</h4>
          <div className="grid grid-cols-3 gap-x-4 gap-y-1">
            {docId && (
              <div>
                <span className="text-[10px] text-[#8B949E]">Doc ID</span>
                <p className="text-[11px] font-mono text-[#E6EDF3] truncate">{docId}</p>
              </div>
            )}
            {docType && (
              <div>
                <span className="text-[10px] text-[#8B949E]">Type</span>
                <p className="text-[11px] font-mono text-[#E6EDF3]">{docType}</p>
              </div>
            )}
            {filingDate && (
              <div>
                <span className="text-[10px] text-[#8B949E]">Filed</span>
                <p className="text-[11px] font-mono text-[#E6EDF3]">{formatDate(filingDate)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Parties */}
      {hasParties && (
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-[#8B949E] font-semibold mb-1.5">Parties</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {buyerNames.length > 0 && (
              <div>
                <span className="text-[10px] text-[#8B949E]">{buyerLabel}</span>
                {buyerNames.map((name: string, i: number) => (
                  <p key={i} className="text-[11px] text-[#E6EDF3] truncate">{name}</p>
                ))}
              </div>
            )}
            {sellerNames.length > 0 && (
              <div>
                <span className="text-[10px] text-[#8B949E]">{sellerLabel}</span>
                {sellerNames.map((name: string, i: number) => (
                  <p key={i} className="text-[11px] text-[#E6EDF3] truncate">{name}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Property Snapshot */}
      {profile && (
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-[#8B949E] font-semibold mb-1.5">Property</h4>
          <div className="grid grid-cols-4 gap-x-3 gap-y-1">
            {profile.buildingClass && (
              <div>
                <span className="text-[10px] text-[#8B949E]">Class</span>
                <p className="text-[11px] font-mono text-[#E6EDF3]">{profile.buildingClass}</p>
              </div>
            )}
            {profile.yearBuilt > 0 && (
              <div>
                <span className="text-[10px] text-[#8B949E]">Built</span>
                <p className="text-[11px] font-mono text-[#E6EDF3]">{profile.yearBuilt}</p>
              </div>
            )}
            {(profile.residentialUnits || 0) + (profile.commercialUnits || 0) > 0 && (
              <div>
                <span className="text-[10px] text-[#8B949E]">Units</span>
                <p className="text-[11px] font-mono text-[#E6EDF3]">
                  {(profile.residentialUnits || 0) + (profile.commercialUnits || 0)}
                </p>
              </div>
            )}
            {profile.lotArea > 0 && (
              <div>
                <span className="text-[10px] text-[#8B949E]">Lot SF</span>
                <p className="text-[11px] font-mono text-[#E6EDF3]">{profile.lotArea.toLocaleString()}</p>
              </div>
            )}
            {profile.zoningDistricts?.length > 0 && (
              <div className="col-span-2">
                <span className="text-[10px] text-[#8B949E]">Zoning</span>
                <p className="text-[11px] font-mono text-[#E6EDF3]">{profile.zoningDistricts.join(", ")}</p>
              </div>
            )}
            {profile.floors > 0 && (
              <div>
                <span className="text-[10px] text-[#8B949E]">Floors</span>
                <p className="text-[11px] font-mono text-[#E6EDF3]">{profile.floors}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Related Events at this BBL */}
      {relatedEvents === null ? (
        <div className="flex items-center gap-2 py-1">
          <div className="w-3 h-3 border border-[#0A84FF] border-t-transparent rounded-full animate-spin" />
          <span className="text-[10px] text-[#8B949E]">Loading related events...</span>
        </div>
      ) : relatedEvents.length > 0 ? (
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-[#8B949E] font-semibold mb-1.5">
            Other Events at This BBL
          </h4>
          <div className="space-y-1">
            {relatedEvents.map((re) => (
              <div key={re.id} className="flex items-center gap-2 text-[11px] py-0.5">
                <span className="text-[#8B949E] font-mono shrink-0">{relativeTime(re.detectedAt)}</span>
                <span className="text-[#8B949E]">·</span>
                <span className="text-[#E6EDF3] font-mono shrink-0">{BADGE_LABELS[re.eventType] || re.eventType}</span>
                {re.briefSnippet && (
                  <>
                    <span className="text-[#8B949E]">·</span>
                    <span className="text-[#8B949E] truncate">{re.briefSnippet}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Web Intel — Research Button + Results */}
      {!webIntel && !webIntelLoading && address && (
        <button
          onClick={handleResearch}
          aria-label="Research this event online"
          className="inline-flex items-center gap-1.5 text-[11px] font-medium bg-[#0A84FF]/10 text-[#0A84FF] hover:bg-[#0A84FF]/20 px-3 py-1.5 rounded transition-colors"
        >
          <Search size={11} /> Research this event
        </button>
      )}

      {webIntelLoading && (
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-[#8B949E] font-semibold mb-1.5">Web Intel</h4>
          <div className="space-y-2">
            <div className="h-3 bg-[#21262D] rounded w-3/4 terminal-shimmer" />
            <div className="h-3 bg-[#21262D] rounded w-full terminal-shimmer" />
            <div className="h-3 bg-[#21262D] rounded w-5/6 terminal-shimmer" />
          </div>
          <p className="text-[10px] text-[#8B949E] mt-1.5 font-mono">Searching...</p>
        </div>
      )}

      {webIntel && (
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-[#8B949E] font-semibold mb-1.5">Web Intel</h4>

          {/* Articles */}
          {webIntel.articles.length > 0 ? (
            <div className="space-y-2">
              {webIntel.articles.map((article, i) => (
                <div key={i}>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-medium text-[#0A84FF] hover:underline leading-tight"
                  >
                    {article.title}
                  </a>
                  {article.snippet && (
                    <p className="text-[11px] text-[#8B949E] leading-tight mt-0.5 line-clamp-2">{article.snippet}</p>
                  )}
                  <span className="text-[10px] text-[#484F58]">{article.source}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-[#8B949E]">No relevant articles found</p>
          )}

          {/* Listings */}
          {webIntel.listings.length > 0 && (
            <div className="mt-2">
              <h4 className="text-[10px] uppercase tracking-wider text-[#8B949E] font-semibold mb-1">Active Listings</h4>
              <div className="space-y-1">
                {webIntel.listings.map((listing, i) => (
                  <a
                    key={i}
                    href={listing.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-[11px] hover:bg-[#21262D] px-1 py-0.5 rounded -mx-1 transition-colors"
                  >
                    <span className="text-[#E6EDF3] truncate">{listing.address}</span>
                    <span className="text-[#30D158] font-mono font-semibold shrink-0">{listing.price}</span>
                    {listing.beds && <span className="text-[#8B949E] shrink-0">{listing.beds}BR</span>}
                    <span className="text-[#484F58] shrink-0">{listing.source}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Links */}
      <div className="flex items-center gap-1.5 pt-1">
        {acrisUrl && (
          <a
            href={acrisUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View on ACRIS"
            className="inline-flex items-center gap-1 text-[10px] font-medium bg-[#21262D] hover:bg-[#30363D] text-[#8B949E] hover:text-[#E6EDF3] px-2 py-1 rounded transition-colors"
          >
            <FileText size={10} /> ACRIS <ExternalLink size={8} />
          </a>
        )}
        {bisUrl && (
          <a
            href={bisUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View on DOB BIS"
            className="inline-flex items-center gap-1 text-[10px] font-medium bg-[#21262D] hover:bg-[#30363D] text-[#8B949E] hover:text-[#E6EDF3] px-2 py-1 rounded transition-colors"
          >
            <Building2 size={10} /> BIS <ExternalLink size={8} />
          </a>
        )}
        {hpdUrl && (
          <a
            href={hpdUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View on HPD Online"
            className="inline-flex items-center gap-1 text-[10px] font-medium bg-[#21262D] hover:bg-[#30363D] text-[#8B949E] hover:text-[#E6EDF3] px-2 py-1 rounded transition-colors"
          >
            <Building2 size={10} /> HPD <ExternalLink size={8} />
          </a>
        )}
      </div>

      {/* Action Row */}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          onClick={(e) => { e.stopPropagation(); onBblClick?.(event.id, event.bbl); }}
          className="text-[11px] font-medium text-[#0A84FF] hover:text-[#4DA3FF] transition-colors"
        >
          Open Building Profile &rarr;
        </button>
        <a
          href={underwriteUrl}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
        >
          <Scale size={10} /> Underwrite &rarr;
        </a>
      </div>
    </div>
  );
}
