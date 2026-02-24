"use client";

import { useState } from "react";
import { searchDistressedProperties } from "../building-profile-actions";
import type { RPIERecord } from "../building-profile-actions";
import BuildingProfile from "../building-profile";
import { getLists, addBuildingToList } from "../../prospecting/actions";
import type { FilterState } from "../types";

interface DistressedSearchProps {
  filters: FilterState;
  onNameClick?: (name: string) => void;
}

export default function DistressedSearch({ filters, onNameClick }: DistressedSearchProps) {
  const [distressedResults, setDistressedResults] = useState<RPIERecord[]>([]);
  const [distressedLoading, setDistressedLoading] = useState(false);
  const [distressedBorough, setDistressedBorough] = useState("");
  const [distressedMinUnits, setDistressedMinUnits] = useState(filters.minUnits || "");
  const [distressedMinValue, setDistressedMinValue] = useState(filters.minValue || "");
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [prospectLists, setProspectLists] = useState<any[]>([]);
  const [saveModal, setSaveModal] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const loadLists = async () => {
    try { const lists = await getLists(); setProspectLists(JSON.parse(JSON.stringify(lists))); } catch {}
  };

  const handleSaveToList = async (listId: string, building: any) => {
    setSaving(true);
    try {
      await addBuildingToList(listId, {
        address: building.address || "",
        borough: building.borough || null,
        block: building.block || null,
        lot: building.lot || null,
        totalUnits: building.totalUnits || building.units || null,
        ownerName: building.ownerName || null,
        assessedValue: building.assessedValue || null,
        source: building.source || "rpie_distressed",
      });
      setSavedMsg("Saved!");
      setTimeout(() => setSavedMsg(null), 2000);
      setSaveModal(null);
    } catch (err) {
      console.error(err);
    } finally { setSaving(false); }
  };

  const handleDistressedSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setDistressedLoading(true);
    try {
      const result = await searchDistressedProperties({
        borough: distressedBorough || undefined,
        minUnits: distressedMinUnits ? parseInt(distressedMinUnits) : undefined,
        minAssessedValue: distressedMinValue ? parseInt(distressedMinValue) : undefined,
        limit: 200,
      });
      setDistressedResults(result.properties);
    } catch {}
    setDistressedLoading(false);
  };

  return (
    <>
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

      {savedMsg && (
        <div className="fixed top-4 right-4 bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg z-50">{savedMsg}</div>
      )}

      <form onSubmit={handleDistressedSearch} className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Borough</label>
            <select value={distressedBorough} onChange={e => setDistressedBorough(e.target.value)}
              className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
              <option value="">All Boroughs</option>
              {["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"].map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Min Units</label>
            <input type="number" value={distressedMinUnits} onChange={e => setDistressedMinUnits(e.target.value)} placeholder="e.g., 10"
              className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Min Assessed Value</label>
            <input type="number" value={distressedMinValue} onChange={e => setDistressedMinValue(e.target.value)} placeholder="e.g., 1000000"
              className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={distressedLoading} className="w-full bg-orange-600 hover:bg-orange-700 text-white px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors">
              {distressedLoading ? "Searching..." : "Search RPIE Non-Filers"}
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2">RPIE non-compliant properties face fines up to $100K and cannot contest tax assessments — strong seller motivation signal.</p>
      </form>

      {distressedLoading && (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-4 border-orange-600 border-t-transparent" /></div>
      )}

      {!distressedLoading && distressedResults.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-orange-50 border-b border-orange-200 flex justify-between items-center">
            <p className="text-sm font-semibold text-orange-800">{distressedResults.length} RPIE Non-Compliant Properties</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2">Address</th>
                  <th className="text-left px-4 py-2">Borough</th>
                  <th className="text-right px-4 py-2">Units</th>
                  <th className="text-right px-4 py-2">Assessed Value</th>
                  <th className="text-left px-4 py-2">Owner</th>
                  <th className="text-left px-4 py-2">Year</th>
                  <th className="text-center px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {distressedResults.map((p, i) => (
                  <tr key={i} className="hover:bg-slate-50 cursor-pointer" onClick={() => {
                    if (p.bbl && p.bbl.length >= 10) {
                      const bCode = p.bbl[0];
                      const bl = p.bbl.slice(1, 6).replace(/^0+/, "") || "0";
                      const lt = p.bbl.slice(6, 10).replace(/^0+/, "") || "0";
                      setSelectedProperty({ boroCode: bCode, block: bl, lot: lt, address: p.address, borough: p.borough });
                    }
                  }}>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{p.address || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{p.borough || "—"}</td>
                    <td className="px-4 py-2.5 text-right">{p.units || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{p.assessedValue > 0 ? `$${p.assessedValue.toLocaleString()}` : "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600 max-w-[200px] truncate">{p.ownerName || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{p.filingYear || "—"}</td>
                    <td className="px-4 py-2.5 text-center">
                      <button onClick={(e) => { e.stopPropagation(); loadLists(); setSaveModal({ address: p.address, borough: p.borough, block: p.block, lot: p.lot, ownerName: p.ownerName, assessedValue: p.assessedValue, totalUnits: p.units, source: "rpie_distressed" }); }}
                        className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded hover:bg-blue-100 transition-colors">
                        + Prospect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!distressedLoading && distressedResults.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <p className="text-4xl mb-4">🔥</p>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Find Distressed Properties</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">Search RPIE non-compliant properties — owners facing fines and tax penalties are more motivated to sell.</p>
        </div>
      )}

      {selectedProperty && (
        <BuildingProfile
          boroCode={selectedProperty.boroCode}
          block={selectedProperty.block}
          lot={selectedProperty.lot}
          address={selectedProperty.address}
          borough={selectedProperty.borough}
          onClose={() => setSelectedProperty(null)}
          onNameClick={(name) => { onNameClick?.(name); }}
        />
      )}
    </>
  );
}
