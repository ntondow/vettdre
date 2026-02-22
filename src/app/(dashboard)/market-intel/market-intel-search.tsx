"use client";

import { useState } from "react";
import { lookupProperty, searchOwnership, searchByName } from "./actions";
import { searchNewDevelopments, NewDevelopment } from "./new-development-actions";
import { createContactFromBuilding } from "./building-profile-actions";
import BuildingDetail from "./building-detail";
import BuildingProfile from "./building-profile";
import { getLists, addBuildingToList } from "../prospecting/actions";
import dynamic from "next/dynamic";
const MapSearch = dynamic(() => import("./map-search"), { ssr: false, loading: () => <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div></div> });

type MainTab = "property" | "ownership" | "name" | "map" | "new-development";
type View = "results" | "building";

export default function MarketIntelSearch() {
  const [mainTab, setMainTab] = useState<MainTab>("property");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Property search
  const [propResults, setPropResults] = useState<any | null>(null);
  const [view, setView] = useState<View>("results");
  const [selectedBuilding, setSelectedBuilding] = useState<any | null>(null);
  const [detailTab, setDetailTab] = useState<"sales" | "permits" | "violations">("sales");

  // Ownership search
  const [ownerResults, setOwnerResults] = useState<any | null>(null);
  const [ownerDetailBuilding, setOwnerDetailBuilding] = useState<any>(null);

  // Name search
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [nameResults, setNameResults] = useState<any | null>(null);
  const [nameDetailBuilding, setNameDetailBuilding] = useState<any>(null);
  const [nameQuery, setNameQuery] = useState("");
  const [prospectLists, setProspectLists] = useState<any[]>([]);
  const [saveModal, setSaveModal] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // New Development search
  const [ndResults, setNdResults] = useState<NewDevelopment[]>([]);
  const [ndLoading, setNdLoading] = useState(false);
  const [ndFilters, setNdFilters] = useState<{
    borough: string;
    minUnits: number;
    jobType: "NB" | "A1" | "both";
    status: string;
    minCost: number;
    filedAfter: string;
  }>({ borough: "", minUnits: 10, jobType: "both", status: "", minCost: 0, filedAfter: "" });
  const [ndSelected, setNdSelected] = useState<NewDevelopment | null>(null);
  const [addingCrmId, setAddingCrmId] = useState<string | null>(null);
  const [crmResult, setCrmResult] = useState<{ id: string; message: string } | null>(null);
  const [copiedPitch, setCopiedPitch] = useState(false);

  const fmtPrice = (n: number) => (n > 0 ? `$${n.toLocaleString()}` : "—");
  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try {
      return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
    } catch {
      return d;
    }
  };

  const loadLists = async () => {
    try { const lists = await getLists(); setProspectLists(JSON.parse(JSON.stringify(lists))); } catch {}
  };

  const handleAddDevToCRM = async (nd: NewDevelopment) => {
    const key = nd.jobFilingNumber || nd.address;
    setAddingCrmId(key);
    setCrmResult(null);
    try {
      const ownerName = nd.ownerName || nd.ownerBusiness || "";
      const parts = ownerName.trim().split(/\s+/);
      const firstName = parts[0] || "Owner";
      const lastName = parts.slice(1).join(" ") || nd.address;
      const result = await createContactFromBuilding({
        firstName,
        lastName,
        company: nd.ownerBusiness || undefined,
        phone: nd.ownerPhone || undefined,
        address: nd.address || undefined,
        borough: nd.borough || undefined,
      });
      setCrmResult({ id: result.contactId, message: result.enriched ? "Contact created + enriched" : "Contact created" });
      setTimeout(() => setCrmResult(null), 4000);
    } catch (err: any) {
      setCrmResult({ id: "", message: "Error: " + (err.message || "Failed") });
      setTimeout(() => setCrmResult(null), 4000);
    } finally {
      setAddingCrmId(null);
    }
  };

  const handleDraftPitch = (nd: NewDevelopment) => {
    const pitch = `Hi ${nd.ownerName || "there"},\n\nI noticed your new ${nd.proposedUnits}-unit development at ${nd.address || "your property"} in ${nd.borough} recently received ${nd.filingStatus}.\n\nI specialize in lease-up services for new developments in ${nd.borough} and would love to discuss how I can help fill your building quickly and at optimal rents.\n\nMy recent lease-up track record includes:\n- [Your track record here]\n\nWould you have 15 minutes this week to discuss?\n\nBest,\n[Your name]`;
    navigator.clipboard.writeText(pitch);
    setCopiedPitch(true);
    setTimeout(() => setCopiedPitch(false), 2000);
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
        source: building.source || "market_intel",
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
    setOwnerDetailBuilding(null);
    try {
      setOwnerResults(await searchOwnership(new FormData(e.currentTarget)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleNameSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const name = fd.get("name") as string;
    setNameQuery(name);
    try {
      setNameResults(await searchByName(name));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Click any owner name to search for all their properties
  const searchOwnerName = async (name: string) => {
    setMainTab("name");
    setLoading(true);
    setError(null);
    setNameQuery(name);
    setOwnerDetailBuilding(null);
    try {
      setNameResults(await searchByName(name));
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
        <div className="px-4 md:px-8 py-5 flex items-center gap-3">
          <span className="text-2xl">🔍</span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Market Intelligence</h1>
            <p className="text-sm text-slate-500">NYC property records, ownership & portfolio data</p>
          </div>
        </div>
        <div className="px-4 md:px-8 flex gap-0 overflow-x-auto no-scrollbar">
          {([
            { key: "property" as const, label: "🏠 Property Search" },
            { key: "ownership" as const, label: "👤 Ownership Lookup" },
            { key: "name" as const, label: "🔎 Name / Portfolio" },
            { key: "map" as const, label: "🗺️ Map Search" },
            { key: "new-development" as const, label: "🏗️ New Development" },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setMainTab(t.key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                mainTab === t.key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 md:px-8 py-6">
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

        {/* CRM Result Toast */}
        {crmResult && (
          <div className={`fixed top-4 right-4 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg z-50 ${crmResult.id ? "bg-emerald-600" : "bg-red-600"}`}>
            {crmResult.message}
            {crmResult.id && (
              <a href={`/contacts/${crmResult.id}`} className="ml-2 underline">View</a>
            )}
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
            <form onSubmit={handlePropertySearch} className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 mb-6">
              <div className="flex flex-col md:flex-row gap-3 md:gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Street address *</label>
                  <input name="address" required placeholder="e.g., 350 Park Avenue"
                    className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="md:w-48">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Borough *</label>
                  <select name="borough" required className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm bg-white">
                    <option value="">Select...</option>
                    <option value="Manhattan">Manhattan</option>
                    <option value="Brooklyn">Brooklyn</option>
                    <option value="Queens">Queens</option>
                    <option value="Bronx">Bronx</option>
                    <option value="Staten Island">Staten Island</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button type="submit" disabled={loading} className="w-full md:w-auto h-12 md:h-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                    {loading ? "..." : "Search"}
                  </button>
                </div>
              </div>
            </form>

            {propResults && view === "results" && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {[
                    { label: "Buildings", val: propResults.buildings.length },
                    { label: "Sales", val: propResults.sales.length },
                    { label: "Permits", val: propResults.permits.length },
                    { label: "Violations", val: propResults.violations.length },
                  ].map((s) => (
                    <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5">
                      <p className="text-sm text-slate-500">{s.label}</p>
                      <p className="text-2xl font-bold text-slate-900 mt-1">{s.val}</p>
                    </div>
                  ))}
                </div>
                {propResults.buildings.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {propResults.buildings.map((b: any, i: number) => (
                      <button
                        key={i}
                        onClick={() => { setSelectedBuilding(b); setView("building"); setDetailTab("sales"); }}
                        className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-blue-300 hover:shadow-md transition-all group"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-base font-semibold text-slate-900 group-hover:text-blue-600">{b.address}</h3>
                            <p className="text-sm text-slate-500 mt-0.5">{b.neighborhood}, {b.borough}</p>
                          </div>
                          <span className="text-slate-400 group-hover:text-blue-500 text-lg">→</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-4">
                          <div><p className="text-xs text-slate-400">Last Sale</p><p className="text-sm font-semibold">{fmtPrice(b.lastSalePrice)}</p></div>
                          <div><p className="text-xs text-slate-400">Year Built</p><p className="text-sm">{b.yearBuilt || "—"}</p></div>
                          <div><p className="text-xs text-slate-400">Units</p><p className="text-sm">{b.totalUnits || "—"}</p></div>
                          <div><p className="text-xs text-slate-400">Sales</p><p className="text-sm">{b.salesCount}</p></div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {propResults && view === "building" && selectedBuilding && (
              <div>
                <button onClick={() => setView("results")} className="text-sm text-blue-600 font-medium mb-4">&larr; Back</button>
                <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
                  <h2 className="text-2xl font-bold text-slate-900">{selectedBuilding.address}</h2>
                  <p className="text-base text-slate-500 mt-1">{selectedBuilding.neighborhood}, {selectedBuilding.borough}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-5 pt-5 border-t border-slate-100">
                    <div><p className="text-xs text-slate-400 uppercase">Last Sale</p><p className="text-lg font-semibold">{fmtPrice(selectedBuilding.lastSalePrice)}</p></div>
                    <div><p className="text-xs text-slate-400 uppercase">Year Built</p><p className="text-lg font-semibold">{selectedBuilding.yearBuilt || "—"}</p></div>
                    <div><p className="text-xs text-slate-400 uppercase">Units</p><p className="text-lg font-semibold">{selectedBuilding.totalUnits || "—"}</p></div>
                    <div><p className="text-xs text-slate-400 uppercase">Sq Ft</p><p className="text-lg font-semibold">{selectedBuilding.grossSqft > 0 ? selectedBuilding.grossSqft.toLocaleString() : "—"}</p></div>
                    <div><p className="text-xs text-slate-400 uppercase">Block/Lot</p><p className="text-lg font-semibold">{selectedBuilding.block}/{selectedBuilding.lot}</p></div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200">
                  <div className="flex border-b border-slate-200">
                    {(["sales", "permits", "violations"] as const).map((t) => (
                      <button key={t} onClick={() => setDetailTab(t)}
                        className={`px-5 py-3 text-sm font-medium border-b-2 capitalize ${detailTab === t ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"}`}>
                        {t} ({t === "sales" ? selectedBuilding.sales.length : t === "permits" ? propResults?.permits.length : propResults?.violations.length})
                      </button>
                    ))}
                  </div>
                  <div className="p-5">
                    {detailTab === "sales" && selectedBuilding.sales.length > 0 && (
                      <table className="w-full">
                        <thead><tr className="border-b border-slate-200">
                          <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Address</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Price</th>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Date</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase">$/SqFt</th>
                        </tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedBuilding.sales.map((s: any, i: number) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-3 py-2.5 text-sm">{s.address}{s.apartmentNumber ? ` #${s.apartmentNumber}` : ""}</td>
                              <td className="px-3 py-2.5 text-sm font-semibold text-right">{fmtPrice(s.salePrice)}</td>
                              <td className="px-3 py-2.5 text-sm text-slate-600">{fmtDate(s.saleDate)}</td>
                              <td className="px-3 py-2.5 text-sm text-slate-600 text-right">{s.grossSqft > 0 ? `$${Math.round(s.salePrice / s.grossSqft).toLocaleString()}` : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {detailTab === "sales" && selectedBuilding.sales.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No sales</p>}
                    {detailTab !== "sales" && <p className="text-sm text-slate-400 text-center py-8">See main results for {detailTab}</p>}
                  </div>
                </div>
              </div>
            )}

            {!propResults && !loading && mainTab === "property" && (
              <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
                <p className="text-4xl mb-4">🏙️</p>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Search any NYC property</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">Enter a street address and borough to pull sales, permits, and violations.</p>
              </div>
            )}
          </>
        )}

        {/* ======================== OWNERSHIP TAB ======================== */}
        {mainTab === "ownership" && (
          <>
            {ownerDetailBuilding ? (
              <BuildingDetail
                building={ownerDetailBuilding}
                onClose={() => setOwnerDetailBuilding(null)}
                onNameClick={searchOwnerName}
              />
            ) : (
              <>
                <form onSubmit={handleOwnershipSearch} className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
                  <p className="text-sm text-slate-500 mb-4">Search HPD-registered buildings. Click any building for AI owner analysis.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Borough</label>
                      <select name="borough" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white">
                        <option value="">Any</option><option value="Manhattan">Manhattan</option><option value="Brooklyn">Brooklyn</option>
                        <option value="Queens">Queens</option><option value="Bronx">Bronx</option><option value="Staten Island">Staten Island</option>
                      </select>
                    </div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">ZIP code</label>
                      <input name="zip" placeholder="e.g., 11211" className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Street name</label>
                      <input name="street" placeholder="e.g., Bedford Ave" className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">House #</label>
                      <input name="houseNumber" placeholder="e.g., 143" className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Owner name</label>
                      <input name="ownerName" placeholder="e.g., Smith" className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div className="flex items-end gap-4 mt-4">
                    <div className="w-48"><label className="block text-sm font-medium text-slate-700 mb-1">Min. units</label>
                      <select name="minUnits" defaultValue="3" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white">
                        <option value="0">Any</option><option value="3">3+</option><option value="5">5+</option>
                        <option value="10">10+</option><option value="20">20+</option><option value="50">50+</option>
                      </select>
                    </div>
                    <button type="submit" disabled={loading} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                      {loading ? "Searching..." : "Search"}
                    </button>
                  </div>
                </form>

                {ownerResults && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                      <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-sm text-slate-500">Buildings</p><p className="text-2xl font-bold text-slate-900 mt-1">{ownerResults.buildings.length}</p></div>
                      <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-sm text-slate-500">Owner Records</p><p className="text-2xl font-bold text-slate-900 mt-1">{ownerResults.totalContacts}</p></div>
                      <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-sm text-slate-500">Registrations</p><p className="text-2xl font-bold text-slate-900 mt-1">{ownerResults.totalRegistrations}</p></div>
                    </div>

                    {ownerResults.buildings.length > 0 ? (
                      <div className="space-y-3">
                        {ownerResults.buildings.map((b: any, i: number) => (
                          <button
                            key={i}
                            onClick={() => setOwnerDetailBuilding(b)}
                            className="w-full bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-blue-300 hover:shadow-md transition-all group"
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className="text-base font-semibold text-slate-900 group-hover:text-blue-600">{b.address}</h3>
                                <p className="text-sm text-slate-500 mt-0.5">{b.boro} • ZIP: {b.zip} • Block {b.block}, Lot {b.lot}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                {b.totalUnits > 0 && (
                                  <span className="text-xs font-semibold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg">{b.totalUnits} units</span>
                                )}
                                <span className="text-slate-400 group-hover:text-blue-500 text-lg">→</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-6 mt-2 text-xs text-slate-500">
                              {b.yearBuilt > 0 && <span>Built {b.yearBuilt}</span>}
                              {b.numFloors > 0 && <span>{b.numFloors} floors</span>}
                              {b.bldgArea > 0 && <span>{b.bldgArea.toLocaleString()} sf</span>}
                              {b.assessedValue > 0 && <span>Assessed: {fmtPrice(b.assessedValue)}</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-xs text-slate-400">Owner:</span>
                              <span className="text-sm font-medium text-slate-700">
                                {b.ownerNamePluto || (b.owners?.length > 0 ? (b.owners[0].corporateName || `${b.owners[0].firstName} ${b.owners[0].lastName}`.trim()) : "—")}
                              </span>
                              {b.owners?.length > 1 && <span className="text-xs text-slate-400">+{b.owners.length - 1} contacts</span>}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                        <p className="text-sm text-slate-500">No buildings found. Try a different ZIP or lower the unit minimum.</p>
                      </div>
                    )}
                  </>
                )}

                {!ownerResults && !loading && (
                  <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
                    <p className="text-4xl mb-4">👤</p>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">Find building owners</h3>
                    <p className="text-sm text-slate-500 max-w-md mx-auto">Search by ZIP, street, or owner name. Click any result for AI owner analysis.</p>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ======================== NAME / PORTFOLIO TAB ======================== */}
        {mainTab === "name" && (
          <>
            <form onSubmit={handleNameSearch} className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
              <p className="text-sm text-slate-500 mb-4">
                Search for a person or LLC name across all NYC property records (ACRIS deeds, mortgages, HPD registrations). See every property tied to that name.
              </p>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Person or entity name *</label>
                  <input
                    name="name"
                    required
                    defaultValue={nameQuery}
                    placeholder="e.g., John Smith or ABC Realty LLC"
                    className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-end">
                  <button type="submit" disabled={loading} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                    {loading ? "Searching..." : "Search All Records"}
                  </button>
                </div>
              </div>
            </form>

            {loading && (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mb-4"></div>
                <p className="text-sm text-slate-500">Searching ACRIS deeds, mortgages, and HPD records...</p>
              </div>
            )}

            {nameResults && !loading && (
              <>
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-5 mb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        Portfolio: {nameResults.searchName}
                      </h2>
                      <p className="text-sm text-slate-500 mt-0.5">
                        {nameResults.properties.length} properties found across ACRIS & HPD records
                      </p>
                    </div>
                    <span className="text-3xl font-bold text-indigo-600">{nameResults.properties.length}</span>
                  </div>
                </div>

                {nameResults.properties.length > 0 ? (
                  <div className="space-y-3">
                    {nameResults.properties.map((p: any, i: number) => (
                      <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="text-base font-semibold text-slate-900 cursor-pointer hover:text-blue-600" onClick={() => setNameDetailBuilding({ boroCode: p.boroCode || String(p.boro || ""), block: p.block, lot: p.lot, address: p.address, borough: p.borough, ownerName: nameResults.searchName })}>
                              {p.address || `Block ${p.block}, Lot ${p.lot}`}
                            </h3>
                            <p className="text-sm text-slate-500 mt-0.5">
                              {p.borough} • Block {p.block}, Lot {p.lot}
                              {p.zip ? ` • ZIP: ${p.zip}` : ""}
                            </p>
                          </div>
                        </div>

                        {/* Transaction history for this property */}
                        <div className="mt-3 space-y-2">
                          {p.documents.slice(0, 5).map((doc: any, di: number) => (
                            <div key={di} className="flex items-center gap-3 text-sm">
                              <span
                                className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                  doc.docType === "DEED"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : doc.docType === "MTGE"
                                    ? "bg-blue-50 text-blue-700"
                                    : doc.docType === "HPD REG"
                                    ? "bg-purple-50 text-purple-700"
                                    : "bg-amber-50 text-amber-700"
                                }`}
                              >
                                {doc.docType}
                              </span>
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ${
                                  doc.role === "Grantee"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {doc.role === "Grantee" ? "BUYER" : doc.role === "Grantor" ? "SELLER" : doc.role}
                              </span>
                              {doc.amount > 0 && (
                                <span className="font-semibold">{fmtPrice(doc.amount)}</span>
                              )}
                              {doc.recordedDate && (
                                <span className="text-slate-400">{fmtDate(doc.recordedDate)}</span>
                              )}
                              {doc.name && doc.name.toUpperCase() !== nameResults.searchName && (
                                <button
                                  onClick={() => searchOwnerName(doc.name)}
                                  className="text-blue-600 hover:underline text-xs"
                                >
                                  {doc.name} →
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                    <p className="text-sm text-slate-500">
                      No properties found for &ldquo;{nameResults.searchName}&rdquo;. Try a different spelling or name.
                    </p>
                  </div>
                )}
              </>
            )}

            {nameDetailBuilding && (
              <div className="fixed inset-0 z-[2000] flex">
                <div className="absolute inset-0 bg-black/40" onClick={() => setNameDetailBuilding(null)} />
                <div className="relative ml-auto w-full md:max-w-3xl bg-white shadow-2xl overflow-y-auto">
                  <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">{nameDetailBuilding.address}</h2>
                      <p className="text-xs text-slate-500">{nameDetailBuilding.borough}</p>
                    </div>
                    <button onClick={() => setNameDetailBuilding(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 text-lg">&times;</button>
                  </div>
                  <div className="p-5">
                    <BuildingProfile
                      boroCode={nameDetailBuilding.boroCode}
                      block={nameDetailBuilding.block}
                      lot={nameDetailBuilding.lot}
                      address={nameDetailBuilding.address}
                      borough={nameDetailBuilding.borough}
                      ownerName={nameDetailBuilding.ownerName}
                      onClose={() => setNameDetailBuilding(null)}
                      onNameClick={(name) => { setNameDetailBuilding(null); searchOwnerName(name); }}
                    />
                  </div>
                </div>
              </div>
            )}
            {!nameResults && !loading && mainTab === "name" && (
              <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
                <p className="text-4xl mb-4">🔎</p>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Search by name</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Enter a person&apos;s name or LLC to find every property they&apos;re connected to across NYC deed, mortgage, and registration records.
                </p>
              </div>
            )}
          </>
        )}
        {/* ======================== NEW DEVELOPMENT TAB ======================== */}
        {mainTab === "new-development" && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 mb-6">
              <p className="text-sm text-slate-500 mb-4">Search NYC DOB filings for new buildings (NB) and major alterations (A1). Find developers, unit counts, and contact info.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Borough</label>
                  <select
                    value={ndFilters.borough}
                    onChange={(e) => setNdFilters((f) => ({ ...f, borough: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">All Boroughs</option>
                    <option value="MANHATTAN">Manhattan</option>
                    <option value="BRONX">Bronx</option>
                    <option value="BROOKLYN">Brooklyn</option>
                    <option value="QUEENS">Queens</option>
                    <option value="STATEN ISLAND">Staten Island</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Min Units</label>
                  <input
                    type="number"
                    value={ndFilters.minUnits}
                    onChange={(e) => setNdFilters((f) => ({ ...f, minUnits: parseInt(e.target.value) || 0 }))}
                    placeholder="e.g., 10"
                    className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Job Type</label>
                  <div className="flex items-center gap-4 h-12 md:h-auto py-2.5">
                    {([
                      { value: "both" as const, label: "Both" },
                      { value: "NB" as const, label: "New Building" },
                      { value: "A1" as const, label: "Major Alteration" },
                    ]).map((opt) => (
                      <label key={opt.value} className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="ndJobType"
                          checked={ndFilters.jobType === opt.value}
                          onChange={() => setNdFilters((f) => ({ ...f, jobType: opt.value }))}
                          className="accent-blue-600"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={ndFilters.status}
                    onChange={(e) => setNdFilters((f) => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">All Statuses</option>
                    <option value="APPROVED">Approved</option>
                    <option value="PARTIALLY APPROVED">Partially Approved</option>
                    <option value="IN PROCESS">In Process</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Min Est. Cost</label>
                  <input
                    type="number"
                    value={ndFilters.minCost || ""}
                    onChange={(e) => setNdFilters((f) => ({ ...f, minCost: parseInt(e.target.value) || 0 }))}
                    placeholder="e.g., 1000000"
                    className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Filed After</label>
                  <input
                    type="date"
                    value={ndFilters.filedAfter}
                    onChange={(e) => setNdFilters((f) => ({ ...f, filedAfter: e.target.value }))}
                    className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex items-end gap-4 mt-4">
                <button
                  type="button"
                  disabled={ndLoading}
                  onClick={async () => {
                    setNdLoading(true);
                    setNdSelected(null);
                    try {
                      const results = await searchNewDevelopments({
                        borough: ndFilters.borough || undefined,
                        minUnits: ndFilters.minUnits || undefined,
                        jobType: ndFilters.jobType,
                        status: ndFilters.status || undefined,
                        minCost: ndFilters.minCost || undefined,
                        filedAfter: ndFilters.filedAfter || undefined,
                      });
                      setNdResults(results);
                    } catch (err) {
                      console.error(err);
                      setNdResults([]);
                    } finally {
                      setNdLoading(false);
                    }
                  }}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  {ndLoading ? "Searching..." : "Search"}
                </button>
              </div>
            </div>

            {ndLoading && (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mb-4"></div>
                <p className="text-sm text-slate-500">Searching DOB filings...</p>
              </div>
            )}

            {/* Selected detail panel */}
            {ndSelected && (
              <div className="fixed inset-0 z-[2000] flex">
                <div className="absolute inset-0 bg-black/40" onClick={() => setNdSelected(null)} />
                <div className="relative ml-auto w-full md:max-w-2xl bg-white shadow-2xl overflow-y-auto">
                  <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">{ndSelected.address || "No Address"}</h2>
                      <p className="text-xs text-slate-500">{ndSelected.borough}</p>
                    </div>
                    <button onClick={() => setNdSelected(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 text-lg">&times;</button>
                  </div>
                  <div className="p-5 space-y-6">
                    {/* Address + badges */}
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{ndSelected.address || "No Address"}, {ndSelected.borough}</h3>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${ndSelected.jobType === "NB" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                          {ndSelected.jobType === "NB" ? "New Building" : "Major Alteration"}
                        </span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${ndSelected.filingStatus === "APPROVED" ? "bg-emerald-50 text-emerald-700" : ndSelected.filingStatus === "IN PROCESS" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                          {ndSelected.filingStatus}
                        </span>
                      </div>
                    </div>

                    {/* Units + stories */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-blue-50 rounded-xl p-4 text-center">
                        <p className="text-3xl font-bold text-blue-700">{ndSelected.proposedUnits}</p>
                        <p className="text-sm text-blue-600 mt-1">Proposed Units</p>
                      </div>
                      <div className="bg-indigo-50 rounded-xl p-4 text-center">
                        <p className="text-3xl font-bold text-indigo-700">{ndSelected.proposedStories}</p>
                        <p className="text-sm text-indigo-600 mt-1">Stories</p>
                      </div>
                    </div>

                    {/* Owner section */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                      <h4 className="text-sm font-semibold text-slate-900 mb-3">Owner / Developer</h4>
                      <div className="space-y-2">
                        {ndSelected.ownerName && <p className="text-sm text-slate-700"><span className="text-slate-400 w-20 inline-block">Name:</span> {ndSelected.ownerName}</p>}
                        {ndSelected.ownerBusiness && <p className="text-sm text-slate-700"><span className="text-slate-400 w-20 inline-block">Business:</span> {ndSelected.ownerBusiness}</p>}
                        {ndSelected.ownerPhone && (
                          <p className="text-sm text-slate-700">
                            <span className="text-slate-400 w-20 inline-block">Phone:</span>{" "}
                            <a href={`tel:${ndSelected.ownerPhone}`} className="text-blue-600 hover:underline">{ndSelected.ownerPhone}</a>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Permittee section */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                      <h4 className="text-sm font-semibold text-slate-900 mb-3">Permittee</h4>
                      <div className="space-y-2">
                        {ndSelected.permitteeName && <p className="text-sm text-slate-700"><span className="text-slate-400 w-20 inline-block">Name:</span> {ndSelected.permitteeName}</p>}
                        {ndSelected.permitteeBusiness && <p className="text-sm text-slate-700"><span className="text-slate-400 w-20 inline-block">Business:</span> {ndSelected.permitteeBusiness}</p>}
                        {ndSelected.permitteePhone && (
                          <p className="text-sm text-slate-700">
                            <span className="text-slate-400 w-20 inline-block">Phone:</span>{" "}
                            <a href={`tel:${ndSelected.permitteePhone}`} className="text-blue-600 hover:underline">{ndSelected.permitteePhone}</a>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Additional details */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-slate-400">Estimated Cost</p>
                        <p className="font-semibold text-slate-900">{ndSelected.estimatedCost > 0 ? `$${(ndSelected.estimatedCost / 1000000).toFixed(1)}M` : "---"}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Filing Date</p>
                        <p className="font-semibold text-slate-900">{fmtDate(ndSelected.filingDate)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Zoning</p>
                        <p className="font-semibold text-slate-900">{ndSelected.zoningDistrict || "---"}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Community Board</p>
                        <p className="font-semibold text-slate-900">{ndSelected.communityBoard || "---"}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Block / Lot</p>
                        <p className="font-semibold text-slate-900">{ndSelected.block}/{ndSelected.lot}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Occupancy</p>
                        <p className="font-semibold text-slate-900">{ndSelected.proposedOccupancy || "---"}</p>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-2 pt-2">
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleAddDevToCRM(ndSelected)}
                          disabled={addingCrmId === (ndSelected.jobFilingNumber || ndSelected.address)}
                          className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                        >
                          {addingCrmId === (ndSelected.jobFilingNumber || ndSelected.address) ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                              Adding...
                            </span>
                          ) : "+ Add to CRM"}
                        </button>
                        <button
                          onClick={async () => {
                            await loadLists();
                            setSaveModal({
                              address: ndSelected.address || "New Development",
                              borough: ndSelected.borough,
                              block: ndSelected.block,
                              lot: ndSelected.lot,
                              totalUnits: ndSelected.proposedUnits,
                              ownerName: ndSelected.ownerName || ndSelected.ownerBusiness,
                              numFloors: ndSelected.proposedStories,
                              zoning: ndSelected.zoningDistrict,
                              source: "new_development",
                            });
                          }}
                          className="flex-1 px-4 py-2.5 border border-blue-600 text-blue-600 hover:bg-blue-50 text-sm font-medium rounded-lg"
                        >
                          Add to Prospects
                        </button>
                      </div>
                      <button
                        onClick={() => handleDraftPitch(ndSelected)}
                        className="w-full px-4 py-2.5 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium rounded-lg"
                      >
                        {copiedPitch ? "Copied to clipboard!" : "Draft Pitch Email"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!ndLoading && ndResults.length > 0 && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <p className="text-sm text-slate-500">Results</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{ndResults.length}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <p className="text-sm text-slate-500">New Buildings</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{ndResults.filter((r) => r.jobType === "NB").length}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <p className="text-sm text-slate-500">Major Alterations</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{ndResults.filter((r) => r.jobType === "A1").length}</p>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <p className="text-sm text-slate-500">Total Units</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{ndResults.reduce((sum, r) => sum + r.proposedUnits, 0).toLocaleString()}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {ndResults.map((nd, i) => (
                    <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 hover:border-blue-300 hover:shadow-md transition-all">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-base font-semibold text-slate-900">{nd.address || "No Address"}</h3>
                          <p className="text-sm text-slate-500 mt-0.5">{nd.borough} &bull; Block {nd.block}, Lot {nd.lot}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${nd.jobType === "NB" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                            {nd.jobType === "NB" ? "New Building" : "Alteration"}
                          </span>
                          <span className="text-xs font-semibold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg">{nd.proposedUnits} units</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 mt-3 text-sm">
                        {(nd.ownerName || nd.ownerBusiness) && (
                          <span className="text-slate-700">
                            <span className="text-slate-400">Developer: </span>
                            {nd.ownerName || nd.ownerBusiness}
                          </span>
                        )}
                        {nd.ownerPhone && (
                          <a href={`tel:${nd.ownerPhone}`} className="text-blue-600 hover:underline">{nd.ownerPhone}</a>
                        )}
                        {nd.estimatedCost > 0 && (
                          <span className="text-slate-700">
                            <span className="text-slate-400">Cost: </span>
                            ${(nd.estimatedCost / 1000000).toFixed(1)}M
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 mt-2 text-xs text-slate-500">
                        <span>Filed: {fmtDate(nd.filingDate)}</span>
                        <span className={`font-semibold px-2 py-0.5 rounded ${nd.filingStatus === "APPROVED" ? "bg-emerald-50 text-emerald-700" : nd.filingStatus === "IN PROCESS" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                          {nd.filingStatus}
                        </span>
                        {nd.proposedStories > 0 && <span>{nd.proposedStories} stories</span>}
                        {nd.zoningDistrict && <span>Zoning: {nd.zoningDistrict}</span>}
                      </div>

                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                        <button
                          onClick={() => setNdSelected(nd)}
                          className="px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                        >
                          View Details
                        </button>
                        <button
                          onClick={() => handleAddDevToCRM(nd)}
                          disabled={addingCrmId === (nd.jobFilingNumber || nd.address)}
                          className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                        >
                          {addingCrmId === (nd.jobFilingNumber || nd.address) ? "Adding..." : "+ Add to CRM"}
                        </button>
                        <button
                          onClick={async () => {
                            await loadLists();
                            setSaveModal({
                              address: nd.address || "New Development",
                              borough: nd.borough,
                              block: nd.block,
                              lot: nd.lot,
                              totalUnits: nd.proposedUnits,
                              ownerName: nd.ownerName || nd.ownerBusiness,
                              numFloors: nd.proposedStories,
                              zoning: nd.zoningDistrict,
                              source: "new_development",
                            });
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                          Add to Prospects
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {!ndLoading && ndResults.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
                <p className="text-4xl mb-4">🏗️</p>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Search new developments</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Search DOB filings for new buildings and major alterations across NYC. Find developer contact info, unit counts, and project details.
                </p>
              </div>
            )}
          </>
        )}

        <div style={mainTab !== "map" ? { position: "absolute", left: "-9999px", width: "100%" } : {}}>
          <MapSearch onNameClick={(name) => { setMainTab("name"); searchOwnerName(name); }} />
        </div>

        <p className="text-xs text-slate-400 mt-6 text-center">
          Data: NYC Open Data • NYS Dept. of State • ACRIS • HPD • PLUTO • DOB
        </p>
      </div>
    </div>
  );
}
