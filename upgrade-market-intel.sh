#!/bin/bash
# Run from inside your vettdre directory:
#   bash upgrade-market-intel.sh

set -e
echo "🏗️  Upgrading Market Intel with building detail view..."

# ============================================================
# 1. FIX ACTIONS + ADD DETAIL LOOKUP
# ============================================================
echo "⚡ Fixing permits query and adding detail lookup..."
cat > "src/app/(dashboard)/market-intel/actions.ts" << 'EOF'
"use server";

const BASE = "https://data.cityofnewyork.us/resource";
const SALES_ID = "usep-8jbt";
const VIOLATIONS_ID = "3h2n-5cm9";
const PERMITS_ID = "ic3t-wcy2";

const BORO_CODE: Record<string, string> = {
  Manhattan: "1", Bronx: "2", Brooklyn: "3", Queens: "4", "Staten Island": "5",
};

export async function lookupProperty(formData: FormData) {
  const rawAddress = (formData.get("address") as string).trim();
  const borough = formData.get("borough") as string;

  if (!rawAddress || !borough) throw new Error("Address and borough are required");

  const parts = rawAddress.split(/\s+/);
  const houseNum = parts[0];
  const streetName = parts.slice(1).join(" ").toUpperCase();
  const boroCode = BORO_CODE[borough] || "1";

  let sales: any[] = [];
  let permits: any[] = [];
  let violations: any[] = [];

  // === SALES ===
  try {
    const url = new URL(`${BASE}/${SALES_ID}.json`);
    url.searchParams.set("$where", `borough='${boroCode}' AND upper(address) like '%${streetName}%'`);
    url.searchParams.set("$order", "sale_date DESC");
    url.searchParams.set("$limit", "25");
    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json();
      sales = data
        .filter((r: any) => parseInt((r.sale_price || "0").replace(/,/g, "")) > 1000)
        .map((r: any) => ({
          address: r.address || "",
          apartmentNumber: r.apartment_number || null,
          neighborhood: r.neighborhood || "",
          borough: ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"][parseInt(r.borough)] || "",
          buildingClass: r.building_class_category || r.building_class_at_time_of || "",
          salePrice: parseInt((r.sale_price || "0").replace(/,/g, "")),
          saleDate: r.sale_date || "",
          grossSqft: parseInt((r.gross_square_feet || "0").replace(/,/g, "")),
          landSqft: parseInt((r.land_square_feet || "0").replace(/,/g, "")),
          yearBuilt: parseInt(r.year_built || "0"),
          totalUnits: parseInt(r.total_units || "0"),
          residentialUnits: parseInt(r.residential_units || "0"),
          commercialUnits: parseInt(r.commercial_units || "0"),
          zipCode: r.zip_code || "",
          block: r.block || "",
          lot: r.lot || "",
          taxClass: r.tax_class_at_present || "",
        }));
    }
  } catch (err) { console.error("Sales error:", err); }

  // === PERMITS (field is house__ not house_no) ===
  try {
    const url = new URL(`${BASE}/${PERMITS_ID}.json`);
    url.searchParams.set("$where", `house__='${houseNum}' AND upper(street_name) like '%${streetName}%'`);
    url.searchParams.set("$order", "filing_date DESC");
    url.searchParams.set("$limit", "20");
    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json();
      permits = data.map((r: any) => ({
        jobNumber: r.job__ || "",
        jobType: r.job_type || "",
        jobDescription: r.job_description || r.job_status_descrp || "",
        filingDate: r.filing_date || r.latest_action_date || "",
        issuanceDate: r.issuance_date || null,
        expirationDate: r.expiration_date || null,
        status: r.job_status_descrp || r.job_status || "",
        ownerName: r.owner_s_last_name ? `${r.owner_s_first_name || ""} ${r.owner_s_last_name}`.trim() : (r.owner_s_business_name || null),
        ownerPhone: r.owner_s_phone__ || null,
        estimatedCost: r.estimated_job_cost ? parseFloat(String(r.estimated_job_cost).replace(/,/g, "")) : null,
        borough: r.borough || "",
        bin: r.bin__ || "",
      }));
    }
  } catch (err) { console.error("Permits error:", err); }

  // === VIOLATIONS ===
  try {
    const url = new URL(`${BASE}/${VIOLATIONS_ID}.json`);
    url.searchParams.set("$where", `house_number='${houseNum}' AND upper(street) like '%${streetName}%'`);
    url.searchParams.set("$order", "issue_date DESC");
    url.searchParams.set("$limit", "20");
    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json();
      violations = data.map((r: any) => ({
        violationNumber: r.violation_number || r.isn_dob_bis_viol || "",
        violationType: r.violation_type || r.violation_type_code || "",
        violationCategory: r.violation_category || "",
        description: r.description || "",
        issueDate: r.issue_date || "",
        dispositionDate: r.disposition_date || null,
        dispositionComments: r.disposition_comments || null,
        status: r.disposition_date ? "Resolved" : "Open",
      }));
    }
  } catch (err) { console.error("Violations error:", err); }

  // Build unique buildings from sales data
  const buildingMap = new Map<string, any>();
  sales.forEach(s => {
    const key = s.address.replace(/,.*$/, "").trim(); // Remove apt number
    if (!buildingMap.has(key)) {
      buildingMap.set(key, {
        address: key,
        neighborhood: s.neighborhood,
        borough: s.borough,
        zipCode: s.zipCode,
        buildingClass: s.buildingClass,
        yearBuilt: s.yearBuilt,
        totalUnits: s.totalUnits,
        grossSqft: s.grossSqft,
        landSqft: s.landSqft,
        block: s.block,
        lot: s.lot,
        salesCount: 0,
        lastSalePrice: 0,
        lastSaleDate: "",
        sales: [] as any[],
      });
    }
    const b = buildingMap.get(key)!;
    b.salesCount++;
    b.sales.push(s);
    if (!b.lastSaleDate || s.saleDate > b.lastSaleDate) {
      b.lastSalePrice = s.salePrice;
      b.lastSaleDate = s.saleDate;
    }
    if (s.yearBuilt > b.yearBuilt) b.yearBuilt = s.yearBuilt;
    if (s.totalUnits > b.totalUnits) b.totalUnits = s.totalUnits;
    if (s.grossSqft > b.grossSqft) b.grossSqft = s.grossSqft;
  });

  const buildings = Array.from(buildingMap.values()).sort((a, b) => b.salesCount - a.salesCount);

  return { sales, permits, violations, buildings, query: { address: rawAddress, borough, zip: "" } };
}
EOF

