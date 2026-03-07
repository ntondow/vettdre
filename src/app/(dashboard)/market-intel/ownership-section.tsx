"use client";

import { useState } from "react";
import type { OwnershipChain, DeepEntityResult, PortfolioDiscovery } from "./ownership-actions";
import FeatureGate from "@/components/ui/feature-gate";

interface Props {
  chain: OwnershipChain | null;
  entityIntel: DeepEntityResult | null;
  portfolio: PortfolioDiscovery | null;
  loading: boolean;
  currentBBL: string;
  assessedValue?: number;
  onPropertyClick?: (bbl: string, address: string, borough: string) => void;
  onNameClick?: (name: string) => void;
}

const fmtPrice = (n: number) => n > 0 ? "$" + n.toLocaleString() : "—";
const fmtDate = (d: string) => {
  if (!d) return "—";
  try { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d)); } catch { return d; }
};
const fmtShortDate = (d: string) => {
  if (!d) return "—";
  try { return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(d)); } catch { return d; }
};

function holdingSince(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    const years = Math.floor(months / 12);
    const rem = months % 12;
    if (years === 0) return `${rem} month${rem !== 1 ? "s" : ""}`;
    if (rem === 0) return `${years} year${years !== 1 ? "s" : ""}`;
    return `${years}y ${rem}m`;
  } catch { return ""; }
}

function entityTypeBadge(name: string): { label: string; color: string } {
  if (!name) return { label: "Unknown", color: "bg-slate-100 text-slate-600" };
  const upper = name.toUpperCase();
  if (/\bLLC\b|L\.L\.C/.test(upper)) return { label: "LLC", color: "bg-violet-100 text-violet-700" };
  if (/\bINC\b|CORP|CORPORATION/.test(upper)) return { label: "Corp", color: "bg-blue-100 text-blue-700" };
  if (/\bTRUST\b/.test(upper)) return { label: "Trust", color: "bg-amber-100 text-amber-700" };
  if (/\bLP\b|PARTNERSHIP/.test(upper)) return { label: "LP", color: "bg-teal-100 text-teal-700" };
  if (name.trim().includes(" ")) return { label: "Person", color: "bg-green-100 text-green-700" };
  return { label: "Entity", color: "bg-slate-100 text-slate-600" };
}

const DOT_COLORS: Record<string, string> = {
  DEED: "bg-blue-500",
  DEEDO: "bg-blue-500",
  "DEED P/S": "bg-blue-500",
  "DEED TS": "bg-blue-400",
  "DEED RC": "bg-blue-400",
  RPTT: "bg-blue-400",
  MTGE: "bg-purple-500",
  SAT: "bg-green-500",
  ALIS: "bg-red-500",
  AGMT: "bg-slate-400",
  ASST: "bg-slate-400",
  "AL&R": "bg-slate-400",
  MCON: "bg-slate-400",
  UCC1: "bg-slate-400",
};

