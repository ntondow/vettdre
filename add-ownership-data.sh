#!/bin/bash
# Run from inside your vettdre directory:
#   bash add-ownership-data.sh

set -e
echo "🏗️  Adding multifamily ownership data to Market Intel..."

# ============================================================
# 1. UPDATED ACTIONS WITH OWNERSHIP SEARCH
# ============================================================
echo "⚡ Writing expanded actions with ownership lookup..."
cat > "src/app/(dashboard)/market-intel/actions.ts" << 'EOF'
"use server";

const BASE = "https://data.cityofnewyork.us/resource";
const SALES_ID = "usep-8jbt";
const VIOLATIONS_ID = "3h2n-5cm9";
const PERMITS_ID = "ic3t-wcy2";
const HPD_REGISTRATIONS = "tesw-yqqr";
const HPD_CONTACTS = "feu5-w2e2";

const BORO_CODE: Record<string, string> = {
  Manhattan: "1", Bronx: "2", Brooklyn: "3", Queens: "4", "Staten Island": "5",
};
const BORO_ID_HPD: Record<string, string> = {
  Manhattan: "MANHATTAN", Bronx: "BRONX", Brooklyn: "BROOKLYN", Queens: "QUEENS", "Staten Island": "STATEN ISLAND",
};

// ============================================================
// PROPERTY SEARCH (existing)
// ============================================================
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

  // SALES
  try {
    const url = new URL(`${BASE}/${SALES_ID}.json`);
    url.searchParams.set("$where", `borough='${boroCode}' AND upper(address) like '%${streetName}%'`);
    url.searchParams.set("$order", "sale_date DESC");
    url.searchParams.set("$limit", "25");
    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json();
      sales = data.filter((r: any) => parseInt((r.sale_price || "0").replace(/,/g, "")) > 1000).map((r: any) => ({
        address: r.address || "", apartmentNumber: r.apartment_number || null, neighborhood: r.neighborhood || "",
        borough: ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"][parseInt(r.borough)] || "",
        buildingClass: r.building_class_category || "", salePrice: parseInt((r.sale_price || "0").replace(/,/g, "")),
        saleDate: r.sale_date || "", grossSqft: parseInt((r.gross_square_feet || "0").replace(/,/g, "")),
        landSqft: parseInt((r.land_square_feet || "0").replace(/,/g, "")), yearBuilt: parseInt(r.year_built || "0"),
        totalUnits: parseInt(r.total_units || "0"), residentialUnits: parseInt(r.residential_units || "0"),
        commercialUnits: parseInt(r.commercial_units || "0"), zipCode: r.zip_code || "", block: r.block || "", lot: r.lot || "",
      }));
    }
  } catch (err) { console.error("Sales error:", err); }

  // PERMITS
  try {
    const url = new URL(`${BASE}/${PERMITS_ID}.json`);
    url.searchParams.set("$where", `house__='${houseNum}' AND upper(street_name) like '%${streetName}%'`);
    url.searchParams.set("$order", "filing_date DESC");
    url.searchParams.set("$limit", "20");
    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json();
      permits = data.map((r: any) => ({
        jobNumber: r.job__ || "", jobType: r.job_type || "", jobDescription: r.job_description || r.job_status_descrp || "",
        filingDate: r.filing_date || r.latest_action_date || "", issuanceDate: r.issuance_date || null,
        expirationDate: r.expiration_date || null, status: r.job_status_descrp || r.job_status || "",
        ownerName: r.owner_s_last_name ? `${r.owner_s_first_name || ""} ${r.owner_s_last_name}`.trim() : (r.owner_s_business_name || null),
        estimatedCost: r.estimated_job_cost ? parseFloat(String(r.estimated_job_cost).replace(/,/g, "")) : null,
      }));
    }
  } catch (err) { console.error("Permits error:", err); }

  // VIOLATIONS
  try {
    const url = new URL(`${BASE}/${VIOLATIONS_ID}.json`);
    url.searchParams.set("$where", `house_number='${houseNum}' AND upper(street) like '%${streetName}%'`);
    url.searchParams.set("$order", "issue_date DESC");
    url.searchParams.set("$limit", "20");
    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json();
      violations = data.map((r: any) => ({
        violationNumber: r.violation_number || r.isn_dob_bis_viol || "", violationType: r.violation_type || r.violation_type_code || "",
        violationCategory: r.violation_category || "", description: r.description || "", issueDate: r.issue_date || "",
        dispositionDate: r.disposition_date || null, dispositionComments: r.disposition_comments || null,
        status: r.disposition_date ? "Resolved" : "Open",
      }));
    }
  } catch (err) { console.error("Violations error:", err); }

  // Build unique buildings
  const buildingMap = new Map<string, any>();
  sales.forEach(s => {
    const key = s.address.replace(/,.*$/, "").trim();
    if (!buildingMap.has(key)) {
      buildingMap.set(key, { address: key, neighborhood: s.neighborhood, borough: s.borough, zipCode: s.zipCode,
        buildingClass: s.buildingClass, yearBuilt: s.yearBuilt, totalUnits: s.totalUnits, grossSqft: s.grossSqft,
        landSqft: s.landSqft, block: s.block, lot: s.lot, salesCount: 0, lastSalePrice: 0, lastSaleDate: "", sales: [] as any[] });
    }
    const b = buildingMap.get(key)!;
    b.salesCount++; b.sales.push(s);
    if (!b.lastSaleDate || s.saleDate > b.lastSaleDate) { b.lastSalePrice = s.salePrice; b.lastSaleDate = s.saleDate; }
    if (s.yearBuilt > b.yearBuilt) b.yearBuilt = s.yearBuilt;
    if (s.totalUnits > b.totalUnits) b.totalUnits = s.totalUnits;
    if (s.grossSqft > b.grossSqft) b.grossSqft = s.grossSqft;
  });

  return { sales, permits, violations, buildings: Array.from(buildingMap.values()).sort((a, b) => b.salesCount - a.salesCount), query: { address: rawAddress, borough, zip: "" } };
}

