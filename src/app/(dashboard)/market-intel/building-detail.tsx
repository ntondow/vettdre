"use client";

import { useState, useEffect } from "react";
import { enrichBuilding } from "./enrichment";
import { buildOwnershipGraph } from "./graph-engine";
import BuildingProfile from "./building-profile";
import { analyzeOwnership } from "./ai-analysis";
import { addBuildingToList } from "../prospecting/actions";
import { getLists } from "../prospecting/actions";

interface Props {
  building: any;
  onClose: () => void;
  onNameClick?: (name: string) => void;
}

const fmtPrice = (n: number | null) => (n && n > 0 ? `$${n.toLocaleString()}` : "—");
const fmtDate = (d: string | null) => {
  if (!d || d === "current") return d === "current" ? "Current" : "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(d));
  } catch {
    return d;
  }
};

function ConfidenceBadge({ score }: { score: number }) {
  const color =
    score >= 75
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : score >= 50
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : score >= 25
      ? "bg-orange-100 text-orange-800 border-orange-200"
      : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${color}`}>
      {score}%
    </span>
  );
}

export default function BuildingDetail({ building, onClose, onNameClick }: Props) {
  const [enrichment, setEnrichment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"owners" | "transactions" | "details" | "portfolio">("owners");
  const [saveModal, setSaveModal] = useState(false);
  const [lists, setLists] = useState<any[]>([]);
  const [saved, setSaved] = useState(false);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [viewingProperty, setViewingProperty] = useState<any>(null);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [loadingAI, setLoadingAI] = useState(false);

  useEffect(() => {
    const doEnrich = async () => {
      setLoading(true);
      setError(null);
      setPortfolio(null);
      try {
        const data = await enrichBuilding({
          block: building.block,
          lot: building.lot,
          boro: building.boro || building.borough || "",
          address: building.address,
          ownerNamePluto: building.ownerNamePluto,
          owners: building.owners,
          totalUnits: building.totalUnits,
          yearBuilt: building.yearBuilt,
          assessedValue: building.assessedValue,
        });
        setEnrichment(data);

        // Auto-trigger AI analysis
        if (data.candidates && data.candidates.length > 0) {
          setLoadingAI(true);
          analyzeOwnership(
            {
              address: building.address,
              block: building.block,
              lot: building.lot,
              boro: building.boro || building.borough || "",
              totalUnits: building.totalUnits,
              yearBuilt: building.yearBuilt,
              assessedValue: building.assessedValue,
              numFloors: building.numFloors,
              bldgArea: building.bldgArea,
              zoneDist: building.zoneDist,
            },
            data.candidates,
            data.transactions,
            data.nysEntities,
          ).then(result => {
            if (result.summary) setAiAnalysis(result.summary);
            setLoadingAI(false);
          }).catch(() => setLoadingAI(false));
        }

        // Auto-trigger graph-based portfolio discovery
        if (building.block && building.lot) {
          setLoadingPortfolio(true);
          try {
            const boroMap: Record<string, string> = {"MANHATTAN":"1","BRONX":"2","BROOKLYN":"3","QUEENS":"4","STATEN ISLAND":"5","1":"1","2":"2","3":"3","4":"4","5":"5"};
            const boroCode = boroMap[(building.boro || building.borough || "").toUpperCase()] || "3";
            const graphPromise = buildOwnershipGraph(building.block, building.lot, boroCode, 1);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 30000));
            const graphResult = await Promise.race([graphPromise, timeoutPromise]) as any;
            const currentBBL = boroCode + "-" + building.block + "-" + building.lot;
            graphResult.properties = graphResult.properties.filter((p: any) => p.bbl !== currentBBL);
            setPortfolio(graphResult);
          } catch (err) {
            console.error("Graph engine error:", err);
          } finally {
            setLoadingPortfolio(false);
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    doEnrich();
  }, [building]);

  const handleSave = async (listId: string) => {
    const topOwner = enrichment?.candidates?.[0];
    await addBuildingToList(listId, {
      address: building.address,
      borough: building.boro || null,
      zip: building.zip || null,
      block: building.block || null,
      lot: building.lot || null,
      bin: building.bin || null,
      totalUnits: building.totalUnits || null,
      residentialUnits: building.residentialUnits || null,
      yearBuilt: building.yearBuilt || null,
      numFloors: building.numFloors || null,
      buildingArea: building.bldgArea || null,
      lotArea: building.lotArea || null,
      buildingClass: building.buildingClass || null,
      zoning: building.zoneDist || null,
      assessedValue: building.assessedValue || null,
      ownerName: topOwner?.name || building.ownerNamePluto || null,
      ownerAddress: topOwner?.contactInfo?.[0]?.value || null,
      lastSalePrice: building.lastSalePrice || null,
      lastSaleDate: building.lastSaleDate || null,
    });
    setSaved(true);
    setSaveModal(false);
    setTimeout(() => setSaved(false), 3000);
  };

  const openSaveModal = async () => {
    const data = await getLists();
    setLists(JSON.parse(JSON.stringify(data)));
    setSaveModal(true);
  };

  return (
    <div>
      <button onClick={onClose} className="text-sm text-blue-600 font-medium mb-4">
        &larr; Back to results
      </button>

      {/* Building Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{building.address}</h2>
            <p className="text-base text-slate-500 mt-1">
              {building.boro} • ZIP: {building.zip} • Block {building.block}, Lot{" "}
              {building.lot}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={openSaveModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
            >
              🎯 Save to List
            </button>
          </div>
        </div>
        <div className="grid grid-cols-6 gap-4 mt-5 pt-5 border-t border-slate-100">
          <div>
            <p className="text-xs text-slate-400 uppercase">Units</p>
            <p className="text-lg font-semibold">{building.totalUnits || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase">Floors</p>
            <p className="text-lg font-semibold">{building.numFloors || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase">Year Built</p>
            <p className="text-lg font-semibold">{building.yearBuilt || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase">Building Area</p>
            <p className="text-lg font-semibold">
              {building.bldgArea > 0 ? building.bldgArea.toLocaleString() + " sf" : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase">Zoning</p>
            <p className="text-lg font-semibold">{building.zoneDist || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase">Assessed Value</p>
            <p className="text-lg font-semibold">
              {building.assessedValue > 0 ? fmtPrice(building.assessedValue) : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Save Modal */}
      {saveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h2 className="text-base font-semibold">Save to List</h2>
              <button onClick={() => setSaveModal(false)} className="text-slate-400 text-xl">
                &times;
              </button>
            </div>
            <div className="p-4">
              {lists.length > 0 ? (
                <div className="space-y-2">
                  {lists.map((list: any) => (
                    <button
                      key={list.id}
                      onClick={() => handleSave(list.id)}
                      className="w-full text-left p-3 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50"
                    >
                      <span className="text-sm font-medium">{list.name}</span>
                      <span className="text-xs text-slate-400 ml-2">{list._count.items} items</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-4">
                  No lists yet.{" "}
                  <a href="/prospecting" className="text-blue-600 hover:underline">
                    Create one
                  </a>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Saved Toast */}
      {saved && (
        <div className="fixed top-4 right-4 bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg z-50">
          ✓ Saved to list
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mb-4"></div>
          <p className="text-sm text-slate-500">
            Analyzing ownership across ACRIS, HPD, PLUTO, and NYS databases...
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {/* Results */}
      {enrichment && !loading && (
        <>
          {/* AI Analysis Card */}
          {(loadingAI || aiAnalysis) && (
            <div className="bg-white rounded-xl border border-slate-200 mb-4 overflow-hidden">
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-4 border-b border-amber-100 flex items-center gap-2">
                <span className="text-lg">✨</span>
                <h3 className="text-base font-bold text-slate-900">AI Owner Analysis</h3>
                <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full font-medium ml-1">Claude</span>
              </div>
              {loadingAI && !aiAnalysis ? (
                <div className="p-6 flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-amber-600 border-t-transparent"></div>
                  <p className="text-sm text-slate-500">Analyzing ownership data...</p>
                </div>
              ) : aiAnalysis ? (
                <div className="p-6">
                  {/* Top summary row */}
                  <div className="grid grid-cols-3 gap-4 mb-5">
                    <div className="bg-slate-50 rounded-lg p-4">
                      <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Most Likely Owner</p>
                    <p className="text-base font-bold text-slate-900">{aiAnalysis.likelyOwner}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={"text-xs font-medium px-1.5 py-0.5 rounded " + (
                          aiAnalysis.ownerType === "Individual" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
                        )}>{aiAnalysis.ownerType}</span>
                        <span className={"text-xs font-medium px-1.5 py-0.5 rounded " + (
                          aiAnalysis.confidence === "High" ? "bg-emerald-50 text-emerald-700" :
                          aiAnalysis.confidence === "Medium" ? "bg-amber-50 text-amber-700" :
                          "bg-red-50 text-red-700"
                        )}>{aiAnalysis.confidence} confidence</span>
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4">
                      <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Ownership Structure</p>
                      <p className="text-sm font-medium text-slate-800">{aiAnalysis.ownershipStructure}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4">
                      <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Portfolio Size</p>
                      <p className="text-2xl font-bold text-slate-900">{aiAnalysis.portfolioSize}</p>
                      <p className="text-xs text-slate-500">properties connected</p>
                    </div>
                  </div>

                  {/* Contact & Transaction row */}
                  <div className="grid grid-cols-2 gap-4 mb-5">
                    <div className="border border-slate-200 rounded-lg p-4">
                      <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Best Contact</p>
                      <p className="text-sm font-medium text-slate-900">📍 {aiAnalysis.bestContactAddress || "Not available"}</p>
                    {aiAnalysis.bestContactSource && <p className="text-xs text-slate-400 mt-1">Source: {aiAnalysis.bestContactSource}</p>}
                    </div>
                    <div className="border border-slate-200 rounded-lg p-4">
                      <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Last Transaction</p>
                      <p className="text-sm font-medium text-slate-900">{aiAnalysis.lastTransaction || "No records"}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        {aiAnalysis.lastTransactionDate && <span>{aiAnalysis.lastTransactionDate}</span>}
                        {aiAnalysis.lastTransactionAmount && <span className="font-semibold text-slate-700">{aiAnalysis.lastTransactionAmount}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Names & Entities */}
                  <div className="grid grid-cols-2 gap-4 mb-5">
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Key People</p>
                      <div className="space-y-1">
                        {(aiAnalysis.keyNames || []).map((name: string, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">👤</span>
                            {onNameClick ? (
                              <button onClick={() => onNameClick(name)} className="text-sm text-blue-600 hover:underline font-medium">{name} →</button>
                            ) : (
                              <span className="text-sm text-slate-700 font-medium">{name}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Associated Ents</p>
                      <div className="space-y-1">
                        {(aiAnalysis.keyEntities || []).map((ent: string, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">🏢</span>
                            {onNameClick ? (
                              <button onClick={() => onNameClick(ent)} className="text-sm text-indigo-600 hover:underline font-medium">{ent} →</button>
                            ) : (
                              <span className="text-sm text-slate-700 font-medium">{ent}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Common Address */}
                  {aiAnalysis.commonAddress && (
                    <div className="mb-5">
                      <p className="text-xs text-slate-400 uppercase tracking-wider1">Most Common Business Address</p>
                      <p className="text-sm text-slate-700">📍 {aiAnalysis.commonAddress}</p>
                    </div>
                  )}

                  {/* Insights */}
                  {aiAnalysis.insights && aiAnalysis.insights.length > 0 && (
                    <div className="bg-amber-50 rounded-lg p-4">
                      <p className="text-xs text-amber-700 font-semibold uppercase tracking-wider mb-2">Key Insights</p>
                      <div className="space-y-1.5">
                        {aiAnalysis.insights.map((insight: string, i: number) => (
                          <p key={i} className="text-sm text-amber-900 flex gap-2">
                            <span className="flex-shrink-0">→</span>
                            <span>{insight}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>       )}

          {/* AI Owner Intelligence Card */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6 mb-4">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">🧠</span>
              <h3 className="text-base font-bold text-slate-900">AI Owner Intelligence</h3>
              <span className="text-xs text-slate-400 ml-auto">
                {enrichment.dataSources.acrisDocs} ACRIS docs •{" "}
                {enrichment.dataSources.hpdContacts} HPD contacts •{" "}
                {enrichment.dataSources.nysEntities} NYS entities
                {portfolio && portfolio.properties.length > 0 && (
                  <span className="ml-2 text-indigo-600 font-semibold">
                    • {portfolio.properties.length} other properties found
                  </span>
                )}
              </span>
            </div>

            {enrichment.candidates.length > 0 ? (
              <div className="space-y-4">
                {enrichment.candidates.slice(0, 5).map((c: any, i: number) => (
                  <div
                    key={i}
                    className={`bg-white rounded-lg border p-4 ${
                      i === 0 ? "border-blue-300 shadow-sm" : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                            i === 0
                              ? "bg-blue-600 text-white"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {i + 1}
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-slate-900">
                            {onNameClick ? (
                              <button onClick={() => onNameClick(c.name)} className="hover:text-blue-600 hover:underline">
                                {c.name} →
                              </button>
                            ) : c.name}
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {c.isEntity ? "🏢 Entity" : "👤 Individual"} •{" "}
                            {c.signals.length} signals •{" "}
                            {new Set(c.signals.map((s: any) => s.source)).size} sources
                          </p>
                        </div>
                      </div>
                      <ConfidenceBadge score={c.confidence} />
                    </div>

                    {/* Recommendation */}
                    <p className="text-sm text-slate-700 mt-3 bg-slate-50 rounded-lg p-3">
                      {c.recommendation}
                    </p>

                    {/* Contact Info */}
                    {c.contactInfo.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                          Contact Information
                        </p>
                        {c.contactInfo.map((ci: any, j: number) => (
                          <div
                            key={j}
                            className="flex items-start gap-2 text-sm text-slate-700 mt-1"
                          >
                            <span className="text-slate-400 flex-shrink-0">📍</span>
                            <div>
                              <span>{ci.value}</span>
                              <span className="text-xs text-slate-400 ml-2">
                                via {ci.source}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Linked Entities */}
                    {c.linkedEntities.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                          Linked Entities
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {c.linkedEntities.map((le: string, j: number) => (
                            <button
                              key={j}
                              onClick={() => onNameClick?.(le)}
                              className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded hover:bg-indigo-100 hover:underline"
                            >
                              {le} →
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Evidence */}
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        Evidence Trail
                      </p>
                      <div className="space-y-1">
                        {c.signals.map((s: any, j: number) => (
                          <div key={j} className="flex items-center gap-2 text-xs">
                            <span
                              className={`px-1.5 py-0.5 rounded font-medium ${
                                s.source === "ACRIS"
                                  ? "bg-purple-50 text-purple-700"
                                  : s.source === "HPD"
                                  ? "bg-blue-50 text-blue-700"
                                  : s.source === "PLUTO"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-indigo-50 text-indigo-700"
                              }`}
                            >
                              {s.source}
                            </span>
                            <span className="text-slate-600">{s.role}</span>
                            {s.detail && (
                              <span className="text-slate-400">{s.detail}</span>
                            )}
                            <span className="text-slate-400 ml-auto">
                              {fmtDate(s.date)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 bg-white rounded-lg p-4">
                No ownership candidates found. This property may not have recent ACRIS filings.
              </p>
            )}
          </div>

          {/* Tabs: Transactions & Details */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="flex border-b border-slate-200">
              <button
                onClick={() => setActiveTab("transactions")}
                className={`px-5 py-3 text-sm font-medium border-b-2 ${
                  activeTab === "transactions"
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-slate-500"
                }`}
              >
                📜 Transactions ({enrichment.transactions.length})
              </button>
              <button
                onClick={() => setActiveTab("portfolio")}
                className={`px-5 py-3 text-sm font-medium border-b-2 ${
                  activeTab === "portfolio"
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-slate-500"
                }`}
              >
                🏘️ Portfolio ({loadingPortfolio ? "..." : portfolio?.properties?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab("details")}
                className={`px-5 py-3 text-sm font-medium border-b-2 ${
                  activeTab === "details"
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-slate-500"
                }`}
              >
                🏛️ NYS Entities ({enrichment.nysEntities.length})
              </button>
            </div>

            <div className="p-5">
              {activeTab === "transactions" && (
                <>
                  {enrichment.transactions.length > 0 ? (
                    <div className="space-y-3">
                      {enrichment.transactions.map((t: any, i: number) => (
                        <div key={i} className="border border-slate-200 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                  t.docType === "DEED"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : t.docType === "MTGE"
                                    ? "bg-blue-50 text-blue-700"
                                    : "bg-amber-50 text-amber-700"
                                }`}
                              >
                                {t.docType}
                              </span>
                              <span className="text-xs text-slate-500">
                                {fmtDate(t.recordedDate)}
                              </span>
                            </div>
                            {t.amount > 0 && (
                              <span className="text-sm font-semibold">{fmtPrice(t.amount)}</span>
                            )}
                          </div>
                          {t.parties.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {t.parties.map((p: any, pi: number) => (
                                <div key={pi} className="flex items-start gap-2">
                                  <span
                                    className={`text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${
                                      p.partyType === "Grantee"
                                        ? "bg-emerald-50 text-emerald-700"
                                        : "bg-slate-100 text-slate-600"
                                    }`}
                                  >
                                    {p.partyType === "Grantee" ? "TO" : "FROM"}
                                  </span>
                                  <div>
                                    <span className="text-sm font-medium text-slate-900">
                                      {p.name}
                                    </span>
                                    {(p.address1 || p.city) && (
                                      <p className="text-xs text-slate-400">
                                        {[p.address1, p.address2, p.city, p.state, p.zip]
                                          .filter(Boolean)
                                          .join(", ")}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 text-center py-8">
                      No ACRIS transaction records found.
                    </p>
                  )}
                </>
              )}

              {activeTab === "portfolio" && (
                <>
                  {viewingProperty && (
                    <BuildingProfile
                      boroCode={viewingProperty.boroCode}
                      block={viewingProperty.block}
                      lot={viewingProperty.lot}
                      address={viewingProperty.address}
                      borough={viewingProperty.borough}
                      ownerName={viewingProperty.ownerName || viewingProperty.ownerNamePluto}
                      connectedVia={viewingProperty.connectedVia}
                      onClose={() => setViewingProperty(null)}
                      onNameClick={(name) => { setViewingProperty(null); if (onNameClick) onNameClick(name); }}
                    />
                  )}
                  {loadingPortfolio ? (
                    <div className="text-center py-8">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-4 border-indigo-600 border-t-transparent mb-3"></div>
                      <p className="text-sm text-slate-500">Discovering portfolio across ACRIS & HPD records...</p>
                    </div>
                  ) : portfolio && portfolio.properties.length > 0 ? (
                    <div>
                      <div className="bg-indigo-50 rounded-lg p-3 mb-4">
                        <p className="text-sm text-indigo-800 font-medium">
                          Found {portfolio.properties.length} other properties in this ownership network
                        </p>
                        <p className="text-xs text-indigo-600 mt-1">
                          Graph: {portfolio.graph?.nodes || 0} nodes, {portfolio.graph?.edges || 0} edges
                        </p>
                      </div>
                      <div className="space-y-3">
                        {portfolio.properties.map((p: any, i: number) => (
                          <div key={i} className="border border-slate-200 rounded-lg p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="text-sm font-semibold text-slate-900">
                                  {p.address || `Block ${p.block}, Lot ${p.lot}`}
                                </h4>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {p.borough} • Block {p.block}, Lot {p.lot}
                                </p>
                              </div>
                              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                                via {p.matchedVia}
                              </span>
                            </div>
                            {p.documents.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {p.documents.slice(0, 3).map((doc: any, di: number) => (
                                  <div key={di} className="flex items-center gap-2 text-xs">
                                    <span className={`px-1.5 py-0.5 rounded font-medium ${
                                      doc.docType === "DEED" ? "bg-emerald-50 text-emerald-700" :
                                      doc.docType === "MTGE" ? "bg-blue-50 text-blue-700" :
                                      doc.docType === "HPD" ? "bg-purple-50 text-purple-700" :
                                      "bg-amber-50 text-amber-700"
                                    }`}>{doc.docType}</span>
                                    <span className={`px-1.5 py-0.5 rounded ${
                                      doc.role === "Grantee" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                                    }`}>{doc.role === "Grantee" ? "BUYER" : doc.role === "Grantor" ? "SELLER" : doc.role}</span>
                                    {doc.amount > 0 && <span className="font-semibold text-slate-700">{fmtPrice(doc.amount)}</span>}
                                    {doc.recordedDate && <span className="text-slate-400">{fmtDate(doc.recordedDate)}</span>}
                                    {doc.name && onNameClick && (
                                      <button onClick={() => onNameClick(doc.name)} className="text-blue-600 hover:underline ml-auto">{doc.name} →</button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 text-center py-8">
                      No additional properties found for this owner.
                    </p>
                  )}
                </>
              )}

              {activeTab === "details" && (
                <>
                  {enrichment.nysEntities.length > 0 ? (
                    <div className="space-y-3">
                      {enrichment.nysEntities.map((e: any, i: number) => (
                        <div key={i} className="border border-slate-200 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-900">
                              {e.corpName}
                            </span>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                  e.nameStatus === "Active"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-red-50 text-red-700"
                                }`}
                              >
                                {e.nameStatus}
                              </span>
                              {e.corpId && (
                                <span className="text-xs text-slate-400">
                                  DOS ID: {e.corpId}
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Filed: {fmtDate(e.dateFiled)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 text-center py-8">
                      No NYS entity records found.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-400 mt-4 text-center">
            Data: ACRIS, HPD, PLUTO, NYS Dept. of State via NYC/NYS Open Data
          </p>
        </>
      )}
    </div>
  );
}
