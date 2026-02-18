"use client";

import { useState } from "react";
import { lookupProperty } from "./actions";
// Types inferred from server action

type Tab = "sales" | "permits" | "violations";

export default function MarketIntelSearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{
    sales: SalesRecord[];
    permits: Permit[];
    violations: Violation[];
    query: { address: string; borough: string; zip: string };
  } | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("sales");

  const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await lookupProperty(new FormData(e.currentTarget));
      setResults(data);
      setActiveTab("sales");
    } catch (err: any) {
      setError(err.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const fmtPrice = (n: number) => n > 0 ? `$${n.toLocaleString()}` : "—";
  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d)); }
    catch { return d; }
  };
  const fmtSqft = (n: number) => n > 0 ? `${n.toLocaleString()} sq ft` : "—";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-5">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔍</span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Market Intelligence</h1>
            <p className="text-sm text-slate-500">Search NYC property records — powered by NYC Open Data</p>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        {/* Search Form */}
        <form onSubmit={handleSearch} className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">Street address *</label>
              <input name="address" required placeholder="e.g., 350 5th Avenue" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="w-48">
              <label className="block text-sm font-medium text-slate-700 mb-1">Borough *</label>
              <select name="borough" required className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select...</option>
                <option value="Manhattan">Manhattan</option>
                <option value="Brooklyn">Brooklyn</option>
                <option value="Queens">Queens</option>
                <option value="Bronx">Bronx</option>
                <option value="Staten Island">Staten Island</option>
              </select>
            </div>
            <div className="w-32">
              <label className="block text-sm font-medium text-slate-700 mb-1">ZIP (optional)</label>
              <input name="zip" placeholder="10001" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={loading} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                {loading ? "Searching..." : "Search"}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        </form>

        {/* Results */}
        {results && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm text-slate-500">Sales Records</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{results.sales.length}</p>
                {results.sales.length > 0 && (
                  <p className="text-xs text-slate-400 mt-1">Last sale: {fmtPrice(results.sales[0]?.salePrice)} on {fmtDate(results.sales[0]?.saleDate)}</p>
                )}
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm text-slate-500">Building Permits</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{results.permits.length}</p>
                {results.permits.length > 0 && (
                  <p className="text-xs text-slate-400 mt-1">Latest: {fmtDate(results.permits[0]?.filingDate)}</p>
                )}
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm text-slate-500">DOB Violations</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{results.violations.length}</p>
                {results.violations.length > 0 && (
                  <p className="text-xs text-slate-400 mt-1">Latest: {fmtDate(results.violations[0]?.issueDate)}</p>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-xl border border-slate-200">
              <div className="flex border-b border-slate-200">
                {([
                  { key: "sales", label: `Sales History (${results.sales.length})`, icon: "💰" },
                  { key: "permits", label: `Permits (${results.permits.length})`, icon: "📋" },
                  { key: "violations", label: `Violations (${results.violations.length})`, icon: "⚠️" },
                ] as const).map(tab => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                    className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                    <span className="mr-1.5">{tab.icon}</span>{tab.label}
                  </button>
                ))}
              </div>

              {/* SALES TAB */}
              {activeTab === "sales" && (
                <div className="p-5">
                  {results.sales.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Address</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Neighborhood</th>
                            <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Sale Price</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Sale Date</th>
                            <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Sq Ft</th>
                            <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase">$/SqFt</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Year Built</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Units</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {results.sales.map((s, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-3 py-2.5 text-sm text-slate-900 font-medium">
                                {s.address}{s.apartmentNumber ? ` #${s.apartmentNumber}` : ""}
                              </td>
                              <td className="px-3 py-2.5 text-sm text-slate-600">{s.neighborhood || "—"}</td>
                              <td className="px-3 py-2.5 text-sm text-slate-900 font-semibold text-right">{fmtPrice(s.salePrice)}</td>
                              <td className="px-3 py-2.5 text-sm text-slate-600">{fmtDate(s.saleDate)}</td>
                              <td className="px-3 py-2.5 text-sm text-slate-600 text-right">{s.grossSqft > 0 ? s.grossSqft.toLocaleString() : "—"}</td>
                              <td className="px-3 py-2.5 text-sm text-slate-600 text-right">
                                {s.grossSqft > 0 && s.salePrice > 0 ? `$${Math.round(s.salePrice / s.grossSqft).toLocaleString()}` : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-sm text-slate-600">{s.yearBuilt > 0 ? s.yearBuilt : "—"}</td>
                              <td className="px-3 py-2.5 text-sm text-slate-600">{s.totalUnits > 0 ? s.totalUnits : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 text-center py-8">No sales records found for this address.</p>
                  )}
                </div>
              )}

              {/* PERMITS TAB */}
              {activeTab === "permits" && (
                <div className="p-5">
                  {results.permits.length > 0 ? (
                    <div className="space-y-3">
                      {results.permits.map((p, i) => (
                        <div key={i} className="border border-slate-200 rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-900">{p.jobDescription || p.jobType || "Permit"}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                  p.status === "ISSUED" || p.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" :
                                  p.status === "EXPIRED" ? "bg-red-50 text-red-700" :
                                  "bg-amber-50 text-amber-700"
                                }`}>{p.status}</span>
                              </div>
                              <p className="text-xs text-slate-500 mt-1">Job #{p.jobNumber} • Type: {p.jobType}</p>
                            </div>
                            {p.estimatedCost && <span className="text-sm font-semibold text-slate-700">{fmtPrice(p.estimatedCost)}</span>}
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                            <span>Filed: {fmtDate(p.filingDate)}</span>
                            {p.issuanceDate && <span>Issued: {fmtDate(p.issuanceDate)}</span>}
                            {p.expirationDate && <span>Expires: {fmtDate(p.expirationDate)}</span>}
                          </div>
                          {p.ownerName && <p className="text-xs text-slate-500 mt-1.5">Owner: {p.ownerName}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 text-center py-8">No building permits found for this address.</p>
                  )}
                </div>
              )}

              {/* VIOLATIONS TAB */}
              {activeTab === "violations" && (
                <div className="p-5">
                  {results.violations.length > 0 ? (
                    <div className="space-y-3">
                      {results.violations.map((v, i) => (
                        <div key={i} className="border border-slate-200 rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-900">{v.description || v.violationType || "Violation"}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                  v.status === "RESOLVE" || v.status === "DISMISSED" ? "bg-emerald-50 text-emerald-700" :
                                  v.status === "ACTIVE" || v.status === "OPEN" ? "bg-red-50 text-red-700" :
                                  "bg-amber-50 text-amber-700"
                                }`}>{v.status || "Unknown"}</span>
                              </div>
                              <p className="text-xs text-slate-500 mt-1">#{v.violationNumber} • {v.violationType} • {v.violationCategory}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                            <span>Issued: {fmtDate(v.issueDate)}</span>
                            {v.dispositionDate && <span>Resolved: {fmtDate(v.dispositionDate)}</span>}
                          </div>
                          {v.dispositionComments && <p className="text-xs text-slate-500 mt-1.5">{v.dispositionComments}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 text-center py-8">No DOB violations found for this address.</p>
                  )}
                </div>
              )}
            </div>

            {/* Data Source Attribution */}
            <p className="text-xs text-slate-400 mt-4 text-center">
              Data provided by NYC Open Data (data.cityofnewyork.us). Updated periodically by the City of New York.
            </p>
          </>
        )}

        {/* Empty State */}
        {!results && !loading && (
          <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
            <p className="text-4xl mb-4">🏙️</p>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Search any NYC property</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">Enter a street address and borough above to pull sales history, building permits, and DOB violations from NYC public records.</p>
          </div>
        )}
      </div>
    </div>
  );
}