// ============================================================
// OWNERSHIP / LANDLORD SEARCH
// ============================================================
export async function searchOwnership(formData: FormData) {
  const borough = formData.get("borough") as string;
  const zip = (formData.get("zip") as string)?.trim();
  const streetName = (formData.get("street") as string)?.trim().toUpperCase();
  const minUnits = parseInt((formData.get("minUnits") as string) || "3");
  const ownerName = (formData.get("ownerName") as string)?.trim().toUpperCase();

  if (!borough && !zip && !ownerName) throw new Error("Please provide at least a borough, ZIP code, or owner name");

  const boroName = BORO_ID_HPD[borough] || "";

  // Step 1: Search HPD registrations for buildings
  let whereClause = "";
  const conditions: string[] = [];

  if (boroName) conditions.push(`upper(boroid) like '%${boroName.substring(0, 5)}%' OR upper(borough) like '%${boroName}%'`);
  if (zip) conditions.push(`zip='${zip}'`);
  if (streetName) conditions.push(`upper(streetaddress) like '%${streetName}%' OR upper(street) like '%${streetName}%'`);

  // Build a flexible where clause
  if (conditions.length > 0) {
    whereClause = conditions.join(" AND ");
  }

  console.log("=== OWNERSHIP SEARCH ===");
  console.log("Borough:", borough, "| ZIP:", zip, "| Street:", streetName, "| Min units:", minUnits, "| Owner:", ownerName);

  let registrations: any[] = [];
  let contacts: any[] = [];

  // Try HPD Registrations
  try {
    const url = new URL(`${BASE}/${HPD_REGISTRATIONS}.json`);
    if (zip) {
      url.searchParams.set("$where", `zip='${zip}'`);
    } else if (streetName && boroName) {
      url.searchParams.set("$where", `upper(streetaddress) like '%${streetName}%'`);
    } else if (boroName) {
      // Borough-only search is too broad, require more
      url.searchParams.set("$where", `boroid='${BORO_CODE[borough] || "1"}'`);
      url.searchParams.set("$limit", "50");
    }
    if (!url.searchParams.has("$limit")) url.searchParams.set("$limit", "100");
    url.searchParams.set("$order", "registrationenddate DESC");

    console.log("HPD Reg URL:", url.toString());
    const res = await fetch(url.toString());
    console.log("HPD Reg status:", res.status);

    if (res.ok) {
      const data = await res.json();
      console.log("HPD Reg raw count:", data.length);
      if (data.length > 0) console.log("HPD Reg fields:", Object.keys(data[0]).slice(0, 20).join(", "));

      registrations = data.map((r: any) => ({
        registrationId: r.registrationid || "",
        buildingId: r.buildingid || "",
        boroId: r.boroid || "",
        block: r.block || "",
        lot: r.lot || "",
        streetAddress: r.streetaddress || r.housenumber ? `${r.housenumber || ""} ${r.streetname || r.street || ""}`.trim() : "",
        zip: r.zip || "",
        buildingClass: r.buildingclass || "",
        totalUnits: parseInt(r.totalunits || "0"),
        registrationEndDate: r.registrationenddate || "",
        bin: r.bin || "",
        communityBoard: r.communityboard || "",
        lastRegistration: r.lastregistrationdate || r.registrationenddate || "",
      }));
    } else {
      const errText = (await res.text()).substring(0, 300);
      console.log("HPD Reg error:", errText);

      // Retry with different field names
      const url2 = new URL(`${BASE}/${HPD_REGISTRATIONS}.json`);
      url2.searchParams.set("$limit", "5");
      const res2 = await fetch(url2.toString());
      if (res2.ok) {
        const sample = await res2.json();
        if (sample.length > 0) console.log("HPD Reg ACTUAL fields:", Object.keys(sample[0]).join(", "));
      }
    }
  } catch (err) { console.error("HPD Reg error:", err); }

  // Step 2: Get contacts (owners) for found registrations
  const regIds = registrations.slice(0, 50).map(r => r.registrationId).filter(Boolean);

  if (regIds.length > 0) {
    try {
      // Fetch contacts for these registrations
      const regIdList = regIds.map(id => `'${id}'`).join(",");
      const url = new URL(`${BASE}/${HPD_CONTACTS}.json`);
      url.searchParams.set("$where", `registrationid in(${regIdList})`);
      url.searchParams.set("$limit", "500");

      console.log("HPD Contacts URL:", url.toString());
      const res = await fetch(url.toString());
      console.log("HPD Contacts status:", res.status);

      if (res.ok) {
        const data = await res.json();
        console.log("HPD Contacts raw count:", data.length);
        if (data.length > 0) console.log("HPD Contacts fields:", Object.keys(data[0]).slice(0, 20).join(", "));

        contacts = data.map((r: any) => ({
          registrationId: r.registrationid || "",
          type: r.type || r.contacttype || "",
          contactDescription: r.contactdescription || "",
          corporateName: r.corporationname || "",
          firstName: r.firstname || "",
          lastName: r.lastname || "",
          businessAddress: [r.businesshousenumber, r.businessstreetname, r.businessapartment].filter(Boolean).join(" ").trim(),
          businessCity: r.businesscity || "",
          businessState: r.businessstate || "",
          businessZip: r.businesszip || "",
        }));
      } else {
        const errText = (await res.text()).substring(0, 300);
        console.log("HPD Contacts error:", errText);
      }
    } catch (err) { console.error("HPD Contacts error:", err); }
  }

  // If user searched by owner name, also try direct contact search
  if (ownerName && contacts.length === 0) {
    try {
      const url = new URL(`${BASE}/${HPD_CONTACTS}.json`);
      url.searchParams.set("$where", `upper(corporationname) like '%${ownerName}%' OR (upper(lastname) like '%${ownerName}%')`);
      url.searchParams.set("$limit", "50");
      console.log("Owner name search URL:", url.toString());
      const res = await fetch(url.toString());
      console.log("Owner name search status:", res.status);
      if (res.ok) {
        const data = await res.json();
        console.log("Owner name search count:", data.length);
        contacts = data.map((r: any) => ({
          registrationId: r.registrationid || "",
          type: r.type || r.contacttype || "",
          contactDescription: r.contactdescription || "",
          corporateName: r.corporationname || "",
          firstName: r.firstname || "",
          lastName: r.lastname || "",
          businessAddress: [r.businesshousenumber, r.businessstreetname, r.businessapartment].filter(Boolean).join(" ").trim(),
          businessCity: r.businesscity || "",
          businessState: r.businessstate || "",
          businessZip: r.businesszip || "",
        }));

        // Now fetch the registrations for these contacts
        const contactRegIds = [...new Set(contacts.map(c => c.registrationId).filter(Boolean))];
        if (contactRegIds.length > 0) {
          const regUrl = new URL(`${BASE}/${HPD_REGISTRATIONS}.json`);
          regUrl.searchParams.set("$where", `registrationid in(${contactRegIds.slice(0, 30).map(id => `'${id}'`).join(",")})`);
          regUrl.searchParams.set("$limit", "100");
          const regRes = await fetch(regUrl.toString());
          if (regRes.ok) {
            const regData = await regRes.json();
            registrations = regData.map((r: any) => ({
              registrationId: r.registrationid || "", buildingId: r.buildingid || "", boroId: r.boroid || "",
              block: r.block || "", lot: r.lot || "",
              streetAddress: r.streetaddress || (r.housenumber ? `${r.housenumber} ${r.streetname || ""}`.trim() : ""),
              zip: r.zip || "", buildingClass: r.buildingclass || "", totalUnits: parseInt(r.totalunits || "0"),
              registrationEndDate: r.registrationenddate || "", bin: r.bin || "",
            }));
          }
        }
      }
    } catch (err) { console.error("Owner search error:", err); }
  }

  // Step 3: Merge registrations with their contacts
  const buildings = registrations
    .filter(r => r.totalUnits >= minUnits)
    .map(reg => {
      const owners = contacts
        .filter(c => c.registrationId === reg.registrationId)
        .filter(c => c.type === "CorporateOwner" || c.type === "IndividualOwner" || c.type === "Owner" ||
                     c.contactDescription?.includes("Owner") || c.type === "HeadOfficer" || c.type === "Agent");
      return { ...reg, owners };
    })
    .sort((a, b) => b.totalUnits - a.totalUnits);

  console.log(`=== OWNERSHIP RESULTS: ${buildings.length} buildings, ${contacts.length} contacts ===`);

  return { buildings, totalRegistrations: registrations.length, totalContacts: contacts.length };
}
EOF

