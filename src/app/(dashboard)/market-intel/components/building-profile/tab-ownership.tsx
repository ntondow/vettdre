"use client";

import { useState } from "react";
import OwnerCard from "./owner-card";
import OwnershipSection from "../../ownership-section";
import ContactIntelligenceSection from "../../contact-intelligence-section";
import FeatureGate from "@/components/ui/feature-gate";
import { fmtPhone, fmtDate } from "../../sections/format-utils";
import type { OwnershipChain, DeepEntityResult, PortfolioDiscovery } from "../../ownership-actions";

// ============================================================
// Collapsible Section wrapper (matches building-profile.tsx pattern)
// ============================================================
function Section({
  id, title, icon, badge, className, collapsed, onToggle, children,
}: {
  id: string; title: string; icon?: string; badge?: React.ReactNode;
  className?: string; collapsed: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className={className || "bg-white rounded-xl border border-slate-200"}>
      <button onClick={onToggle} className="w-full flex items-center justify-between p-5 text-left cursor-pointer">
        <div className="flex items-center gap-2">
          {icon && <span className="text-lg">{icon}</span>}
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {badge}
        </div>
        <span className={"text-slate-400 text-xs transition-transform duration-200 " + (collapsed ? "" : "rotate-90")}>&#9654;</span>
      </button>
      <div className={"grid transition-[grid-template-rows] duration-200 ease-out " + (collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]")}>
        <div className="overflow-hidden">
          <div className="px-5 pb-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Props
// ============================================================
interface TabOwnershipProps {
  pluto: any;
  intel: any;
  data: any;
  ownershipChain: OwnershipChain | null;
  entityIntel: DeepEntityResult | null;
  portfolioDiscovery: PortfolioDiscovery | null;
  contactEnrichment: any;
  contactEnrichmentLoading: boolean;
  ownershipDeepLoading: boolean;
  deepOwnershipStarted: boolean;
  skipTraceResult: any;
  skipTracing: boolean;
  loading: boolean;
  onSkipTrace: () => void;
  onLoadDeepAnalysis?: () => void;
  onNameClick?: (name: string) => void;
  onSmsClick: (phone: string, name?: string) => void;
  onPropertyClick?: (bbl: string, addr?: string, boro?: string) => void;
}

// ============================================================
// Source color helpers (for phone group badges)
// ============================================================
const sourceColors: Record<string, string> = {
  "DOB Permit": "bg-amber-100 text-amber-700",
  "DOB Job Filing": "bg-amber-100 text-amber-700",
  "DOB NOW Filing": "bg-amber-100 text-amber-700",
  "DOB NOW (Owner)": "bg-amber-100 text-amber-700",
  "HPD Agent/Manager": "bg-teal-100 text-teal-700",
  Apollo: "bg-orange-100 text-orange-700",
  "Apollo Org": "bg-orange-100 text-orange-700",
};

function getSourceColor(src: string): string {
  if (src.startsWith("PDL")) return "bg-blue-100 text-blue-700";
  if (src.startsWith("DOB")) return "bg-amber-100 text-amber-700";
  return sourceColors[src] || "bg-slate-100 text-slate-600";
}

// Grade-to-color mapping for Data Confidence Score
function gradeColor(grade: string): { bg: string; text: string; border: string } {
  switch (grade) {
    case "A": return { bg: "bg-gradient-to-r from-emerald-50 to-green-50", text: "text-emerald-700", border: "border-emerald-300" };
    case "B": return { bg: "bg-gradient-to-r from-blue-50 to-indigo-50", text: "text-blue-700", border: "border-blue-300" };
    case "C": return { bg: "bg-gradient-to-r from-amber-50 to-yellow-50", text: "text-amber-700", border: "border-amber-300" };
    case "D": return { bg: "bg-gradient-to-r from-orange-50 to-red-50", text: "text-orange-700", border: "border-orange-300" };
    default:  return { bg: "bg-gradient-to-r from-slate-50 to-gray-50", text: "text-red-700", border: "border-slate-200" };
  }
}

function gradeBadge(grade: string): string {
  switch (grade) {
    case "A": return "bg-emerald-200 text-emerald-800";
    case "B": return "bg-blue-200 text-blue-800";
    case "C": return "bg-amber-200 text-amber-800";
    case "D": return "bg-orange-200 text-orange-800";
    default:  return "bg-red-200 text-red-800";
  }
}

// ============================================================
// Component
// ============================================================
export default function TabOwnership({
  pluto,
  intel,
  data,
  ownershipChain,
  entityIntel,
  portfolioDiscovery,
  contactEnrichment,
  contactEnrichmentLoading,
  ownershipDeepLoading,
  deepOwnershipStarted,
  skipTraceResult,
  skipTracing,
  loading,
  onSkipTrace,
  onLoadDeepAnalysis,
  onNameClick,
  onSmsClick,
  onPropertyClick,
}: TabOwnershipProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    ownership: false,
    contacts: false,
    orgIntel: true,
  });
  const toggle = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  const isCollapsed = (key: string) => !!collapsed[key];

  const p = pluto;

  return (
    <div className="space-y-4">
      {/* ============================================================ */}
      {/* 1. OWNER CARD */}
      {/* ============================================================ */}
      <OwnerCard
        pluto={pluto}
        intel={intel}
        ownershipChain={ownershipChain}
        entityIntel={entityIntel}
        intelLoading={loading}
        onNameClick={onNameClick}
      />

      {/* ============================================================ */}
      {/* 2. AI OWNERSHIP ANALYSIS */}
      {/* ============================================================ */}
      {data?.hpdContacts?.length > 0 && (
        <Section
          id="ownership"
          title="AI Ownership Analysis"
          icon="&#129302;"
          badge={<span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Confidence Score</span>}
          className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200"
          collapsed={isCollapsed("ownership")}
          onToggle={() => toggle("ownership")}
        >
          {(() => {
            const contacts = data.hpdContacts || [];
            const owners = contacts.filter((c: any) => c.type === "IndividualOwner" || c.type === "CorporateOwner" || c.type === "HeadOfficer");
            const individuals = owners.filter((c: any) => c.type === "IndividualOwner" || c.type === "HeadOfficer");
            const corps = owners.filter((c: any) => c.type === "CorporateOwner");

            let bestOwner = "";
            let confidence = 0;
            const reasoning: string[] = [];

            if (individuals.length > 0) {
              bestOwner = (individuals[0].firstName + " " + individuals[0].lastName).trim();
              confidence = 75;
              reasoning.push("Named as " + individuals[0].type + " in HPD registration");
              if (data.ownerContacts?.some((oc: any) => oc.phone)) {
                confidence += 10;
                reasoning.push("Phone number found in DOB filings");
              }
              if (corps.length > 0) {
                reasoning.push("Controls via " + (corps[0].corporateName || "LLC"));
              }
              if (data.litigation?.length > 0) {
                const respondents = data.litigation.map((l: any) => l.respondent).filter(Boolean);
                if (respondents.some((r: string) => r.toUpperCase().includes(bestOwner.split(" ").pop()?.toUpperCase() || ""))) {
                  confidence += 10;
                  reasoning.push("Name matches litigation respondent");
                }
              }
            } else if (corps.length > 0) {
              bestOwner = corps[0].corporateName || "Unknown LLC";
              confidence = 55;
              reasoning.push("Only corporate owner registered — individual unknown");
              reasoning.push("Consider NYS Secretary of State search for LLC members");
            }

            if (p?.ownerName && bestOwner) {
              if (p.ownerName.toUpperCase().includes(bestOwner.split(" ").pop()?.toUpperCase() || "")) {
                confidence += 5;
                reasoning.push("Name aligns with PLUTO tax records");
              }
            }

            confidence = Math.min(95, confidence);

            return bestOwner ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs text-slate-500">Most Likely Owner</p>
                    <p className="text-base font-bold text-slate-900">{bestOwner}</p>
                  </div>
                  <div className={"text-right px-3 py-1.5 rounded-lg " + (
                    confidence >= 80 ? "bg-emerald-100" : confidence >= 60 ? "bg-amber-100" : "bg-slate-100"
                  )}>
                    <p className="text-[10px] text-slate-500 uppercase">Confidence</p>
                    <p className={"text-xl font-black " + (
                      confidence >= 80 ? "text-emerald-700" : confidence >= 60 ? "text-amber-700" : "text-slate-600"
                    )}>{confidence}%</p>
                  </div>
                </div>

                {/* Phone Rankings - Call Priority */}
                {(() => {
                  const phoneRankings = data.phoneRankings || [];
                  const bestAddr = individuals[0]
                    ? [individuals[0].businessAddress, individuals[0].businessCity, individuals[0].businessState].filter(Boolean).join(", ")
                    : "";
                  const primary = phoneRankings.find((pr: any) => pr.isPrimary);
                  const others = phoneRankings.filter((pr: any) => !pr.isPrimary);

                  return (phoneRankings.length > 0 || bestAddr) ? (
                    <div className="mt-2 mb-3 space-y-2">
                      {primary && (
                        <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full">Call First</span>
                            <span className="text-xs font-bold text-emerald-700">{primary.score}% confidence</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <a href={"tel:" + primary.phone} className="text-xl font-bold text-slate-900 hover:text-blue-600 transition-colors">
                              {fmtPhone(primary.phone)}
                            </a>
                            <a
                              href={"tel:" + primary.phone}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors"
                            >
                              Call Now
                            </a>
                          </div>
                          <p className="text-xs text-slate-500 mt-1.5">{primary.reason}</p>
                          {primary.names?.length > 0 && (
                            <p className="text-xs text-slate-600 mt-0.5">
                              Associated: {primary.names.join(", ")}
                            </p>
                          )}
                        </div>
                      )}
                      {others.length > 0 && (
                        <div className="bg-white/60 rounded-lg border border-emerald-100 p-3">
                          <p className="text-[10px] text-slate-400 uppercase font-medium mb-2">Other Numbers</p>
                          <div className="space-y-2">
                            {others.slice(0, 5).map((pr: any, i: number) => (
                              <div key={i} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className={"text-[10px] font-bold px-1.5 py-0.5 rounded " + (
                                    pr.score >= 80 ? "bg-emerald-100 text-emerald-700" :
                                    pr.score >= 50 ? "bg-amber-100 text-amber-700" :
                                    "bg-slate-100 text-slate-500"
                                  )}>{pr.score}%</span>
                                  <a href={"tel:" + pr.phone} className="text-sm font-bold text-slate-800 hover:text-blue-600">{fmtPhone(pr.phone)}</a>
                                </div>
                                <span className="text-[10px] text-slate-400 max-w-[200px] truncate text-right">{pr.reason}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {bestAddr && (
                        <div className="bg-white/60 rounded-lg border border-emerald-100 px-3 py-2">
                          <p className="text-[10px] text-slate-400 uppercase font-medium">Mailing Address</p>
                          <p className="text-sm text-slate-700 mt-0.5">{bestAddr}</p>
                        </div>
                      )}
                    </div>
                  ) : null;
                })()}

                <div className="space-y-1 mt-2">
                  {reasoning.map((r: string, i: number) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
                      <span className="text-emerald-500">&#10003;</span>
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No ownership data available for analysis.</p>
            );
          })()}

          {/* Data Confidence Score */}
          {data?.leadVerification?.confidenceScore && (() => {
            const cs = data.leadVerification.confidenceScore;
            const gc = gradeColor(cs.grade);
            return (
              <div className={`mt-4 rounded-lg border p-4 ${gc.bg} ${gc.border}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">&#128274;</span>
                    <span className="text-sm font-bold text-slate-900">Data Confidence Score</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`text-3xl font-black ${gc.text}`}>{cs.total}</div>
                    <div className={`text-xl font-black px-2 py-0.5 rounded ${gradeBadge(cs.grade)}`}>{cs.grade}</div>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mb-3 leading-relaxed">{cs.recommendation}</p>
                <div className="space-y-1.5">
                  {cs.factors?.map((f: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className={f.matched ? "text-emerald-500" : "text-slate-300"}>
                          {f.matched ? "\u2705" : "\u2B1C"}
                        </span>
                        <span className={f.matched ? "text-slate-700 font-medium" : "text-slate-400"}>{f.name}</span>
                        <span className="text-slate-400 text-[10px]">{f.source}</span>
                      </div>
                      <span className={f.matched ? "font-bold text-emerald-600" : "text-slate-300"}>
                        {f.matched ? `+${f.points}` : "0"}
                      </span>
                    </div>
                  ))}
                </div>
                {data.leadVerification.apollo && (
                  <div className="mt-3 pt-3 border-t border-slate-200/60">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">Apollo.io</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {data.leadVerification.apollo.title && (
                        <div>
                          <p className="text-slate-400">Title</p>
                          <p className="text-slate-900 font-medium">{data.leadVerification.apollo.title}</p>
                        </div>
                      )}
                      {data.leadVerification.apollo.organizationName && (
                        <div>
                          <p className="text-slate-400">Company</p>
                          <p className="text-slate-900 font-medium">{data.leadVerification.apollo.organizationName}</p>
                        </div>
                      )}
                      {data.leadVerification.apollo.linkedinUrl && (
                        <div className="col-span-2">
                          <a href={data.leadVerification.apollo.linkedinUrl} target="_blank" rel="noopener noreferrer"
                            className="text-blue-600 hover:underline">&#128279; LinkedIn Profile</a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Corporate Filing - NY DOS */}
          {data?.corporateIntel && (
            <FeatureGate feature="bp_corp_basic" blur>
              <div className="mt-4 rounded-lg border border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">&#127963;&#65039;</span>
                  <span className="text-sm font-bold text-slate-900">NY Corporate Filing</span>
                  <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">DOS</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                  <div>
                    <p className="text-slate-400">Entity Name</p>
                    <p className="text-slate-900 font-bold">{data.corporateIntel.entityName}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Entity Type</p>
                    <p className="text-slate-900 font-medium">{data.corporateIntel.entityType}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">DOS ID</p>
                    <p className="text-slate-900 font-medium">{data.corporateIntel.dosId}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Formation Date</p>
                    <p className="text-slate-900 font-medium">
                      {data.corporateIntel.filingDate ? fmtDate(data.corporateIntel.filingDate) : "\u2014"}
                    </p>
                  </div>
                </div>

                {/* Process Agent / Registered Agent */}
                <div className="bg-white/60 rounded-lg border border-violet-100 p-3 mb-3">
                  <p className="text-[10px] text-slate-400 uppercase font-medium mb-1">
                    {data.corporateIntel.registeredAgent ? "Registered Agent" : "Process Agent"}
                  </p>
                  <p className="text-sm font-bold text-slate-900">
                    {data.corporateIntel.registeredAgent || data.corporateIntel.processName || "\u2014"}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {data.corporateIntel.registeredAgentAddress || data.corporateIntel.processAddress || "\u2014"}
                  </p>
                </div>

                {/* Related Entities - Pro+ only */}
                {data.corporateIntel.totalRelatedEntities > 0 && (
                  <FeatureGate feature="bp_corp_full" blur>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] text-slate-400 uppercase font-medium">
                          Related Entities ({data.corporateIntel.totalRelatedEntities})
                        </p>
                      </div>
                      <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                        {data.corporateIntel.relatedEntities.slice(0, 10).map((e: any, i: number) => (
                          <div key={i} className="flex items-center justify-between bg-white/60 rounded border border-violet-100 px-3 py-1.5">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-slate-800 truncate">{e.name}</p>
                              <p className="text-[10px] text-slate-400">{e.entityType} · Filed {e.filingDate ? fmtDate(e.filingDate) : "\u2014"}</p>
                            </div>
                            <span className="text-[10px] text-violet-500 font-medium ml-2 shrink-0">DOS {e.dosId}</span>
                          </div>
                        ))}
                        {data.corporateIntel.totalRelatedEntities > 10 && (
                          <p className="text-[10px] text-slate-400 text-center py-1">
                            + {data.corporateIntel.totalRelatedEntities - 10} more entities
                          </p>
                        )}
                      </div>
                    </div>
                  </FeatureGate>
                )}
              </div>
            </FeatureGate>
          )}
        </Section>
      )}

      {/* ============================================================ */}
      {/* 3. DEEP OWNERSHIP INTELLIGENCE */}
      {/* ============================================================ */}
      {(ownershipChain || entityIntel || portfolioDiscovery || ownershipDeepLoading) && (
        <OwnershipSection
          chain={ownershipChain}
          entityIntel={entityIntel}
          portfolio={portfolioDiscovery}
          loading={ownershipDeepLoading}
          currentBBL={intel?.bbl || ""}
          assessedValue={intel?.financials?.assessedValue?.value}
          onPropertyClick={(bbl: string, addr: string, boro: string) => {
            onPropertyClick?.(bbl, addr, boro);
          }}
          onNameClick={onNameClick}
        />
      )}

      {/* ============================================================ */}
      {/* 4. CONTACT INTELLIGENCE (Enhanced Pipeline) */}
      {/* ============================================================ */}
      {(contactEnrichment || contactEnrichmentLoading) && (
        <ContactIntelligenceSection
          enrichment={contactEnrichment}
          loading={contactEnrichmentLoading}
          skipTraceResult={skipTraceResult}
          skipTracing={skipTracing}
          onSkipTrace={onSkipTrace}
          onNameClick={onNameClick}
          onSmsClick={onSmsClick}
        />
      )}

      {/* ============================================================ */}
      {/* 5. LEGACY CONTACT INTELLIGENCE (fallback) */}
      {/* ============================================================ */}
      {!contactEnrichment && (data?.ownerContacts?.length > 0 || data?.hpdContacts?.length > 0 || data?.rankedContacts?.length > 0) && (() => {
        const cleanPh = (ph: string) => ph.replace(/\D/g, "").slice(-10);

        // Merge ALL phone sources: DOB/HPD contacts, PDL phones, Apollo phone, Apollo org phone
        const phoneGroups = new Map<string, { phone: string; names: string[]; sources: string[]; addresses: string[]; count: number }>();

        const addPhone = (phone: string, name: string, source: string, address?: string) => {
          const key = cleanPh(phone);
          if (key.length < 7) return;
          if (!phoneGroups.has(key)) phoneGroups.set(key, { phone, names: [], sources: [], addresses: [], count: 0 });
          const g = phoneGroups.get(key)!;
          g.count++;
          if (name && !g.names.includes(name)) g.names.push(name);
          if (source && !g.sources.includes(source)) g.sources.push(source);
          if (address && !g.addresses.includes(address)) g.addresses.push(address);
        };

        // DOB/HPD owner contacts
        (data.ownerContacts || []).filter((c: any) => c.phone).forEach((c: any) => {
          addPhone(c.phone, c.name, c.source, c.address);
        });

        // PDL phones
        if (data.pdlEnrichment?.phones?.length) {
          const pdlName = data.pdlEnrichment.fullName || (data.pdlEnrichment.firstName
            ? [data.pdlEnrichment.firstName, data.pdlEnrichment.lastName].filter(Boolean).join(" ")
            : "");
          data.pdlEnrichment.phones.forEach((ph: any) => {
            addPhone(ph.number, pdlName, "PDL (" + (ph.type || "phone") + ")");
          });
        }

        // Apollo phone
        if (data.apolloEnrichment?.phone) {
          const apolloName = [data.apolloEnrichment.firstName, data.apolloEnrichment.lastName].filter(Boolean).join(" ");
          addPhone(data.apolloEnrichment.phone, apolloName, "Apollo");
        }

        // Apollo org phone
        if (data.apolloOrgEnrichment?.phone) {
          addPhone(data.apolloOrgEnrichment.phone, data.apolloOrgEnrichment.name || "", "Apollo Org");
        }

        const hpdOwners = (data.hpdContacts || [])
          .filter((c: any) => (c.type?.includes("Owner") || c.type?.includes("Head")) && c.businessAddress)
          .slice(0, 4);

        const dobNoPhone = (data.ownerContacts || [])
          .filter((c: any) => !c.phone && c.address)
          .slice(0, 2);

        return (
          <FeatureGate feature="bp_owner_contact" blur>
            <Section
              id="contacts"
              title="Contact Intelligence"
              icon="&#128222;"
              badge={
                <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full font-medium">
                  {phoneGroups.size} unique phone{phoneGroups.size !== 1 ? "s" : ""}
                </span>
              }
              className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200"
              collapsed={isCollapsed("contacts")}
              onToggle={() => toggle("contacts")}
            >
              <div className="space-y-3">
                {/* Deduplicated phone groups - all sources merged */}
                {Array.from(phoneGroups.values()).map((g, i) => (
                  <div key={"pg-" + i} className="bg-white rounded-lg border border-blue-100 p-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <a href={"tel:" + g.phone} className="text-lg font-bold text-slate-900 hover:text-blue-600">
                          {fmtPhone(g.phone)}
                        </a>
                        {g.sources.length > 1 && (
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                            {g.sources.length} sources
                          </span>
                        )}
                      </div>
                      <a
                        href={"tel:" + g.phone}
                        className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded hover:bg-emerald-100 transition-colors"
                      >
                        Call
                      </a>
                    </div>
                    <p className="text-sm text-slate-600">
                      {g.names.map((name, ni) => (
                        <span key={ni}>
                          {onNameClick ? (
                            <button onClick={() => onNameClick(name)} className="text-blue-600 hover:underline">{name}</button>
                          ) : name}
                          {ni < g.names.length - 1 && <span className="text-slate-300 mx-1">&middot;</span>}
                        </span>
                      ))}
                    </p>
                    {g.addresses[0] && <p className="text-xs text-slate-400 mt-1">{g.addresses[0]}</p>}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {g.sources.map((src, si) => (
                        <span key={si} className={"text-[9px] font-bold px-1.5 py-0.5 rounded " + getSourceColor(src)}>{src}</span>
                      ))}
                    </div>
                  </div>
                ))}

                {/* HPD owners without phone */}
                {hpdOwners.map((c: any, i: number) => (
                  <div key={"hpd-" + i} className="bg-white rounded-lg border border-blue-100 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={"text-xs font-bold px-2 py-0.5 rounded uppercase " + (
                        c.type?.includes("Owner") ? "text-blue-700 bg-blue-50" : "text-indigo-700 bg-indigo-50"
                      )}>{c.type || "Contact"}</span>
                      <span className="text-xs text-slate-400">HPD Registration</span>
                      <span className="text-[10px] text-slate-300">No phone</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 mt-1">
                      {onNameClick ? (
                        <button
                          onClick={() => onNameClick(c.corporateName || [c.firstName, c.lastName].filter(Boolean).join(" "))}
                          className="text-blue-600 hover:underline"
                        >
                          {c.corporateName || [c.firstName, c.lastName].filter(Boolean).join(" ")} &rarr;
                        </button>
                      ) : (
                        c.corporateName || [c.firstName, c.lastName].filter(Boolean).join(" ")
                      )}
                    </p>
                    {c.businessAddress && (
                      <p className="text-xs text-slate-500 mt-1">
                        {[c.businessAddress, c.businessCity, c.businessState, c.businessZip].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>
                ))}

                {/* DOB contacts without phone */}
                {dobNoPhone.map((c: any, i: number) => (
                  <div key={"dob-" + i} className="bg-white rounded-lg border border-slate-100 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded uppercase">Mailing Address</span>
                      <span className="text-xs text-slate-400">{c.source}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 mt-1">
                      {onNameClick ? (
                        <button onClick={() => onNameClick(c.name)} className="text-blue-600 hover:underline">{c.name} &rarr;</button>
                      ) : c.name}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{c.address}</p>
                  </div>
                ))}
              </div>

              {phoneGroups.size === 0 && (
                <p className="text-xs text-blue-500 mt-3 italic">No phone numbers found in public records.</p>
              )}

              {/* Smart Contact Directory */}
              {data?.rankedContacts?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-blue-200">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-bold text-slate-900">Contact Directory</span>
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">AI Ranked</span>
                  </div>
                  <div className="space-y-2">
                    {data.rankedContacts.slice(0, 8).map((contact: any, i: number) => (
                      <div
                        key={i}
                        className={"flex items-center justify-between p-2.5 rounded-lg border " + (
                          contact.phone ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-100"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={"text-[10px] font-bold px-1.5 py-0.5 rounded " + (
                              contact.score >= 80 ? "bg-emerald-100 text-emerald-700" :
                              contact.score >= 60 ? "bg-blue-100 text-blue-700" :
                              contact.score >= 40 ? "bg-amber-100 text-amber-700" :
                              "bg-slate-100 text-slate-600"
                            )}>{contact.role}</span>
                            <span className="text-[9px] text-slate-400">{contact.source}</span>
                          </div>
                          <p
                            className="text-sm font-semibold text-slate-900 mt-0.5 cursor-pointer hover:text-blue-600"
                            onClick={() => onNameClick?.(contact.name)}
                          >
                            {contact.name} &rarr;
                          </p>
                          {contact.address && <p className="text-[11px] text-slate-500 truncate">{contact.address}</p>}
                        </div>
                        <div className="text-right ml-3 flex-shrink-0">
                          {contact.phone ? (
                            <div className="flex items-center gap-1.5 justify-end">
                              <a href={"tel:" + contact.phone} className="text-sm font-bold text-emerald-700 hover:underline">
                                {fmtPhone(contact.phone)}
                              </a>
                              <button
                                onClick={() => onSmsClick(contact.phone, contact.name)}
                                className="p-1 text-blue-500 hover:bg-blue-50 rounded"
                                title="Send SMS"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                                  />
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400">No phone</span>
                          )}
                          {contact.email && (
                            <a
                              href={"mailto:" + contact.email}
                              className="block text-[11px] text-blue-600 hover:underline mt-0.5 truncate max-w-[200px]"
                            >
                              {contact.email}
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PDL Enrichment */}
              {data?.pdlEnrichment && !data.pdlEnrichment.error && (
                <div className="mt-4 pt-4 border-t border-blue-200">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">People Data Labs</span>
                    {data.pdlEnrichment.likelihood && (
                      <span className="text-[10px] text-slate-500">Match: {data.pdlEnrichment.likelihood}/10</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    {data.pdlEnrichment.phones?.length > 0 && (
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase">Phones</p>
                        {data.pdlEnrichment.phones.map((ph: any, i: number) => (
                          <a key={i} href={"tel:" + ph.number} className="block font-bold text-emerald-700 hover:underline">
                            {fmtPhone(ph.number)} <span className="text-[9px] text-slate-400 font-normal">{ph.type}</span>
                          </a>
                        ))}
                      </div>
                    )}
                    {data.pdlEnrichment.emails?.length > 0 && (
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase">Emails</p>
                        {data.pdlEnrichment.emails.map((em: string, i: number) => (
                          <a key={i} href={"mailto:" + em} className="block text-blue-600 hover:underline truncate">{em}</a>
                        ))}
                      </div>
                    )}
                    {data.pdlEnrichment.jobTitle && (
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase">Professional</p>
                        <p className="text-slate-900">
                          {data.pdlEnrichment.jobTitle}
                          {data.pdlEnrichment.jobCompany ? " @ " + data.pdlEnrichment.jobCompany : ""}
                        </p>
                      </div>
                    )}
                    {data.pdlEnrichment.linkedin && (
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase">LinkedIn</p>
                        <a
                          href={data.pdlEnrichment.linkedin.startsWith("http") ? data.pdlEnrichment.linkedin : "https://" + data.pdlEnrichment.linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline truncate block"
                        >
                          &#128279; {data.pdlEnrichment.linkedin.replace("https://www.linkedin.com/in/", "").replace(/\/$/, "")}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Skip Trace */}
              <div className="mt-4 pt-4 border-t border-blue-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">&#128269;</span>
                    <span className="text-sm font-bold text-slate-900">Skip Trace</span>
                    <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">Tracerfy</span>
                  </div>
                  {!skipTraceResult && (
                    <button
                      onClick={onSkipTrace}
                      disabled={skipTracing}
                      className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      {skipTracing ? "Searching..." : "Find Phone & Email ($0.02)"}
                    </button>
                  )}
                </div>
                {skipTracing && (
                  <div className="flex items-center gap-2 text-xs text-violet-600">
                    <div className="animate-spin rounded-full h-3 w-3 border-2 border-violet-600 border-t-transparent" />
                    <span>Searching databases for contact info... (up to 60s)</span>
                  </div>
                )}
                {skipTraceResult && !skipTraceResult.error && (
                  <div className="space-y-3">
                    {skipTraceResult.source && (
                      <div className="flex items-center gap-2">
                        <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full " + (
                          skipTraceResult.source === "PDL" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                        )}>
                          {skipTraceResult.source === "PDL" ? "People Data Labs" : "Tracerfy"}
                        </span>
                        {skipTraceResult.likelihood && (
                          <span className="text-[10px] text-slate-500">Match confidence: {skipTraceResult.likelihood}/10</span>
                        )}
                      </div>
                    )}
                    {skipTraceResult.phones?.length > 0 && (
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-medium mb-1">Phone Numbers</p>
                        <div className="space-y-1">
                          {skipTraceResult.phones.map((ph: any, i: number) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded">{ph.type}</span>
                              <a href={"tel:" + ph.number} className="text-sm font-bold text-slate-900 hover:text-blue-600">{fmtPhone(ph.number)}</a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {skipTraceResult.emails?.length > 0 && (
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-medium mb-1">Email Addresses</p>
                        <div className="space-y-1">
                          {skipTraceResult.emails.map((em: string, i: number) => (
                            <a key={i} href={"mailto:" + em} className="block text-sm font-medium text-blue-600 hover:underline">{em}</a>
                          ))}
                        </div>
                      </div>
                    )}
                    {skipTraceResult.jobTitle && (
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-medium mb-1">Professional Info</p>
                        <p className="text-sm text-slate-900 font-medium">
                          {skipTraceResult.jobTitle}
                          {skipTraceResult.jobCompany ? " at " + skipTraceResult.jobCompany : ""}
                        </p>
                      </div>
                    )}
                    {skipTraceResult.linkedin && (
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-medium mb-1">LinkedIn</p>
                        <a
                          href={skipTraceResult.linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                        >
                          &#128279; {skipTraceResult.linkedin.replace("https://www.linkedin.com/in/", "").replace(/\/$/, "")}
                        </a>
                      </div>
                    )}
                    {skipTraceResult.mailingAddress && (
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-medium mb-1">Mailing Address</p>
                        <p className="text-sm text-slate-700">{skipTraceResult.mailingAddress}</p>
                      </div>
                    )}
                    {skipTraceResult.phones?.length === 0 && skipTraceResult.emails?.length === 0 && (
                      <p className="text-xs text-slate-500">No additional contact info found via skip tracing.</p>
                    )}
                  </div>
                )}
                {skipTraceResult?.error && (
                  <p className="text-xs text-red-600">{skipTraceResult.error}</p>
                )}
                {!skipTraceResult && !skipTracing && (
                  <p className="text-xs text-slate-500">
                    Click the button to search for phone numbers and email addresses. Uses 1 credit ($0.02) per lookup.
                  </p>
                )}
              </div>

              {/* HPD Contacts directory */}
              {data?.hpdContacts?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-blue-200">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-bold text-slate-900">HPD Contacts</span>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                      {data.hpdContacts.length} registered
                    </span>
                  </div>
                  <div className="space-y-2">
                    {data.hpdContacts.map((c: any, i: number) => (
                      <div key={i} className="bg-white border border-slate-200 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className={"text-xs font-medium px-2 py-0.5 rounded mr-2 " + (
                              c.type?.includes("Owner") ? "bg-emerald-50 text-emerald-700" :
                              c.type?.includes("Head") ? "bg-blue-50 text-blue-700" :
                              c.type?.includes("Agent") ? "bg-amber-50 text-amber-700" :
                              "bg-slate-100 text-slate-600"
                            )}>{c.type || "Contact"}</span>
                            <span className="text-sm font-semibold text-slate-900">
                              {c.corporateName || [c.firstName, c.lastName].filter(Boolean).join(" ")}
                            </span>
                          </div>
                          {onNameClick && (
                            <button
                              onClick={() => onNameClick(c.corporateName || [c.firstName, c.lastName].filter(Boolean).join(" "))}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Search portfolio &rarr;
                            </button>
                          )}
                        </div>
                        {c.title && <p className="text-xs text-slate-500 mt-1">{c.title}</p>}
                        {c.businessAddress && (
                          <p className="text-xs text-slate-400 mt-1">
                            {[c.businessAddress, c.businessCity, c.businessState, c.businessZip].filter(Boolean).join(", ")}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Section>
          </FeatureGate>
        );
      })()}

      {/* ============================================================ */}
      {/* 6. ORGANIZATION INTELLIGENCE (Apollo) */}
      {/* ============================================================ */}
      {data?.apolloOrgEnrichment && (() => {
        const org = data.apolloOrgEnrichment;
        const keyPeople = data.apolloKeyPeople || [];
        const apolloPerson = data.apolloEnrichment;

        return (
          <Section
            id="orgIntel"
            title="Organization Intelligence"
            icon="&#127970;"
            badge={<span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">via Apollo.io</span>}
            className="bg-gradient-to-r from-indigo-50 to-violet-50 rounded-xl border border-indigo-200"
            collapsed={isCollapsed("orgIntel")}
            onToggle={() => toggle("orgIntel")}
          >
            <div className="space-y-4">
              {/* Org Header */}
              <div className="flex items-start gap-3">
                {org.logoUrl ? (
                  <img src={org.logoUrl} alt="" loading="lazy" width={40} height={40} className="w-10 h-10 rounded-lg object-contain border border-slate-200 bg-white" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm">
                    {(org.name || "?")[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900">{org.name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {org.industry && (
                      <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{org.industry}</span>
                    )}
                    {org.employeeCount != null && (
                      <span className="text-xs text-slate-500">
                        {typeof org.employeeCount === "number" ? org.employeeCount.toLocaleString() : org.employeeCount} employees
                      </span>
                    )}
                    {org.foundedYear && (
                      <span className="text-xs text-slate-400">Est. {org.foundedYear}</span>
                    )}
                  </div>
                  {org.revenue && (
                    <p className="text-xs text-slate-500 mt-1">
                      Revenue: <span className="font-semibold text-slate-700">{org.revenue}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Org Details Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {org.phone && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">&#128222;</span>
                    <a href={`tel:${org.phone}`} className="text-blue-600 hover:underline font-medium">{fmtPhone(org.phone)}</a>
                  </div>
                )}
                {org.website && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">&#127760;</span>
                    <a
                      href={org.website.startsWith("http") ? org.website : "https://" + org.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline truncate"
                    >
                      {org.website.replace(/^https?:\/\//, "")}
                    </a>
                  </div>
                )}
                {org.address && (
                  <div className="flex items-center gap-1.5 col-span-2">
                    <span className="text-slate-400">&#128205;</span>
                    <span className="text-slate-600">{org.address}</span>
                  </div>
                )}
                {org.linkedinUrl && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">&#128279;</span>
                    <a href={org.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">LinkedIn</a>
                  </div>
                )}
              </div>

              {org.shortDescription && (
                <p className="text-xs text-slate-500 italic leading-relaxed">{org.shortDescription}</p>
              )}

              {/* Key People */}
              {(keyPeople.length > 0 || apolloPerson) && (
                <div className="pt-3 border-t border-indigo-200">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2">Key People</p>
                  <div className="space-y-2">
                    {/* Primary enriched person first */}
                    {apolloPerson && (
                      <div className="bg-white border border-indigo-200 rounded-lg p-3">
                        <div className="flex items-start gap-3">
                          {apolloPerson.photoUrl ? (
                            <img src={apolloPerson.photoUrl} alt="" loading="lazy" width={32} height={32} className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                              {(apolloPerson.firstName || "?")[0]}{(apolloPerson.lastName || "?")[0]}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">
                                {apolloPerson.firstName} {apolloPerson.lastName}
                              </span>
                              <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">ENRICHED</span>
                            </div>
                            {apolloPerson.title && <p className="text-xs text-slate-500 mt-0.5">{apolloPerson.title}</p>}
                            <div className="flex items-center gap-3 mt-1.5 text-xs">
                              {apolloPerson.email && (
                                <a href={`mailto:${apolloPerson.email}`} className="text-blue-600 hover:underline">{apolloPerson.email}</a>
                              )}
                              {apolloPerson.phone && (
                                <a href={`tel:${apolloPerson.phone}`} className="text-emerald-700 font-bold hover:underline">
                                  {fmtPhone(apolloPerson.phone)}
                                </a>
                              )}
                              {apolloPerson.linkedinUrl && (
                                <a href={apolloPerson.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                  &#128279; LinkedIn
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Other key people from search */}
                    {keyPeople
                      .filter((kp: any) => {
                        if (!apolloPerson) return true;
                        return (
                          kp.firstName.toLowerCase() !== apolloPerson.firstName?.toLowerCase() ||
                          kp.lastName.toLowerCase() !== apolloPerson.lastName?.toLowerCase()
                        );
                      })
                      .map((kp: any, i: number) => (
                        <div key={i} className="bg-white border border-slate-200 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-sm font-medium text-slate-900">{kp.firstName} {kp.lastName}</span>
                              {kp.title && <span className="text-xs text-slate-400 ml-2">{kp.title}</span>}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {kp.hasEmail && <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">&#128231;</span>}
                              {kp.hasPhone && <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-medium">&#128222;</span>}
                            </div>
                          </div>
                          {kp.seniority && <p className="text-[10px] text-slate-400 mt-0.5">{kp.seniority}</p>}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </Section>
        );
      })()}
    </div>
  );
}
