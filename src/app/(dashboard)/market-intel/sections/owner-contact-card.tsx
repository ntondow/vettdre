import { useEffect, useRef } from "react";
import { fmtPhone } from "./format-utils";
import type { BuildingIntelligence } from "@/lib/data-fusion-engine";
import type { OwnershipChain, DeepEntityResult } from "../ownership-actions";
import type { EnrichmentResult } from "@/lib/contact-enrichment-pipeline";
import { isEntityName } from "@/lib/entity-resolver";

interface Props {
  pluto: any;
  intel: BuildingIntelligence | null;
  ownershipChain: OwnershipChain | null;
  entityIntel: DeepEntityResult | null;
  contactEnrichment: EnrichmentResult | null;
  contactEnrichmentLoading: boolean;
  ownershipDeepLoading: boolean;
  deepAnalysisRequested: boolean;
  onLoadDeepAnalysis?: () => void;
  onNameClick?: (name: string) => void;
  onSmsClick?: (phone: string, name?: string) => void;
  onPhoneResolved?: (phone: string) => void;
}

function ShimmerLine({ w }: { w: string }) {
  return <div className={`animate-shimmer rounded h-3 ${w}`} />;
}

export default function OwnerContactCard({
  pluto,
  intel,
  ownershipChain,
  entityIntel,
  contactEnrichment,
  contactEnrichmentLoading,
  ownershipDeepLoading,
  deepAnalysisRequested,
  onLoadDeepAnalysis,
  onNameClick,
  onSmsClick,
  onPhoneResolved,
}: Props) {
  const phoneReportedRef = useRef(false);

  // Resolve the best owner name progressively
  const plutoOwner = pluto?.ownerName || null;
  const intelOwner = intel?.ownership?.likelyOwner?.entityName || null;
  const chainOwner = ownershipChain?.currentOwner?.name || null;
  const ownerName = chainOwner || intelOwner || plutoOwner;

  // Determine if owner is an entity (LLC/Corp)
  const isEntity = ownerName ? isEntityName(ownerName) : false;

  // Pierced person from entity intel
  const piercedPerson = entityIntel?.ultimatePerson || intel?.ownership?.likelyOwner?.likelyPerson || null;
  const piercedRelationship = entityIntel?.piercingChain?.length
    ? entityIntel.piercingChain[entityIntel.piercingChain.length - 1].relationship
    : null;

  // Ownership duration
  const acquiredDate = ownershipChain?.currentOwner?.acquiredDate;
  const acquiredPrice = ownershipChain?.currentOwner?.acquiredPrice;
  const ownerSince = acquiredDate
    ? (() => {
        const d = new Date(acquiredDate);
        const now = new Date();
        const years = now.getFullYear() - d.getFullYear();
        const months = now.getMonth() - d.getMonth();
        const totalMonths = years * 12 + months;
        const y = Math.floor(totalMonths / 12);
        const m = totalMonths % 12;
        const datePart = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        return `${datePart} (${y}y ${m}m)`;
      })()
    : null;

  // Best contact from enrichment pipeline
  const primary = contactEnrichment?.primaryContact;
  const bestPhone = primary?.phones?.find((p) => p.isPrimary) || primary?.phones?.[0] || null;
  const bestEmail = primary?.emails?.find((e) => e.isPrimary) || primary?.emails?.[0] || null;

  // Callback when phone resolves
  useEffect(() => {
    if (bestPhone && onPhoneResolved && !phoneReportedRef.current) {
      phoneReportedRef.current = true;
      onPhoneResolved(bestPhone.value);
    }
  }, [bestPhone, onPhoneResolved]);

  // Also report from intel phoneRankings if enrichment hasn't resolved yet
  useEffect(() => {
    if (phoneReportedRef.current) return;
    const phoneRanking = intel?.raw?.phoneRankings?.[0];
    if (phoneRanking?.phone && onPhoneResolved) {
      phoneReportedRef.current = true;
      onPhoneResolved(phoneRanking.phone);
    }
  }, [intel, onPhoneResolved]);

  const ownerLoading = !plutoOwner && !intelOwner;
  const contactLoading = contactEnrichmentLoading || ownershipDeepLoading;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex flex-col md:flex-row md:items-start gap-4">
        {/* Owner Section */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">
            Owner
          </p>
          {ownerLoading ? (
            <div className="space-y-2">
              <ShimmerLine w="w-48" />
              <ShimmerLine w="w-32" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                {isEntity && (
                  <span className="text-[9px] font-bold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">
                    LLC
                  </span>
                )}
                <button
                  onClick={() => ownerName && onNameClick?.(ownerName)}
                  className="text-base font-bold text-slate-900 hover:text-blue-600 transition-colors text-left"
                >
                  {ownerName || "Unknown"}
                </button>
              </div>
              {piercedPerson && piercedPerson !== ownerName && (
                <p className="text-xs text-slate-600 mt-0.5">
                  Pierced to:{" "}
                  <button
                    onClick={() => onNameClick?.(piercedPerson)}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {piercedPerson}
                  </button>
                  {piercedRelationship && (
                    <span className="text-slate-400 ml-1">
                      ({piercedRelationship})
                    </span>
                  )}
                </p>
              )}
              {(ownerSince || acquiredPrice) && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {ownerSince && <>Owner since {ownerSince}</>}
                  {ownerSince && acquiredPrice && acquiredPrice > 0 && " • "}
                  {acquiredPrice && acquiredPrice > 0 && (
                    <>Acquired ${(acquiredPrice / 1e6).toFixed(1)}M</>
                  )}
                </p>
              )}
              {ownershipDeepLoading && (
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="animate-spin rounded-full h-2.5 w-2.5 border border-blue-500 border-t-transparent" />
                  <span className="text-[10px] text-blue-500">Loading ownership chain...</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Contact Section */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
              Contact
            </p>
            {bestPhone && (
              <div className="flex items-center gap-1.5">
                <a
                  href={`tel:${bestPhone.value}`}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg transition-colors"
                >
                  📞 Call
                </a>
                {onSmsClick && (
                  <button
                    onClick={() => onSmsClick(bestPhone.value, piercedPerson || ownerName || undefined)}
                    className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold rounded-lg transition-colors"
                  >
                    💬 SMS
                  </button>
                )}
              </div>
            )}
          </div>

          {contactLoading && !contactEnrichment ? (
            <div className="space-y-2">
              <ShimmerLine w="w-40" />
              <ShimmerLine w="w-36" />
              <ShimmerLine w="w-48" />
            </div>
          ) : bestPhone || bestEmail || primary?.title ? (
            <div className="space-y-1">
              {bestPhone && (
                <div className="flex items-center gap-2">
                  <a
                    href={`tel:${bestPhone.value}`}
                    className="text-sm font-bold text-slate-900 hover:text-blue-600 transition-colors"
                  >
                    {fmtPhone(bestPhone.value)}
                  </a>
                  <span
                    className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
                      bestPhone.confidence >= 80
                        ? "bg-emerald-100 text-emerald-700"
                        : bestPhone.confidence >= 50
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {bestPhone.confidence}%{" "}
                    {bestPhone.confidence >= 80 ? "✅" : ""}
                  </span>
                  {bestPhone.sourceDetail && (
                    <span className="text-[9px] text-slate-400">
                      {bestPhone.sourceDetail}
                    </span>
                  )}
                </div>
              )}
              {bestEmail && (
                <div className="flex items-center gap-2">
                  <a
                    href={`mailto:${bestEmail.value}`}
                    className="text-sm text-blue-600 hover:underline truncate"
                  >
                    {bestEmail.value}
                  </a>
                  <span
                    className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
                      bestEmail.confidence >= 80
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {bestEmail.confidence}%{" "}
                    {bestEmail.confidence >= 80 ? "✅" : ""}
                  </span>
                </div>
              )}
              {primary?.title && (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span>
                    {primary.title}
                    {primary.company && ` @ ${primary.company}`}
                  </span>
                  {primary.linkedIn && (
                    <a
                      href={
                        primary.linkedIn.startsWith("http")
                          ? primary.linkedIn
                          : `https://${primary.linkedIn}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      🔗 LinkedIn
                    </a>
                  )}
                </div>
              )}
            </div>
          ) : !deepAnalysisRequested && onLoadDeepAnalysis ? (
            <div>
              <p className="text-xs text-slate-500 mb-2">
                Click to find phone, email, and LinkedIn via Apollo + PDL
              </p>
              <button
                onClick={onLoadDeepAnalysis}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Find Owner Contact
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">
              {contactEnrichment
                ? "No contact info found"
                : "Enriching contacts..."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