# ============================================================
# 2. UPDATED SEARCH COMPONENT WITH OWNERSHIP TAB
# ============================================================
echo "🔍 Writing component with ownership search tab..."
cat > "src/app/(dashboard)/market-intel/market-intel-search.tsx" << 'SEARCHEOF'
"use client";

import { useState } from "react";
import { lookupProperty, searchOwnership } from "./actions";

type MainTab = "property" | "ownership";
type DetailTab = "sales" | "permits" | "violations";
type View = "results" | "building";

export default function MarketIntelSearch() {
  const [mainTab, setMainTab] = useState<MainTab>("property");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Property search state
  const [propResults, setPropResults] = useState<any | null>(null);
  const [view, setView] = useState<View>("results");
  const [selectedBuilding, setSelectedBuilding] = useState<any | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("sales");

  // Ownership search state
  const [ownerResults, setOwnerResults] = useState<any | null>(null);
  const [selectedOwnerBuilding, setSelectedOwnerBuilding] = useState<any | null>(null);

  const fmtPrice = (n: number) => n > 0 ? `$${n.toLocaleString()}` : "—";
  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d)); } catch { return d; }
  };

  const handlePropertySearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setLoading(true); setError(null); setView("results"); setSelectedBuilding(null);
    try { setPropResults(await lookupProperty(new FormData(e.currentTarget))); }
    catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const handleOwnershipSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setLoading(true); setError(null); setSelectedOwnerBuilding(null);
    try { setOwnerResults(await searchOwnership(new FormData(e.currentTarget))); }
    catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="px-8 py-5">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔍</span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Market Intelligence</h1>
              <p className="text-sm text-slate-500">NYC property records & ownership data — powered by NYC Open Data</p>
            </div>
          </div>
        </div>
        {/* Main Tabs */}
        <div className="px-8 flex gap-0">
          <button onClick={() => setMainTab("property")}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${mainTab === "property" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            🏠 Property Search
          </button>
          <button onClick={() => setMainTab("ownership")}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${mainTab === "ownership" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            👤 Ownership Lookup
          </button>
        </div>
      </div>

      <div className="px-8 py-6">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>}

        {/* ============================================================ */}
        {/* PROPERTY SEARCH TAB */}
        {/* ============================================================ */}
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
                  <select name="borough" required className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select...</option>
                    <option value="Manhattan">Manhattan</option><option value="Brooklyn">Brooklyn</option>
                    <option value="Queens">Queens</option><option value="Bronx">Bronx</option><option value="Staten Island">Staten Island</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button type="submit" disabled={loading} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">{loading ? "Searching..." : "Search"}</button>
                </div>
              </div>
            </form>

            {/* Property results (same as before) */}
            {propResults && view === "results" && (
              <>
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-sm text-slate-500">Buildings</p><p className="text-2xl font-bold text-slate-900 mt-1">{propResults.buildings.length}</p></div>
                  <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-sm text-slate-500">Sales Records</p><p className="text-2xl font-bold text-slate-900 mt-1">{propResults.sales.length}</p></div>
                  <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-sm text-slate-500">Permits</p><p className="text-2xl font-bold text-slate-900 mt-1">{propResults.permits.length}</p></div>
                  <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-sm text-slate-500">Violations</p><p className="text-2xl font-bold text-slate-900 mt-1">{propResults.violations.length}</p></div>
                </div>
                {propResults.buildings.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {propResults.buildings.map((b: any, i: number) => (
                      <button key={i} onClick={() => { setSelectedBuilding(b); setView("building"); setDetailTab("sales"); }}
                        className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-blue-300 hover:shadow-md transition-all group">
                        <div className="flex items-start justify-between">
                          <div><h3 className="text-base font-semibold text-slate-900 group-hover:text-blue-600">{b.address}</h3><p className="text-sm text-slate-500 mt-0.5">{b.neighborhood}, {b.borough} {b.zipCode}</p></div>
                          <span className="text-slate-400 group-hover:text-blue-500 text-lg">→</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-4">
                          <div><p className="text-xs text-slate-400">Last Sale</p><p className="text-sm font-semibold text-slate-900">{fmtPrice(b.lastSalePrice)}</p></div>
                          <div><p className="text-xs text-slate-400">Year Built</p><p className="text-sm text-slate-700">{b.yearBuilt || "—"}</p></div>
                          <div><p className="text-xs text-slate-400">Units</p><p className="text-sm text-slate-700">{b.totalUnits || "—"}</p></div>
                          <div><p className="text-xs text-slate-400">Sales</p><p className="text-sm text-slate-700">{b.salesCount}</p></div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {propResults.permits.length > 0 && (
                  <div className="mt-6"><h2 className="text-sm font-semibold text-slate-700 mb-3">📋 Permits</h2>
                    <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                      {propResults.permits.map((p: any, i: number) => (
                        <div key={i} className="p-4 flex items-start justify-between">
                          <div><span className="text-sm font-medium text-slate-900">{p.jobDescription || p.jobType}</span>
                            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${p.status.includes("APPROVED") || p.status.includes("SIGN") ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{p.status}</span>
                            <div className="flex gap-3 mt-1 text-xs text-slate-400"><span>#{p.jobNumber}</span><span>{fmtDate(p.filingDate)}</span>{p.ownerName && <span>Owner: {p.ownerName}</span>}</div>
                          </div>
                          {p.estimatedCost && <span className="text-sm font-semibold text-slate-700">{fmtPrice(p.estimatedCost)}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {propResults.violations.length > 0 && (
                  <div className="mt-6"><h2 className="text-sm font-semibold text-slate-700 mb-3">⚠️ Violations</h2>
                    <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                      {propResults.violations.map((v: any, i: number) => (
                        <div key={i} className="p-4 flex items-start justify-between">
                          <div><span className="text-sm font-medium text-slate-900">{v.description || v.violationType}</span>
                            <div className="flex gap-3 mt-1 text-xs text-slate-400"><span>#{v.violationNumber}</span><span>{fmtDate(v.issueDate)}</span></div>
                          </div>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${v.status === "Open" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{v.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Building Detail */}
            {propResults && view === "building" && selectedBuilding && (
              <div>
                <button onClick={() => setView("results")} className="text-sm text-blue-600 font-medium mb-4">&larr; Back</button>
                <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
                  <div className="flex items-start justify-between">
                    <div><h2 className="text-2xl font-bold text-slate-900">{selectedBuilding.address}</h2><p className="text-base text-slate-500 mt-1">{selectedBuilding.neighborhood}, {selectedBuilding.borough} {selectedBuilding.zipCode}</p></div>
                    <div className="text-right"><p className="text-sm text-slate-400">Last Sale</p><p className="text-2xl font-bold text-slate-900">{fmtPrice(selectedBuilding.lastSalePrice)}</p><p className="text-xs text-slate-400 mt-0.5">{fmtDate(selectedBuilding.lastSaleDate)}</p></div>
                  </div>
                  <div className="grid grid-cols-6 gap-4 mt-6 pt-6 border-t border-slate-100">
                    <div><p className="text-xs text-slate-400 uppercase">Year Built</p><p className="text-lg font-semibold text-slate-900 mt-0.5">{selectedBuilding.yearBuilt || "—"}</p></div>
                    <div><p className="text-xs text-slate-400 uppercase">Units</p><p className="text-lg font-semibold text-slate-900 mt-0.5">{selectedBuilding.totalUnits || "—"}</p></div>
                    <div><p className="text-xs text-slate-400 uppercase">Gross Sq Ft</p><p className="text-lg font-semibold text-slate-900 mt-0.5">{selectedBuilding.grossSqft > 0 ? selectedBuilding.grossSqft.toLocaleString() : "—"}</p></div>
                    <div><p className="text-xs text-slate-400 uppercase">Land Sq Ft</p><p className="text-lg font-semibold text-slate-900 mt-0.5">{selectedBuilding.landSqft > 0 ? selectedBuilding.landSqft.toLocaleString() : "—"}</p></div>
                    <div><p className="text-xs text-slate-400 uppercase">Block / Lot</p><p className="text-lg font-semibold text-slate-900 mt-0.5">{selectedBuilding.block} / {selectedBuilding.lot}</p></div>
                    <div><p className="text-xs text-slate-400 uppercase">Class</p><p className="text-sm font-semibold text-slate-900 mt-0.5">{selectedBuilding.buildingClass || "—"}</p></div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200">
                  <div className="flex border-b border-slate-200">
                    {(["sales", "permits", "violations"] as const).map(t => (
                      <button key={t} onClick={() => setDetailTab(t)} className={`px-5 py-3 text-sm font-medium border-b-2 capitalize ${detailTab === t ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"}`}>
                        {t === "sales" ? "💰" : t === "permits" ? "📋" : "⚠️"} {t} ({t === "sales" ? selectedBuilding.sales.length : t === "permits" ? propResults?.permits.length : propResults?.violations.length})
                      </button>
                    ))}
                  </div>
                  <div className="p-5">
                    {detailTab === "sales" && selectedBuilding.sales.length > 0 && (
                      <table className="w-full"><thead><tr className="border-b border-slate-200">
                        <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Address</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Price</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Date</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase">$/SqFt</th>
                      </tr></thead><tbody className="divide-y divide-slate-100">
                        {selectedBuilding.sales.map((s: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2.5 text-sm text-slate-900">{s.address}{s.apartmentNumber ? ` #${s.apartmentNumber}` : ""}</td>
                            <td className="px-3 py-2.5 text-sm font-semibold text-slate-900 text-right">{fmtPrice(s.salePrice)}</td>
                            <td className="px-3 py-2.5 text-sm text-slate-600">{fmtDate(s.saleDate)}</td>
                            <td className="px-3 py-2.5 text-sm text-slate-600 text-right">{s.grossSqft > 0 && s.salePrice > 0 ? `$${Math.round(s.salePrice / s.grossSqft).toLocaleString()}` : "—"}</td>
                          </tr>
                        ))}
                      </tbody></table>
                    )}
                    {detailTab === "sales" && selectedBuilding.sales.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No sales</p>}
                    {detailTab === "permits" && <p className="text-sm text-slate-400 text-center py-8">{propResults?.permits.length || 0} permits (see results page)</p>}
                    {detailTab === "violations" && <p className="text-sm text-slate-400 text-center py-8">{propResults?.violations.length || 0} violations (see results page)</p>}
                  </div>
                </div>
              </div>
            )}

            {!propResults && !loading && mainTab === "property" && (
              <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
                <p className="text-4xl mb-4">🏙️</p><h3 className="text-lg font-semibold text-slate-900 mb-2">Search any NYC property</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">Enter a street address and borough to pull sales history, building permits, and DOB violations.</p>
              </div>
            )}
          </>
        )}

        {/* ============================================================ */}
        {/* OWNERSHIP LOOKUP TAB */}
        {/* ============================================================ */}
        {mainTab === "ownership" && (
          <>
            <form onSubmit={handleOwnershipSearch} className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
              <p className="text-sm text-slate-500 mb-4">Search HPD-registered multifamily buildings (3+ units) to find owner names and contact info.</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Borough</label>
                  <select name="borough" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Any borough</option>
                    <option value="Manhattan">Manhattan</option><option value="Brooklyn">Brooklyn</option>
                    <option value="Queens">Queens</option><option value="Bronx">Bronx</option><option value="Staten Island">Staten Island</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ZIP code</label>
                  <input name="zip" placeholder="e.g., 11211" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Street name</label>
                  <input name="street" placeholder="e.g., Bedford Avenue" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Owner / Corp name</label>
                  <input name="ownerName" placeholder="e.g., Smith or ABC Realty LLC" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="flex items-end gap-4 mt-4">
                <div className="w-48">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Min. units</label>
                  <select name="minUnits" defaultValue="3" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="3">3+ units</option><option value="5">5+ units</option><option value="10">10+ units</option>
                    <option value="20">20+ units</option><option value="50">50+ units</option><option value="100">100+ units</option>
                  </select>
                </div>
                <button type="submit" disabled={loading} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">{loading ? "Searching..." : "Search Owners"}</button>
              </div>
            </form>

            {/* Ownership Results */}
            {ownerResults && (
              <>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-sm text-slate-500">Buildings Found</p><p className="text-2xl font-bold text-slate-900 mt-1">{ownerResults.buildings.length}</p></div>
                  <div className="bg-white rounded-xl border border-slate-200 p-5"><p className="text-sm text-slate-500">Owner Records</p><p className="text-2xl font-bold text-slate-900 mt-1">{ownerResults.totalContacts}</p></div>
                </div>

                {ownerResults.buildings.length > 0 ? (
                  <div className="space-y-4">
                    {ownerResults.buildings.map((b: any, i: number) => (
                      <div key={i} className={`bg-white rounded-xl border transition-all ${selectedOwnerBuilding === i ? "border-blue-300 shadow-md" : "border-slate-200"}`}>
                        <button onClick={() => setSelectedOwnerBuilding(selectedOwnerBuilding === i ? null : i)} className="w-full p-5 text-left">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="text-base font-semibold text-slate-900">{b.streetAddress || `Block ${b.block}, Lot ${b.lot}`}</h3>
                              <p className="text-sm text-slate-500 mt-0.5">ZIP: {b.zip} • Block {b.block}, Lot {b.lot}</p>
                            </div>
                            <div className="text-right">
                              <span className="inline-flex items-center px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-sm font-semibold">{b.totalUnits} units</span>
                              {b.buildingClass && <p className="text-xs text-slate-400 mt-1">Class: {b.buildingClass}</p>}
                            </div>
                          </div>
                          {b.owners.length > 0 && (
                            <div className="flex items-center gap-2 mt-3">
                              <span className="text-xs text-slate-400">Owner:</span>
                              <span className="text-sm font-medium text-slate-700">
                                {b.owners[0].corporateName || `${b.owners[0].firstName} ${b.owners[0].lastName}`.trim() || "Unknown"}
                              </span>
                              {b.owners.length > 1 && <span className="text-xs text-slate-400">+{b.owners.length - 1} more</span>}
                            </div>
                          )}
                        </button>

                        {/* Expanded owner details */}
                        {selectedOwnerBuilding === i && b.owners.length > 0 && (
                          <div className="border-t border-slate-100 p-5 bg-slate-50/50">
                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Registered Owners & Contacts</h4>
                            <div className="space-y-3">
                              {b.owners.map((o: any, j: number) => (
                                <div key={j} className="bg-white rounded-lg border border-slate-200 p-4">
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">
                                        {o.corporateName || `${o.firstName} ${o.lastName}`.trim() || "Unknown"}
                                      </p>
                                      <span className="text-xs text-slate-400">{o.type || o.contactDescription}</span>
                                    </div>
                                  </div>
                                  {(o.businessAddress || o.businessCity) && (
                                    <p className="text-sm text-slate-600 mt-2">
                                      📍 {[o.businessAddress, o.businessCity, o.businessState, o.businessZip].filter(Boolean).join(", ")}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                    <p className="text-sm text-slate-500">No buildings found matching your criteria. Try broadening your search.</p>
                  </div>
                )}

                <p className="text-xs text-slate-400 mt-6 text-center">Owner data from HPD Registration database (data.cityofnewyork.us). Updated periodically.</p>
              </>
            )}

            {!ownerResults && !loading && mainTab === "ownership" && (
              <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
                <p className="text-4xl mb-4">👤</p>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Find multifamily building owners</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">Search by ZIP code, street, or owner name to find HPD-registered multifamily buildings and their owners.</p>
              </div>
            )}
          </>
        )}

        <p className="text-xs text-slate-400 mt-6 text-center">Data provided by NYC Open Data (data.cityofnewyork.us)</p>
      </div>
    </div>
  );
}
SEARCHEOF

echo ""
echo "✅ Ownership lookup added to Market Intel!"
echo ""
echo "Go to http://localhost:3000/market-intel"
echo "Click the 'Ownership Lookup' tab"
echo "Try searching by ZIP code (e.g., 11211) with 10+ units"
