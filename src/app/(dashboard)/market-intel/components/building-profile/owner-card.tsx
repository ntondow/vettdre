"use client";

// Owner display card with AI-first priority + HPD fallback
// NEVER shows "UNAVAILABLE OWNER" — always displays best available data

import type { BuildingIntelligence } from "@/lib/data-fusion-types";
import type { OwnershipChain, DeepEntityResult } from "../../ownership-actions";
import { isEntityName } from "@/lib/entity-resolver";
import { SkeletonOwnerCard } from "./skeleton-components";

interface Props {
  pluto: any;
  intel: BuildingIntelligence | null;
  ownershipChain: OwnershipChain | null;
  entityIntel: DeepEntityResult | null;
  intelLoading: boolean;
  onNameClick?: (name: string) => void;
}

export default function OwnerCard({ pluto, intel, ownershipChain, entityIntel, intelLoading, onNameClick }: Props) {
  // Resolve owner info from multiple sources with priority
  const plutoOwner = pluto?.ownername || pluto?.ownerName || "";
  const hpdRegistered = intel?.ownership?.registeredOwner || plutoOwner;
  const managingAgent = intel?.ownership?.hpdRegistration?.managingAgent || "";

  // AI-resolved owner
  const aiOwner = intel?.ownership?.likelyOwner;
  const aiName = aiOwner?.entityName || "";
  const aiPerson = aiOwner?.likelyPerson || "";
  const aiLlc = aiOwner?.llcName || "";
  const aiConfidence = aiOwner?.confidence || intel?.ownership?.confidence || 0;

  // Deep ownership piercing
  const piercedPerson = entityIntel?.ultimatePerson || "";
  const piercedEntity = entityIntel?.primaryEntity?.name || "";

  // Ownership chain info
  const acquisitionDate = ownershipChain?.currentOwner?.acquiredDate || "";
  const acquisitionPrice = ownershipChain?.currentOwner?.acquiredPrice || 0;
  const holdingYears = acquisitionDate
    ? Math.floor((Date.now() - new Date(acquisitionDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : 0;

  // ACRIS last buyer
  const lastBuyer = ownershipChain?.currentOwner?.name || "";

  // Priority: pierced person > AI person > AI entity > HPD registered > PLUTO owner
  let trueOwnerName = "";
  let trueOwnerSubtext = "";
  let showAsTrueOwner = false;

  if (piercedPerson && !isEntityName(piercedPerson)) {
    trueOwnerName = piercedPerson;
    trueOwnerSubtext = piercedEntity ? `via ${piercedEntity}` : aiLlc ? `via ${aiLlc}` : "";
    showAsTrueOwner = true;
  } else if (aiPerson && !isEntityName(aiPerson)) {
    trueOwnerName = aiPerson;
    trueOwnerSubtext = aiLlc ? `via ${aiLlc}` : "";
    showAsTrueOwner = true;
  } else if (aiName) {
    trueOwnerName = aiName;
    trueOwnerSubtext = "";
    showAsTrueOwner = false; // Entity, not an individual
  } else {
    trueOwnerName = hpdRegistered || plutoOwner;
    trueOwnerSubtext = "";
    showAsTrueOwner = false;
  }

  const hasAiLoaded = !!intel;
  const isResolvingOwner = !hasAiLoaded && intelLoading;

  return (
    <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Ownership</span>
        {aiConfidence > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400">AI Confidence</span>
            <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  aiConfidence >= 70 ? "bg-emerald-500" : aiConfidence >= 40 ? "bg-amber-500" : "bg-red-400"
                }`}
                style={{ width: `${Math.min(100, aiConfidence)}%` }}
              />
            </div>
            <span className="text-[10px] font-semibold text-slate-600">{aiConfidence}%</span>
          </div>
        )}
      </div>

      {/* Resolving shimmer — shown when AI hasn't loaded yet */}
      {isResolvingOwner && (
        <div className="mb-2 flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-[11px] text-blue-500 italic">Resolving true owner...</span>
        </div>
      )}

      {/* True owner label */}
      {showAsTrueOwner && !isResolvingOwner && (
        <div className="mb-0.5">
          <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">True Owner</span>
        </div>
      )}

      {/* Owner name */}
      <div className="mb-1">
        {onNameClick ? (
          <button
            onClick={() => onNameClick(trueOwnerName)}
            className="text-base font-bold text-slate-900 hover:text-blue-600 transition-colors text-left"
          >
            {trueOwnerName || (isResolvingOwner ? "" : "Unknown Owner")}
          </button>
        ) : (
          <span className="text-base font-bold text-slate-900">
            {trueOwnerName || (isResolvingOwner ? "" : "Unknown Owner")}
          </span>
        )}
        {isResolvingOwner && !trueOwnerName && (
          <SkeletonOwnerCard />
        )}
      </div>

      {/* Subtext (via LLC) */}
      {trueOwnerSubtext && (
        <p className="text-xs text-slate-500 mb-1">{trueOwnerSubtext}</p>
      )}

      {/* Supporting details */}
      <div className="pt-2 border-t border-blue-100/80 space-y-1">
        {hpdRegistered && hpdRegistered !== trueOwnerName && (
          <div className="flex items-start gap-1.5">
            <span className="text-[10px] text-slate-400 w-24 shrink-0">HPD Registered</span>
            <span className="text-xs text-slate-600 font-medium">{hpdRegistered}</span>
          </div>
        )}
        {managingAgent && (
          <div className="flex items-start gap-1.5">
            <span className="text-[10px] text-slate-400 w-24 shrink-0">Managing Agent</span>
            <span className="text-xs text-slate-600 font-medium">{managingAgent}</span>
          </div>
        )}
        {lastBuyer && lastBuyer !== trueOwnerName && lastBuyer !== hpdRegistered && (
          <div className="flex items-start gap-1.5">
            <span className="text-[10px] text-slate-400 w-24 shrink-0">ACRIS Buyer</span>
            <span className="text-xs text-slate-600 font-medium">{lastBuyer}</span>
          </div>
        )}
        {acquisitionPrice > 0 && (
          <div className="flex items-start gap-1.5">
            <span className="text-[10px] text-slate-400 w-24 shrink-0">Acquired</span>
            <span className="text-xs text-slate-600 font-medium">
              ${(acquisitionPrice / 1e6).toFixed(2)}M
              {acquisitionDate && ` (${new Date(acquisitionDate).getFullYear()})`}
              {holdingYears > 0 && ` \u2022 ${holdingYears}yr hold`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