// ============================================================
// Shimmer skeleton for loading state
// ============================================================
function OwnershipSkeleton() {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header skeleton */}
      <div className="p-4 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg border border-indigo-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="animate-shimmer rounded h-5 w-40" />
          <div className="animate-shimmer rounded-full h-5 w-12" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="animate-shimmer rounded h-4 w-24" />
          <div className="animate-shimmer rounded h-4 w-28" />
          <div className="animate-shimmer rounded h-4 w-20" />
        </div>
      </div>
      {/* Timeline skeleton */}
      <div className="p-4 bg-white rounded-lg border border-slate-200">
        <div className="animate-shimmer rounded h-4 w-32 mb-3" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="animate-shimmer rounded-full h-3 w-3 mt-1 shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="animate-shimmer rounded h-3 w-48" />
                <div className="animate-shimmer rounded h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function OwnershipSection({ chain, entityIntel, portfolio, loading, currentBBL, assessedValue, onPropertyClick, onNameClick }: Props) {
  const [showAllTimeline, setShowAllTimeline] = useState(false);
  const [showAllPortfolio, setShowAllPortfolio] = useState(false);
  const [showAllLLCs, setShowAllLLCs] = useState(false);

  // Nothing to show
  if (loading) return <OwnershipSkeleton />;
  if (!chain && !entityIntel && !portfolio) return null;

  // Confidence color
  const confidence = entityIntel?.ultimatePersonConfidence ?? (chain?.currentOwner ? 70 : 0);
  const confColor = confidence >= 70 ? "text-green-600 bg-green-50 border-green-200" : confidence >= 40 ? "text-amber-600 bg-amber-50 border-amber-200" : "text-red-600 bg-red-50 border-red-200";

  // Estimated equity
  const outstandingMortgage = (chain?.activeMortgages || [])
    .filter(m => !m.isSatisfied && m.amount > 0)
    .reduce((sum, m) => sum + m.amount, 0) || 0;
  const estimatedEquity = assessedValue && assessedValue > 0 && outstandingMortgage > 0
    ? assessedValue - outstandingMortgage
    : null;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      {/* ============================================================ */}
      {/* A. OWNERSHIP HEADER CARD */}
      {/* ============================================================ */}
      {chain?.currentOwner && (
        <div className="p-4 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg border border-indigo-100">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🔗</span>
            <span className="text-sm font-bold text-slate-900">Ownership Chain</span>
            {confidence > 0 && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${confColor}`}>
                {confidence}% confidence
              </span>
            )}
          </div>

          <div className="mt-3 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <button
                onClick={() => onNameClick?.(chain.currentOwner!.name)}
                className="text-sm font-bold text-indigo-800 hover:underline text-left cursor-pointer"
              >
                {chain.currentOwner.name}
              </button>
              {(() => {
                const badge = entityTypeBadge(chain.currentOwner.name);
                return <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${badge.color} font-medium`}>{badge.label}</span>;
              })()}
              {entityIntel?.ultimatePerson && entityIntel.ultimatePerson !== chain.currentOwner.name && (
                <p className="text-xs text-indigo-600 mt-1">
                  Likely individual:{" "}
                  <button onClick={() => onNameClick?.(entityIntel.ultimatePerson!)} className="font-semibold hover:underline cursor-pointer">
                    {entityIntel.ultimatePerson}
                  </button>
                </p>
              )}
            </div>

            <div className="text-right shrink-0">
              {chain.currentOwner.acquiredPrice > 0 && (
                <p className="text-sm font-bold text-slate-900">{fmtPrice(chain.currentOwner.acquiredPrice)}</p>
              )}
              <p className="text-[10px] text-slate-500">
                Acquired {fmtShortDate(chain.currentOwner.acquiredDate)}
              </p>
              {chain.currentOwner.acquiredDate && (
                <p className="text-[10px] text-indigo-600 font-medium">
                  Held {holdingSince(chain.currentOwner.acquiredDate)}
                </p>
              )}
            </div>
          </div>

          {/* Previous Owners — compact list */}
          {chain.previousOwners.length > 0 && (
            <div className="mt-3 pt-3 border-t border-indigo-100">
              <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1.5">Previous Owners</p>
              <div className="space-y-1">
                {chain.previousOwners.slice(0, 4).map((prev, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <button
                      onClick={() => onNameClick?.(prev.name)}
                      className="text-slate-700 hover:text-indigo-700 hover:underline truncate max-w-[180px] text-left cursor-pointer"
                    >
                      {prev.name}
                    </button>
                    <div className="flex items-center gap-2 text-slate-400 shrink-0">
                      {prev.holdingPeriod !== "—" && <span>{prev.holdingPeriod}</span>}
                      {prev.soldPrice > 0 && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span>{fmtPrice(prev.soldPrice)}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {chain.previousOwners.length > 4 && (
                  <p className="text-[10px] text-slate-400">+{chain.previousOwners.length - 4} more previous owners</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* B. LLC PIERCING CHAIN */}
      {/* ============================================================ */}
      {entityIntel && entityIntel.primaryEntity && (
        <FeatureGate feature="bp_corp_full" blur>
          <div className="p-4 bg-gradient-to-r from-violet-50 to-purple-50 rounded-lg border border-violet-200">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🏛️</span>
              <span className="text-sm font-bold text-slate-900">LLC Piercing Chain</span>
              {entityIntel.ultimatePerson && (
                <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Person Found</span>
              )}
            </div>

            {/* Vertical chain */}
            <div className="relative ml-4">
              {/* Root entity */}
              <div className="flex items-start gap-3 mb-0">
                <div className="relative z-10 flex items-center justify-center w-6 h-6 rounded-full bg-violet-500 text-white text-[10px] font-bold shrink-0">
                  1
                </div>
                <div className="pt-0.5">
                  <p className="text-xs font-bold text-slate-900">{entityIntel.primaryEntity.name}</p>
                  <p className="text-[10px] text-slate-400">
                    {entityIntel.primaryEntity.entityType} · DOS {entityIntel.primaryEntity.dosId} · Filed {fmtShortDate(entityIntel.primaryEntity.filingDate)}
                  </p>
                </div>
              </div>

              {/* Chain steps */}
              {entityIntel.piercingChain.map((step, i) => (
                <div key={i} className="relative">
                  {/* Connector line */}
                  <div className="absolute left-3 top-0 w-px h-6 bg-violet-200" style={{ transform: "translateX(-0.5px)" }} />

                  <div className="flex items-start gap-3 pt-6 mb-0">
                    <div className={`relative z-10 flex items-center justify-center w-6 h-6 rounded-full text-white text-[10px] font-bold shrink-0 ${
                      step.relationship.includes("Individual") || step.relationship.includes("Person") ? "bg-green-500" :
                      step.relationship.includes("Agent Service") ? "bg-amber-500" :
                      "bg-violet-400"
                    }`}>
                      {step.step + 1}
                    </div>
                    <div className="pt-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => onNameClick?.(step.toEntity)}
                          className="text-xs font-bold text-slate-900 hover:text-violet-700 hover:underline text-left cursor-pointer"
                        >
                          {step.toEntity}
                        </button>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                          step.relationship.includes("Individual") || step.relationship.includes("Person")
                            ? "bg-green-100 text-green-700"
                            : step.relationship.includes("Agent Service")
                            ? "bg-amber-100 text-amber-700"
                            : "bg-violet-100 text-violet-600"
                        }`}>
                          {step.relationship}
                        </span>
                      </div>
                      {step.address && (
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">{step.address}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Related LLCs */}
            {entityIntel.relatedLLCs.length > 0 && (
              <div className="mt-4 pt-3 border-t border-violet-100">
                <button
                  onClick={() => setShowAllLLCs(!showAllLLCs)}
                  className="text-[10px] text-slate-400 uppercase font-semibold mb-2 flex items-center gap-1 cursor-pointer hover:text-slate-600"
                >
                  Related LLCs ({entityIntel.totalRelatedEntities})
                  <span className={`transition-transform duration-200 ${showAllLLCs ? "rotate-90" : ""}`}>▶</span>
                </button>
                <div className={`space-y-1.5 ${showAllLLCs ? "" : "max-h-[120px]"} overflow-y-auto`}>
                  {entityIntel.relatedLLCs.slice(0, showAllLLCs ? 20 : 5).map((llc, i) => (
                    <div key={i} className="flex items-center justify-between bg-white/60 rounded border border-violet-100 px-3 py-1.5">
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => onNameClick?.(llc.name)}
                          className="text-xs font-medium text-slate-800 truncate hover:text-violet-700 hover:underline text-left cursor-pointer block max-w-[200px]"
                        >
                          {llc.name}
                        </button>
                        <p className="text-[10px] text-slate-400">
                          {llc.entityType} · {fmtShortDate(llc.filingDate)}
                          {llc.propertyCount !== undefined && llc.propertyCount > 0 && (
                            <span className="ml-1 text-violet-500 font-medium">· {llc.propertyCount} docs</span>
                          )}
                        </p>
                      </div>
                      <span className="text-[10px] text-violet-500 font-medium ml-2 shrink-0">DOS {llc.dosId}</span>
                    </div>
                  ))}
                  {!showAllLLCs && entityIntel.relatedLLCs.length > 5 && (
                    <button
                      onClick={() => setShowAllLLCs(true)}
                      className="text-[10px] text-violet-600 font-medium hover:underline cursor-pointer w-full text-center py-1"
                    >
                      Show all {entityIntel.totalRelatedEntities} entities
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </FeatureGate>
      )}

      {/* ============================================================ */}
      {/* C. DEED TIMELINE */}
      {/* ============================================================ */}
      {chain && chain.timeline.length > 0 && (
        <FeatureGate feature="bp_ownership_chain" blur>
          <div className="p-4 bg-white rounded-lg border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">📜</span>
                <span className="text-sm font-bold text-slate-900">Document Timeline</span>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                  {chain.totalTransactions} records
                </span>
              </div>
            </div>

            <div className="space-y-2.5">
              {chain.timeline.slice(0, showAllTimeline ? 50 : 5).map((event, i) => {
                const dotColor = DOT_COLORS[event.docType] || "bg-slate-300";
                const grantee = event.parties.find(p => p.role === "grantee" || p.role === "borrower");
                const grantor = event.parties.find(p => p.role === "grantor" || p.role === "lender");

                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${dotColor} mt-1.5 shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-slate-800">{event.docTypeLabel}</span>
                          <FeatureGate feature="bp_corp_full" fallback={null}>
                            {event.amount > 0 && (
                              <span className="text-[10px] text-slate-500 font-medium">{fmtPrice(event.amount)}</span>
                            )}
                          </FeatureGate>
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0">{fmtDate(event.recordedDate)}</span>
                      </div>
                      {/* Parties */}
                      {(grantor || grantee) && (
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          {grantor && (
                            <span>
                              <span className="text-slate-400">From:</span>{" "}
                              <button onClick={() => onNameClick?.(grantor.name)} className="text-slate-600 hover:text-indigo-600 hover:underline cursor-pointer">
                                {grantor.name}
                              </button>
                            </span>
                          )}
                          {grantor && grantee && <span className="mx-1 text-slate-300">→</span>}
                          {grantee && (
                            <span>
                              <span className="text-slate-400">To:</span>{" "}
                              <button onClick={() => onNameClick?.(grantee.name)} className="text-slate-600 hover:text-indigo-600 hover:underline cursor-pointer">
                                {grantee.name}
                              </button>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {chain.timeline.length > 5 && (
              <button
                onClick={() => setShowAllTimeline(!showAllTimeline)}
                className="mt-3 text-xs text-indigo-600 font-medium hover:underline cursor-pointer"
              >
                {showAllTimeline ? "Show less" : `Show all ${chain.timeline.length} events`}
              </button>
            )}
          </div>
        </FeatureGate>
      )}

      {/* ============================================================ */}
      {/* D. ACTIVE MORTGAGES */}
      {/* ============================================================ */}
      {chain && chain.activeMortgages.length > 0 && (
        <FeatureGate feature="bp_corp_full" blur>
          <div className="p-4 bg-white rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🏦</span>
              <span className="text-sm font-bold text-slate-900">Mortgage Records</span>
            </div>

            <div className="space-y-2">
              {chain.activeMortgages.map((mtge, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-50 rounded px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-800 truncate">{mtge.lender}</p>
                    <p className="text-[10px] text-slate-400">
                      {fmtDate(mtge.date)}
                      {mtge.isSatisfied && mtge.satisfiedDate && (
                        <span className="text-green-600"> · Satisfied {fmtShortDate(mtge.satisfiedDate)}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {mtge.amount > 0 && <span className="text-xs font-semibold text-slate-700">{fmtPrice(mtge.amount)}</span>}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                      mtge.isSatisfied ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {mtge.isSatisfied ? "Satisfied" : "Active"}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Estimated equity */}
            {estimatedEquity !== null && (
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Estimated Equity</span>
                <span className={`text-sm font-bold ${estimatedEquity >= 0 ? "text-green-700" : "text-red-600"}`}>
                  {fmtPrice(Math.abs(estimatedEquity))}
                  {estimatedEquity < 0 && <span className="text-[10px] text-red-500 ml-1">(underwater)</span>}
                </span>
              </div>
            )}
          </div>
        </FeatureGate>
      )}

      {/* ============================================================ */}
      {/* D2. LIS PENDENS — Distress Signals */}
      {/* ============================================================ */}
      {chain && chain.lispendens && chain.lispendens.length > 0 && (
        <FeatureGate feature="bp_corp_full" blur>
          <div className="p-4 bg-gradient-to-r from-red-50 to-orange-50 rounded-lg border border-red-200">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">&#9888;&#65039;</span>
              <span className="text-sm font-bold text-slate-900">Lis Pendens</span>
              <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                {chain.lispendens.length} filing{chain.lispendens.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="space-y-2">
              {chain.lispendens.map((lp, i) => (
                <div key={i} className="bg-white/60 rounded px-3 py-2 border border-red-100">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-800 font-medium truncate max-w-[200px]">
                      {lp.parties.join(" vs. ")}
                    </p>
                    <span className="text-[10px] text-slate-400 shrink-0">{fmtDate(lp.filedDate)}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-red-600 mt-2 italic">Active litigation against the property — potential distress signal</p>
          </div>
        </FeatureGate>
      )}

      {/* ============================================================ */}
      {/* D3. UCC FILINGS */}
      {/* ============================================================ */}
      {chain && chain.uccFilings && chain.uccFilings.length > 0 && (
        <FeatureGate feature="bp_corp_full" blur>
          <div className="p-4 bg-white rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">&#128203;</span>
              <span className="text-sm font-bold text-slate-900">UCC Filings</span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                {chain.uccFilings.length} filing{chain.uccFilings.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="space-y-1.5">
              {chain.uccFilings.slice(0, 5).map((ucc, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-50 rounded px-3 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-700 truncate">{ucc.parties.join(", ")}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {ucc.amount > 0 && <span className="text-[10px] text-slate-500 font-medium">{fmtPrice(ucc.amount)}</span>}
                    <span className="text-[10px] text-slate-400">{fmtDate(ucc.filedDate)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </FeatureGate>
      )}

      {/* ============================================================ */}
      {/* D4. ADDRESS-LINKED ENTITIES */}
      {/* ============================================================ */}
      {entityIntel && entityIntel.addressLinkedEntities && entityIntel.addressLinkedEntities.length > 0 && (
        <FeatureGate feature="bp_corp_full" blur>
          <div className="p-4 bg-gradient-to-r from-slate-50 to-gray-50 rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">&#128205;</span>
              <span className="text-sm font-bold text-slate-900">Same-Address Entities</span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                {entityIntel.addressLinkedEntities.length} entities
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mb-2">Other entities registered at the same process address</p>
            <div className="space-y-1.5">
              {entityIntel.addressLinkedEntities.slice(0, 8).map((ent, i) => (
                <div key={i} className="flex items-center justify-between bg-white/60 rounded border border-slate-100 px-3 py-1.5">
                  <button
                    onClick={() => onNameClick?.(ent.name)}
                    className="text-xs font-medium text-slate-800 hover:text-violet-700 hover:underline text-left cursor-pointer truncate max-w-[220px]"
                  >
                    {ent.name}
                  </button>
                  <span className="text-[10px] text-slate-400 shrink-0 ml-2">DOS {ent.dosId}</span>
                </div>
              ))}
            </div>
          </div>
        </FeatureGate>
      )}

      {/* ============================================================ */}
      {/* E. ENHANCED PORTFOLIO */}
      {/* ============================================================ */}
      {portfolio && portfolio.properties.length > 0 && (
        <FeatureGate feature="bp_portfolio_deep" blur>
          <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg border border-emerald-100">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🏘️</span>
              <span className="text-sm font-bold text-slate-900">Owner Portfolio</span>
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                {portfolio.properties.length} properties
              </span>
              {portfolio.expandedNames && portfolio.expandedNames.length > 0 && (
                <span className="text-[10px] bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full font-medium">
                  +{portfolio.expandedNames.length} entity expansion
                </span>
              )}
            </div>

            {/* Summary bar */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-white/60 rounded px-2.5 py-1.5 text-center border border-emerald-100">
                <p className="text-sm font-bold text-slate-900">{portfolio.properties.length}</p>
                <p className="text-[9px] text-slate-400 uppercase">Properties</p>
              </div>
              <div className="bg-white/60 rounded px-2.5 py-1.5 text-center border border-emerald-100">
                <p className="text-sm font-bold text-slate-900">{(portfolio.totalUnits || 0).toLocaleString()}</p>
                <p className="text-[9px] text-slate-400 uppercase">Total Units</p>
              </div>
              <div className="bg-white/60 rounded px-2.5 py-1.5 text-center border border-emerald-100">
                <p className="text-sm font-bold text-slate-900">{(portfolio.totalAssessedValue || 0) > 0 ? "$" + ((portfolio.totalAssessedValue || 0) / 1_000_000).toFixed(1) + "M" : "—"}</p>
                <p className="text-[9px] text-slate-400 uppercase">Assessed Value</p>
              </div>
            </div>

            {/* Property rows */}
            <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
              {portfolio.properties.slice(0, showAllPortfolio ? 30 : 10).map((prop, i) => (
                <button
                  key={i}
                  onClick={() => onPropertyClick?.(prop.bbl, prop.address, prop.borough)}
                  className="w-full flex items-center justify-between bg-white/60 rounded border border-emerald-100 px-3 py-1.5 hover:bg-white/80 transition-colors text-left cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-800 truncate">
                      {prop.address || prop.bbl}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-slate-400">{prop.borough}</span>
                      {prop.units > 0 && (
                        <>
                          <span className="text-[10px] text-slate-300">·</span>
                          <span className="text-[10px] text-slate-400">{prop.units} units</span>
                        </>
                      )}
                      {prop.yearBuilt > 0 && (
                        <>
                          <span className="text-[10px] text-slate-300">·</span>
                          <span className="text-[10px] text-slate-400">{prop.yearBuilt}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {prop.assessedValue > 0 && (
                      <span className="text-[10px] text-slate-500 font-medium">{fmtPrice(prop.assessedValue)}</span>
                    )}
                    {prop.matchedVia && (
                    <span className={`text-[8px] px-1.5 py-0.5 rounded font-medium ${
                      prop.matchedVia === "ACRIS" ? "bg-blue-100 text-blue-600" :
                      prop.matchedVia === "PLUTO" ? "bg-slate-100 text-slate-500" :
                      prop.matchedVia === "HPD" ? "bg-orange-100 text-orange-600" :
                      "bg-violet-100 text-violet-600"
                    }`}>
                      {prop.matchedVia}
                    </span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {portfolio.properties.length > 10 && (
              <button
                onClick={() => setShowAllPortfolio(!showAllPortfolio)}
                className="mt-2 text-xs text-emerald-700 font-medium hover:underline cursor-pointer"
              >
                {showAllPortfolio ? "Show less" : `View all ${portfolio.properties.length} properties`}
              </button>
            )}
          </div>
        </FeatureGate>
      )}
    </div>
  );
}
