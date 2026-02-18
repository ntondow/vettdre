"use client";

import { useState } from "react";
import { lookupProperty, searchOwnership } from "./actions";
import { addBuildingToList } from "../prospecting/actions";
import { getLists } from "../prospecting/actions";

type MainTab = "property" | "ownership";
type View = "results" | "building";

export default function MarketIntelSearch() {
  const [mainTab, setMainTab] = useState<MainTab>("property");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [propResults, setPropResults] = useState<any | null>(null);
  const [view, setView] = useState<View>("results");
  const [selectedBuilding, setSelectedBuilding] = useState<any | null>(null);
  const [detailTab, setDetailTab] = useState<"sales" | "permits" | "violations">("sales");
  const [ownerResults, setOwnerResults] = useState<any | null>(null);
  const [expandedOwner, setExpandedOwner] = useState<number | null>(null);
  const [prospectLists, setProspectLists] = useState<any[]>([]);
  const [saveModal, setSaveModal] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const fmtPrice = (n: number) => (n > 0 ? `$${n.toLocaleString()}` : "—");

  const fmtDate = (d: string | null) => {
    if (!d) return "—";
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

  const loadLists = async () => {
    try { const lists = await getLists(); setProspectLists(JSON.parse(JSON.stringify(lists))); } catch {}
  };

  const handleSaveToList = async (listId: string, building: any) => {
    setSaving(true);
    try {
      await addBuildingToList(listId, {
        address: building.address || building.streetAddress || "",
        borough: building.borough || building.boro || null,
        zip: building.zip || building.zipCode || null,
        block: building.block || null,
        lot: building.lot || null,
        bin: building.bin || null,
        totalUnits: building.totalUnits || null,
        residentialUnits: building.residentialUnits || null,
        yearBuilt: building.yearBuilt || null,
        numFloors: building.numFloors || null,
        buildingArea: building.bldgArea || building.buildingArea || null,
        lotArea: building.lotArea || null,
        buildingClass: building.buildingClass || null,
        zoning: building.zoneDist || building.zoning || null,
        assessedValue: building.assessedValue || null,
        ownerName: building.ownerNamePluto || building.ownerName || (building.owners?.length > 0 ? (building.owners[0].corporateName || building.owners[0].firstName + " " + building.owners[0].lastName).trim() : null),
        ownerAddress: building.owners?.length > 0 ? [building.owners[0].businessAddress, building.owners[0].businessCity, building.owners[0].businessState].filter(Boolean).join(", ") : null,
        lastSalePrice: building.lastSalePrice || null,
        lastSaleDate: building.lastSaleDate || null,
      });
      setSavedMsg("Saved!");
      setTimeout(() => setSavedMsg(null), 2000);
      setSaveModal(null);
    } catch (err) {
      console.error(err);
    } finally { setSaving(false); }
  };

  const handlePropertySearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setView("results");
    setSelectedBuilding(null);
    try {
      setPropResults(await lookupProperty(new FormData(e.currentTarget)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOwnershipSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setExpandedOwner(null);
    try {
      setOwnerResults(await searchOwnership(new FormData(e.currentTarget)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="px-8 py-5 flex items-center gap-3">
          <span className="text-2xl">🔍</span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Market Intelligence</h1>
            <p className="text-sm text-slate-500">
              NYC property records & ownership data — powered by NYC Open Data
            </p>
          </div>
        </div>
        <div className="px-8 flex gap-0">
          <button
            onClick={() => setMainTab("property")}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              mainTab === "property"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            🏠 Property Search
          </button>
          <button
            onClick={() => setMainTab("ownership")}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              mainTab === "ownership"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            👤 Ownership Lookup
          </button>
        </div>
      </div>

      <div className="px-8 py-6">
        {/* Save to List Modal */}
        {saveModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
              <div className="flex items-center justify-between p-4 border-b border-slate-200">
                <h2 className="text-base font-semibold text-slate-900">Save to Prospecting List</h2>
                <button onClick={() => setSaveModal(null)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
              </div>
              <div className="p-4">
                <p className="text-sm text-slate-500 mb-3">{saveModal.address}</p>
                {prospectLists.length > 0 ? (
                  <div className="space-y-2">
                    {prospectLists.map((list: any) => (
                      <button key={list.id} onClick={() => handleSaveToList(list.id, saveModal)}
                        disabled={saving}
                        className="w-full text-left p-3 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                        <span className="text-sm font-medium text-slate-900">{list.name}</span>
                        <span className="text-xs text-slate-400 ml-2">{list._count.items} items</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-4">No lists yet. <a href="/prospecting" className="text-blue-600 hover:underline">Create one first</a></p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Saved Toast */}
        {savedMsg && (
          <div className="fixed top-4 right-4 bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg z-50">
            {savedMsg}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        {/* ======================== PROPERTY TAB ======================== */}
        {mainTab === "property" && (
          <>
            <form onSubmit={handlePropertySearch} className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Street address *</label>
                  <input
                    name="address"
                    required
                    placeholder="e.g., 350 Park Avenue"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="w-48">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Borough *</label>
                  <select
                    name="borough"
                    required
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select...</option>
                    <option value="Manhattan">Manhattan</option>
                    <option value="Brooklyn">Brooklyn</option>
                    <option value="Queens">Queens</option>
                    <option value="Bronx">Bronx</option>
                    <option value="Staten Island">Staten Island</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                  >
                    {loading ? "..." : "Search"}
                  </button>
                </div>
              </div>
            </form>

            {/* Property Results List */}
            {propResults && view === "results" && (
              <>
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <p className="text-sm text-slate-500">Buildings</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{propResults.buildings.length}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <p className="text-sm text-slate-500">Sales</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{propResults.sales.length}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <p className="text-sm text-slate-500">Permits</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{propResults.permits.length}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <p className="text-sm text-slate-500">Violations</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{propResults.violations.length}</p>
                  </div>
                </div>

                {propResults.buildings.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {propResults.buildings.map((b: any, i: number) => (
                      <button
                        key={i}
                        onClick={() => {
                          setSelectedBuilding(b);
                          setView("building");
                          setDetailTab("sales");
                        }}
                        className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-blue-300 hover:shadow-md transition-all group"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-base font-semibold text-slate-900 group-hover:text-blue-600">
                              {b.address}
                            </h3>
                            <p className="text-sm text-slate-500 mt-0.5">
                              {b.neighborhood}, {b.borough}
                            </p>
                          </div>
                          <span className="text-slate-400 group-her:text-blue-500 text-lg">→</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-4">
                          <div>
                            <p className="text-xs text-slate-400">Last Sale</p>
                            <p className="text-sm font-semibold">{fmtPrice(b.lastSalePrice)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-400">Year Built</p>
                            <p className="text-sm">{b.yearBuilt || "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-400">Units</p>
                            <p className="text-sm">{b.totalUnits || "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-400">Sales</p>
                            <p className="text-sm">{b.salesCount}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {propResults.permits.length > 0 && (
                  <div className="mt-6">
                    <h2 className="text-sm font-semibold text-slate-700 mb-3">📋 Permits</h2>
                    <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                      {propResults.permits.map((p: any, i: number) => (
                        <div key={i} className="p-4 flex justify-between">
                          <div>
                            <span className="text-sm font-medium text-slate-900">
                              {p.jobDescription || p.jobType}
                            </span>
                            <span
                              className={`ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${
                                p.status.includes("APPROVED") || p.status.includes("SIGN")
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {p.status}
                            </span>
                            <div className="flex gap-3 mt-1 text-xs text-slate-400">
                              <span>#{p.jobNumber}</span>
                              <span>{fmtDate(p.filingDate)}</span>
                            </div>
                          </div>
                          {p.estimatedCost && (
                            <span className="text-sm font-semibold text-slate-700">
                              {fmtPrice(p.estimatedCost)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {propResults.violations.length > 0 && (
                  <div className="mt-6">
                    <h2 className="text-sm font-semibold text-slate-700 mb-3">⚠️ Violations</h2>
                    <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                      {propResults.violations.map((v: any, i: number) => (
                        <div key={i} className="p-4 flex justify-between">
                          <div>
                            <span className="text-sm font-medium text-slate-900">
                              {v.description || v.violationType}
                            </span>
                            <div className="flex gap-3 mt-1 text-xs text-slate-400">
                              <span>#{v.violationNumber}</span>
                              <span>{fmtDate(v.issueDate)}</span>
                            </div>
                          </div>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              v.status === "Open"
                                ? "bg-red-50 text-red-700"
                                : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {v.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Building Detail View */}
            {propResults && view === "building" && selectedBuilding && (
              <div>
                <button onClick={() => setView("results")} className="text-sm text-blue-600 font-medium mb-4">
                  &larr; Back
                </button>
                <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900">{selectedBuilding.address}</h2>
                      <p className="text-base text-slate-500 mt-1">
                        {selectedBuilding.neighborhood}, {selectedBuilding.borough} {selectedBuilding.zipCode}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-400">Last Sale</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {fmtPrice(selectedBuilding.lastSalePrice)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-6 gap-4 mt-6 pt-6 border-t border-slate-100">
                    <div>
                      <p className="text-xs text-slate-400 uppercase">Year Built</p>
                      <p className="text-lg font-semibold mt-0.5">{selectedBuilding.yearBuilt || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 uppercase">Units</p>
                      <p className="text-lg font-semibold mt-0.5">{selectedBuilding.totalUnits || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 uppercase">Gross Sq Ft</p>
                      <p className="text-lg font-semibold mt-0.5">
                        {selectedBuilding.grossSqft > 0 ? selectedBuilding.grossSqft.toLocaleString() : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 uppercase">Land Sq Ft</p>
                      <p className="text-lg font-semibold mt-0.5">
                        {selectedBuilding.landSqft > 0 ? selectedBuilding.landSqft.toLocaleString() : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 uppercase">Block / Lot</p>
                      <p className="text-lg font-semibold mt-0.5">
                        {selectedBuilding.block} / {selectedBuilding.lot}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 uppercase">Class</p>
                      <p className="text-sm font-semibold mt-0.5">{selectedBuilding.buildingClass || "—"}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200">
                  <div className="flex border-b border-slate-200">
                    {(["sales", "permits", "violations"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setDetailTab(t)}
                        className={`px-5 py-3 text-sm font-medium border-b-2 capitalize transition-colors ${
                          detailTab === t
                            ? "border-blue-600 text-blue-700"
                            : "border-transparent text-slate-500"
                        }`}
                      >
                        {t === "sales" ? "💰" : t === "permits" ? "📋" : "⚠️"} {t} (
                        {t === "sales"
                          ? selectedBuilding.sales.length
                          : t === "permits"
                          ? propResults?.permits.length
                          : propResults?.violations.length}
                        )
                      </button>
                    ))}
                  </div>
                  <div className="p-5">
                    {detailTab === "sales" && selectedBuilding.sales.length > 0 && (
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">
                              Address
                            </th>
                            <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase">
                              Price
                            </th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">
                              Date
                            </th>
                            <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase">
                              $/SqFt
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedBuilding.sales.map((s: any, i: number) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-3 py-2.5 text-sm">
                                {s.address}
                                {s.apartmentNumber ? ` #${s.apartmentNumber}` : ""}
                              </td>
                              <td className="px-3 py-2.5 text-sm font-semibold text-right">
                                {fmtPrice(s.salePrice)}
                              </td>
                              <td className="px-3 py-2.5 text-sm text-slate-600">{fmtDate(s.saleDate)}</td>
                              <td className="px-3 py-2.5 text-sm text-slate-600 text-right">
                                {s.grossSqft > 0
                                  ? `$${Math.round(s.salePrice / s.grossSqft).toLocaleString()}`
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {detailTab === "sales" && selectedBuilding.sales.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-8">No sales</p>
                    )}
                    {detailTab !== "sales" && (
                      <p className="text-sm text-slate-400 text-center py-8">
                        See results page for {detailTab}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!propResults && !loading && mainTab === "property" && (
              <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
                <p className="text-4xl mb-4">🏙️</p>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Search any NYC property</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Enter a street address and borough to pull sales history, permits, and violations.
                </p>
              </div>
            )}
          </>
        )}

        {/* ======================== OWNERSHIP TAB ======================== */}
        {mainTab === "ownership" && (
          <>
            <form onSubmit={handleOwnershipSearch} className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
              <p className="text-sm text-slate-500 mb-4">
                Search HPD-registered multifamily buildings to find owner names, building details, and
                contact info. Enriched with PLUTO property data.
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Borough</label>
                  <select
                    name="borough"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Any</option>
                    <option value="Manhattan">Manhattan</option>
                    <option value="Brooklyn">Brooklyn</option>
                    <option value="Queens">Queens</option>
                    <option value="Bronx">Bronx</option>
                    <option value="Staten Island">Staten Island</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ZIP code</label>
                  <input
                    name="zip"
                    placeholder="e.g., 11211"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Street name</label>
                  <input
                    name="street"
                    placeholder="e.g., Bedford Avenue"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">House #</label>
                  <input
                    name="houseNumber"
                    placeholder="e.g., 143"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Owner / Corp name</label>
                  <input
                    name="ownerName"
                    placeholder="e.g., Smith or ABC LLC"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex items-end gap-4 mt-4">
                <div className="w-48">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Min. units</label>
                  <select
                    name="minUnits"
                    defaultValue="3"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="0">Any size</option>
                    <option value="3">3+ units</option>
                    <option value="5">5+ units</option>
                    <option value="10">10+ units</option>
                    <option value="20">20+ units</option>
                    <option value="50">50+ units</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  {loading ? "Searching..." : "Search Owners"}
                </button>
              </div>
            </form>

            {/* Ownership Results */}
            {ownerResults && (
              <>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <p className="text-sm text-slate-500">Buildings Found</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{ownerResults.buildings.length}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <p className="text-sm text-slate-500">Owner Records</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{ownerResults.totalContacts}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <p className="text-sm text-slate-500">HPD Registrations</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">
                      {ownerResults.totalRegistrations}
                    </p>
                  </div>
                </div>

                {ownerResults.buildings.length > 0 ? (
                  <div className="space-y-3">
                    {ownerResults.buildings.map((b: any, i: number) => (
                      <div
                        key={i}
                        className={`bg-white rounded-xl border transition-all ${
                          expandedOwner === i ? "border-blue-300 shadow-md" : "border-slate-200"
                        }`}
                      >
                        <button
                          onClick={() => setExpandedOwner(expandedOwner === i ? null : i)}
                          className="w-full p-5 text-left"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="text-base font-semibold text-slate-900">{b.address}</h3>
                              <p className="text-sm text-slate-500 mt-0.5">
                                {b.boro} • ZIP: {b.zip} • Block {b.block}, Lot {b.lot}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              {b.totalUnits > 0 && (
                                <span className="inline-flex items-center px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-sm font-semibold">
                                  {b.totalUnits} units
                                </span>
                              )}
                              <span className="text-slate-400 text-lg">
                                {expandedOwner === i ? "▾" : "→"}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-6 mt-3">
                            {b.yearBuilt > 0 && (
                              <span className="text-xs text-slate-500">Built {b.yearBuilt}</span>
                            )}
                            {b.numFloors > 0 && (
                              <span className="text-xs text-slate-500">{b.numFloors} floors</span>
                            )}
                            {b.bldgArea > 0 && (
                              <span className="text-xs text-slate-500">
                                {b.bldgArea.toLocaleString()} sq ft
                              </span>
                            )}
                            {b.buildingClass && (
                              <span className="text-xs text-slate-500">Class {b.buildingClass}</span>
                            )}
                            {b.zoneDist && (
                              <span className="text-xs text-slate-500">Zone: {b.zoneDist}</span>
                            )}
                            {b.assessedValue > 0 && (
                              <span className="text-xs text-slate-500">
                                Assessed: {fmtPrice(b.assessedValue)}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-slate-400">Owner:</span>
                            <span className="text-sm font-medium text-slate-700">
                              {b.ownerNamePluto ||
                                (b.owners.length > 0
                                  ? b.owners[0].corporateName ||
                                    `${b.owners[0].firstName} ${b.owners[0].lastName}`.trim()
                                  : "—")}
                            </span>
                            {b.owners.length > 1 && (
                              <span className="text-xs text-slate-400">
                                +{b.owners.length - 1} contacts
                              </span>
                            )}
                          </div>
                        </button>

                        {/* Expanded Details */}
                        {expandedOwner === i && (
                          <div className="border-t border-slate-100 p-5 bg-slate-50/50">
                            <div className="grid grid-cols-4 gap-4 mb-5">
                              <div>
                                <p className="text-xs text-slate-400 uppercase">Total Units</p>
                                <p className="text-base font-semibold text-slate-900">
                                  {b.totalUnits || "—"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-400 uppercase">Residential</p>
                                <p className="text-base font-semibold text-slate-900">
                                  {b.residentialUnits || "—"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-400 uppercase">Year Built</p>
                                <p className="text-base font-semibold text-slate-900">
                                  {b.yearBuilt || "—"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-400 uppercase">Floors</p>
                                <p className="text-base font-semibold text-slate-900">
                                  {b.numFloors || "—"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-400 uppercase">Building Area</p>
                                <p className="text-base font-semibold text-slate-900">
                                  {b.bldgArea > 0 ? `${b.bldgArea.toLocaleString()} sf` : "—"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-400 uppercase">Lot Area</p>
                                <p className="text-base font-semibold text-slate-900">
                                  {b.lotArea > 0 ? `${b.lotArea.toLocaleString()} sf` : "—"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-400 uppercase">Zoning</p>
                                <p className="text-base font-semibold text-slate-900">
                                  {b.zoneDist || "—"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-400 uppercase">Assessed Value</p>
                                <p className="text-base font-semibold text-slate-900">
                                  {b.assessedValue > 0 ? fmtPrice(b.assessedValue) : "—"}
                                </p>
                              </div>
                            </div>

                            <div className="flex gap-2 mb-4">
                              <button onClick={(e) => { e.stopPropagation(); loadLists(); setSaveModal(b); }}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg">
                                🎯 Save to List
                              </button>
                            </div>

                            {b.ownerNamePluto && (
                              <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                  Property Owner (PLUTO)
                                </p>
                                <p className="text-sm font-semibold text-slate-900">{b.ownerNamePluto}</p>
                              </div>
                            )}

                            {b.owners.length > 0 && (
                              <>
                                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                                  HPD Registered Contacts ({b.owners.length})
                                </h4>
                                <div className="space-y-2">
                                  {b.owners.map((o: any, j: number) => (
                                    <div
                                      key={j}
                                      className="bg-white rounded-lg border border-slate-200 p-4"
                                    >
                                      <div className="flex items-start justify-between">
                                        <div>
                                          <p className="text-sm font-semibold text-slate-900">
                                            {o.corporateName ||
                                              `${o.firstName} ${o.lastName}`.trim() ||
                                              "Unknown"}
                                          </p>
                                          <span className="text-xs text-slate-400 capitalize">
                                            {o.contactDescription || o.type}
                                          </span>
                                        </div>
                                      </div>
                                      {(o.businessAddress || o.businessCity) && (
                                        <p className="text-sm text-slate-600 mt-2">
                                          📍{" "}
                                          {[
                                            o.businessAddress,
                                            o.businessCity,
                                            o.businessState,
                                            o.businessZip,
                                          ]
                                            .filter(Boolean)
                                            .join(", ")}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}

                            {b.owners.length === 0 && (
                              <p className="text-sm text-slate-400">
                                No HPD contact records found for this registration.
                              </p>
                            )}

                            <p className="text-xs text-slate-400 mt-4">
                              HPD Registration ID: {b.registrationId} • BIN: {b.bin} • Last
                              registered: {fmtDate(b.lastRegistration)}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                    <p className="text-sm text-slate-500">
                      No buildings found. Try a different ZIP, lower the unit minimum, or search by
                      owner name.
                    </p>
                  </div>
                )}
              </>
            )}

            {!ownerResults && !loading && mainTab === "ownership" && (
              <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
                <p className="text-4xl mb-4">👤</p>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  Find multifamily building owners
                </h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Search by ZIP, street, or owner name. Results enriched with PLUTO data (units,
                  floors, year built, zoning, assessed value).
                </p>
              </div>
            )}
          </>
        )}

        <p className="text-xs text-slate-400 mt-6 text-center">
          Data: NYC Open Data (data.cityofnewyork.us) — HPD Registrations, PLUTO, DOB, ACRIS
        </p>
      </div>
    </div>
  );
}
