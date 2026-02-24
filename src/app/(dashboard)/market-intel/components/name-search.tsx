"use client";

import { useState } from "react";
import { searchByName } from "../actions";
import BuildingProfile from "../building-profile";
import { incrementSearchCount } from "@/lib/feature-gate-server";
import type { FilterState } from "../types";

const fmtPrice = (n: number) => (n > 0 ? `$${n.toLocaleString()}` : "—");
const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
  } catch {
    return d;
  }
};

interface NameSearchProps {
  filters: FilterState;
  plan: string;
  userId: string;
  initialQuery?: string;
  onSearchLimitReached?: () => void;
  onNameClick?: (name: string) => void;
}

export default function NameSearch({
  filters,
  plan,
  userId,
  initialQuery,
  onSearchLimitReached,
  onNameClick,
}: NameSearchProps) {
  const [nameResults, setNameResults] = useState<any | null>(null);
  const [nameDetailBuilding, setNameDetailBuilding] = useState<any>(null);
  const [nameQuery, setNameQuery] = useState(initialQuery || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (plan === "free") {
      const result = await incrementSearchCount(userId);
      if (!result.allowed) { onSearchLimitReached?.(); return; }
    }
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

  const searchOwnerName = async (name: string) => {
    if (onNameClick) {
      onNameClick(name);
      return;
    }
    setLoading(true);
    setError(null);
    setNameQuery(name);
    setNameDetailBuilding(null);
    try {
      setNameResults(await searchByName(name));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>
      )}

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

      {!nameResults && !loading && (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <p className="text-4xl mb-4">🔎</p>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Search by name</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Enter a person&apos;s name or LLC to find every property they&apos;re connected to across NYC deed, mortgage, and registration records.
          </p>
        </div>
      )}
    </>
  );
}