# ============================================================
# 2. UPDATED SEARCH COMPONENT WITH BUILDING CARDS + DETAIL VIEW
# ============================================================
echo "🔍 Writing upgraded search with building detail..."
cat > "src/app/(dashboard)/market-intel/market-intel-search.tsx" << 'SEARCHEOF'
"use client";

import { useState } from "react";
import { lookupProperty } from "./actions";

type View = "results" | "building";

export default function MarketIntelSearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<any | null>(null);
  const [view, setView] = useState<View>("results");
  const [selectedBuilding, setSelectedBuilding] = useState<any | null>(null);
  const [detailTab, setDetailTab] = useState<"sales" | "permits" | "violations">("sales");

  const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true); setError(null); setView("results"); setSelectedBuilding(null);
    try {
      const data = await lookupProperty(new FormData(e.currentTarget));
      setResults(data);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const openBuilding = (building: any) => {
    setSelectedBuilding(building);
    setView("building");
    setDetailTab("sales");
  };

  const fmtPrice = (n: number) => n > 0 ? `$${n.toLocaleString()}` : "—";
  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d)); }
    catch { return d; }
  };

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
              <input name="address" required placeholder="e.g., 350 Park Avenue" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
            <div className="flex items-end">
              <button type="submit" disabled={loading} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                {loading ? "Searching..." : "Search"}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        </form>

        {/* RESULTS VIEW */}
        {results && view === "results" && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm text-slate-500">Buildings Found</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{results.buildings.length}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm text-slate-500">Sales Records</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{results.sales.length}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm text-slate-500">Building Permits</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{results.permits.length}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm text-slate-500">DOB Violations</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{results.violations.length}</p>
              </div>
            </div>

            {/* Building Cards */}
            {results.buildings.length > 0 ? (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-700">Buildings on this street</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {results.buildings.map((b: any, i: number) => (
                    <button key={i} onClick={() => openBuilding(b)}
                      className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-blue-300 hover:shadow-md transition-all group">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-base font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">{b.address}</h3>
                          <p className="text-sm text-slate-500 mt-0.5">{b.neighborhood}, {b.borough} {b.zipCode}</p>
                        </div>
                        <span className="text-slate-400 group-hover:text-blue-500 transition-colors text-lg">→</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-4">
                        <div>
                          <p className="text-xs text-slate-400">Last Sale</p>
                          <p className="text-sm font-semibold text-slate-900">{fmtPrice(b.lastSalePrice)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Sale Date</p>
                          <p className="text-sm text-slate-700">{fmtDate(b.lastSaleDate)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Year Built</p>
                          <p className="text-sm text-slate-700">{b.yearBuilt || "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Units</p>
                          <p className="text-sm text-slate-700">{b.totalUnits || "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Gross Sq Ft</p>
                          <p className="text-sm text-slate-700">{b.grossSqft > 0 ? b.grossSqft.toLocaleString() : "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Sales History</p>
                          <p className="text-sm text-slate-700">{b.salesCount} record{b.salesCount !== 1 ? "s" : ""}</p>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <p className="text-xs text-slate-400">{b.buildingClass}</p>
                        {b.block && <p className="text-xs text-slate-400">Block {b.block}, Lot {b.lot}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <p className="text-sm text-slate-500">No buildings found. Try adjusting your search.</p>
              </div>
            )}

            {/* All Permits */}
            {results.permits.length > 0 && (
              <div className="mt-6">
                <h2 className="text-sm font-semibold text-slate-700 mb-3">📋 Building Permits at this address</h2>
                <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {results.permits.map((p: any, i: number) => (
                    <div key={i} className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-sm font-medium text-slate-900">{p.jobDescription || p.jobType || "Permit"}</span>
                          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${
                            p.status.includes("APPROVED") || p.status.includes("ISSUED") || p.status.includes("SIGN") ? "bg-emerald-50 text-emerald-700" :
                            p.status.includes("EXPIRED") || p.status.includes("DISAPPROVED") ? "bg-red-50 text-red-700" :
                            "bg-amber-50 text-amber-700"
                          }`}>{p.status}</span>
                        </div>
                        {p.estimatedCost && <span className="text-sm font-semibold text-slate-700">{fmtPrice(p.estimatedCost)}</span>}
                      </div>
                      <div className="flex gap-4 mt-1 text-xs text-slate-400">
                        <span>Job #{p.jobNumber}</span>
                        <span>Filed: {fmtDate(p.filingDate)}</span>
                        {p.ownerName && <span>Owner: {p.ownerName}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All Violations */}
            {results.violations.length > 0 && (
              <div className="mt-6">
                <h2 className="text-sm font-semibold text-slate-700 mb-3">⚠️ DOB Violations at this address</h2>
                <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {results.violations.map((v: any, i: number) => (
                    <div key={i} className="p-4">
                      <div className="flex items-start justify-between">
                        <span className="text-sm font-medium text-slate-900">{v.description || v.violationType || "Violation"}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${v.status === "Open" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{v.status}</span>
                      </div>
                      <div className="flex gap-4 mt-1 text-xs text-slate-400">
                        <span>#{v.violationNumber}</span>
                        <span>{v.violationType} • {v.violationCategory}</span>
                        <span>Issued: {fmtDate(v.issueDate)}</span>
                        {v.dispositionDate && <span>Resolved: {fmtDate(v.dispositionDate)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-slate-400 mt-6 text-center">Data provided by NYC Open Data (data.cityofnewyork.us)</p>
          </>
        )}

        {/* BUILDING DETAIL VIEW */}
        {view === "building" && selectedBuilding && (
          <div>
            {/* Back button */}
            <button onClick={() => setView("results")} className="text-sm text-blue-600 font-medium mb-4 hover:text-blue-700">&larr; Back to results</button>

            {/* Building Header */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">{selectedBuilding.address}</h2>
                  <p className="text-base text-slate-500 mt-1">{selectedBuilding.neighborhood}, {selectedBuilding.borough} {selectedBuilding.zipCode}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-400">Last Sale Price</p>
                  <p className="text-2xl font-bold text-slate-900">{fmtPrice(selectedBuilding.lastSalePrice)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{fmtDate(selectedBuilding.lastSaleDate)}</p>
                </div>
              </div>

              {/* Building Stats */}
              <div className="grid grid-cols-6 gap-4 mt-6 pt-6 border-t border-slate-100">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Year Built</p>
                  <p className="text-lg font-semibold text-slate-900 mt-0.5">{selectedBuilding.yearBuilt || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Total Units</p>
                  <p className="text-lg font-semibold text-slate-900 mt-0.5">{selectedBuilding.totalUnits || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Gross Sq Ft</p>
                  <p className="text-lg font-semibold text-slate-900 mt-0.5">{selectedBuilding.grossSqft > 0 ? selectedBuilding.grossSqft.toLocaleString() : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Land Sq Ft</p>
                  <p className="text-lg font-semibold text-slate-900 mt-0.5">{selectedBuilding.landSqft > 0 ? selectedBuilding.landSqft.toLocaleString() : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Block / Lot</p>
                  <p className="text-lg font-semibold text-slate-900 mt-0.5">{selectedBuilding.block || "—"} / {selectedBuilding.lot || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Building Class</p>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5">{selectedBuilding.buildingClass || "—"}</p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-xl border border-slate-200">
              <div className="flex border-b border-slate-200">
                {([
                  { key: "sales" as const, label: `Sales History (${selectedBuilding.sales.length})`, icon: "💰" },
                  { key: "permits" as const, label: `Permits (${results?.permits.length || 0})`, icon: "📋" },
                  { key: "violations" as const, label: `Violations (${results?.violations.length || 0})`, icon: "⚠️" },
                ]).map(tab => (
                  <button key={tab.key} onClick={() => setDetailTab(tab.key)}
                    className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${detailTab === tab.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                    <span className="mr-1.5">{tab.icon}</span>{tab.label}
                  </button>
                ))}
              </div>

              <div className="p-5">
                {/* SALES */}
                {detailTab === "sales" && (
                  selectedBuilding.sales.length > 0 ? (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Address / Unit</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Sale Price</th>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Date</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Sq Ft</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase">$/Sq Ft</th>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedBuilding.sales.map((s: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2.5 text-sm text-slate-900">{s.address}{s.apartmentNumber ? ` #${s.apartmentNumber}` : ""}</td>
                            <td className="px-3 py-2.5 text-sm font-semibold text-slate-900 text-right">{fmtPrice(s.salePrice)}</td>
                            <td className="px-3 py-2.5 text-sm text-slate-600">{fmtDate(s.saleDate)}</td>
                            <td className="px-3 py-2.5 text-sm text-slate-600 text-right">{s.grossSqft > 0 ? s.grossSqft.toLocaleString() : "—"}</td>
                            <td className="px-3 py-2.5 text-sm text-slate-600 text-right">{s.grossSqft > 0 && s.salePrice > 0 ? `$${Math.round(s.salePrice / s.grossSqft).toLocaleString()}` : "—"}</td>
                            <td className="px-3 py-2.5 text-xs text-slate-500">{s.buildingClass}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="text-sm text-slate-400 text-center py-8">No sales records</p>
                )}

                {/* PERMITS */}
                {detailTab === "permits" && (
                  results?.permits.length > 0 ? (
                    <div className="space-y-3">
                      {results.permits.map((p: any, i: number) => (
                        <div key={i} className="border border-slate-200 rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="text-sm font-medium text-slate-900">{p.jobDescription || p.jobType}</span>
                              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${
                                p.status.includes("APPROVED") || p.status.includes("ISSUED") || p.status.includes("SIGN") ? "bg-emerald-50 text-emerald-700" :
                                p.status.includes("EXPIRED") || p.status.includes("DISAPPROVED") ? "bg-red-50 text-red-700" :
                                "bg-amber-50 text-amber-700"
                              }`}>{p.status}</span>
                            </div>
                            {p.estimatedCost && <span className="text-sm font-semibold text-slate-700">{fmtPrice(p.estimatedCost)}</span>}
                          </div>
                          <div className="flex gap-4 mt-1 text-xs text-slate-400">
                            <span>Job #{p.jobNumber}</span>
                            <span>Filed: {fmtDate(p.filingDate)}</span>
                            {p.ownerName && <span>Owner: {p.ownerName}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-slate-400 text-center py-8">No permits found</p>
                )}

                {/* VIOLATIONS */}
                {detailTab === "violations" && (
                  results?.violations.length > 0 ? (
                    <div className="space-y-3">
                      {results.violations.map((v: any, i: number) => (
                        <div key={i} className="border border-slate-200 rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <span className="text-sm font-medium text-slate-900">{v.description || v.violationType}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${v.status === "Open" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{v.status}</span>
                          </div>
                          <div className="flex gap-4 mt-1 text-xs text-slate-400">
                            <span>#{v.violationNumber}</span>
                            <span>{v.violationType} • {v.violationCategory}</span>
                            <span>Issued: {fmtDate(v.issueDate)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-slate-400 text-center py-8">No violations found</p>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-400 mt-6 text-center">Data provided by NYC Open Data (data.cityofnewyork.us)</p>
          </div>
        )}

        {/* Empty State */}
        {!results && !loading && (
          <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
            <p className="text-4xl mb-4">🏙️</p>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Search any NYC property</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">Enter a street address and borough to pull sales history, building permits, and DOB violations from NYC public records.</p>
          </div>
        )}
      </div>
    </div>
  );
}
SEARCHEOF

echo ""
echo "✅ Market Intel upgraded!"
echo "Search results now show clickable building cards."
echo "Click any building to see its full detail page with sales, permits, and violations."
