"use client";

import { useState } from "react";
import { lookupProperty, searchOwnership, searchByName } from "./actions";
import BuildingDetail from "./building-detail";

type MainTab = "property" | "ownership" | "name";
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
  const [nameResults, setNameResults] = useState<any | null>(null);
  const [nameQuery, setNameQuery] = useState("");

  const fmtPrice = (n: number) => (n > 0 ? `$${n.toLocaleString()}` : "—");
  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try {
      return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
    } catch {
      return d;
    }
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
        <div className="px-8 py-5 flex items-center gap-3">
          <span className="text-2xl">🔍</span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Market Intelligence</h1>
            <p className="text-sm text-slate-500">NYC property records, ownership & portfolio data</p>
          </div>
        </div>
        <div className="px-8 flex gap-0">
          {([
            { key: "property" as const, label: "🏠 Property Search" },
            { key: "ownership" as const, label: "👤 Ownership Lookup" },
            { key: "name" as const, label: "🔎 Name / Portfolio" },
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

      <div className="px-8 py-6">
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
                  <input name="address" required placeholder="e.g., 350 Park Avenue" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="w-48">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Borough *</label>
                  <select name="borough" required className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white">
                    <option value="">Select...</option>
                    <option value="Manhattan">Manhattan</option>
                    <option value="Brooklyn">Brooklyn</option>
                    <option value="Queens">Queens</option>
                    <option value="Bronx">Bronx</option>
                    <option value="Staten Island">Staten Island</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button type="submit" disabled={loading} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                    {loading ? "..." : "Search"}
                  </button>
                </div>
              </div>
            </form>

            {propResults && view === "results" && (
              <>
                <div className="grid grid-cols-4 gap-4 mb-6">
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
                  <div className="grid grid-cols-5 gap-4 mt-5 pt-5 border-t border-slate-100">
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
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Borough</label>
                      <select name="borough" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white">
                        <option value="">Any</option><option value="Manhattan">Manhattan</option><option value="Brooklyn">Brooklyn</option>
                        <option value="Queens">Queens</option><option value="Bronx">Bronx</option><option value="Staten Island">Staten Island</option>
                      </select>
                    </div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">ZIP code</label>
                      <input name="zip" placeholder="e.g., 11211" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Street name</label>
                      <input name="street" placeholder="e.g., Bedford Ave" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">House #</label>
                      <input name="houseNumber" placeholder="e.g., 143" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Owner name</label>
                      <input name="ownerName" placeholder="e.g., Smith" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
                    <div className="grid grid-cols-3 gap-4 mb-6">
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
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                          <div>
                            <h3 className="text-base font-semibold text-slate-900">
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

        <p className="text-xs text-slate-400 mt-6 text-center">
          Data: NYC Open Data • NYS Dept. of State • ACRIS • HPD • PLUTO • DOB
        </p>
      </div>
    </div>
  );
}
