"use client";

import { useState } from "react";
import { searchNewDevelopments } from "../new-development-actions";
import type { NewDevelopment } from "../new-development-actions";
import { createContactFromBuilding } from "../building-profile-actions";
import { getLists, addBuildingToList } from "../../prospecting/actions";
import { getNeighborhoodNameByZip, getZipCodesForNeighborhoods } from "@/lib/neighborhoods";
import NeighborhoodDropdown from "../neighborhood-dropdown";
import type { FilterState } from "../types";

interface NewDevelopmentSearchProps {
  filters: FilterState;
}

export default function NewDevelopmentSearch({ filters }: NewDevelopmentSearchProps) {
  // Search state
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
  const [ndNeighborhoods, setNdNeighborhoods] = useState<string[]>([]);

  // CRM state
  const [addingCrmId, setAddingCrmId] = useState<string | null>(null);
  const [crmResult, setCrmResult] = useState<{ id: string; message: string } | null>(null);

  // Pitch email state
  const [copiedPitch, setCopiedPitch] = useState(false);
  const [pitchModal, setPitchModal] = useState<NewDevelopment | null>(null);
  const [pitchTo, setPitchTo] = useState("");
  const [pitchSubject, setPitchSubject] = useState("");
  const [pitchBody, setPitchBody] = useState("");

  // Prospect list state
  const [saveModal, setSaveModal] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [prospectLists, setProspectLists] = useState<any[]>([]);

  // Helpers
  const fmtPrice = (n: number) => (n > 0 ? `$${n.toLocaleString()}` : "\u2014");
  const fmtDate = (d: string | null) => {
    if (!d) return "\u2014";
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
    const subject = `Leasing Services for ${nd.address || "Your New Development"}`;
    const body = `Hi ${nd.ownerName || "there"},\n\nI noticed your new ${nd.proposedUnits}-unit development at ${nd.address || "your property"} in ${nd.borough} recently received ${nd.filingStatus}.\n\nI specialize in lease-up services for new developments in ${nd.borough} and would love to discuss how I can help fill your building quickly and at optimal rents.\n\nMy recent lease-up track record includes:\n- [Your track record here]\n\nWould you have 15 minutes this week to discuss?\n\nBest,\n[Your name]`;
    setPitchSubject(subject);
    setPitchBody(body);
    setPitchTo("");
    setPitchModal(nd);
  };

  const handleSaveToList = async (listId: string, building: any) => {
    setSaving(true);
    try {
      await addBuildingToList(listId, {
        address: building.address || "",
        borough: building.borough || null,
        block: building.block || null,
        lot: building.lot || null,
        totalUnits: building.totalUnits || null,
        ownerName: building.ownerName || null,
        numFloors: building.numFloors || null,
        zoning: building.zoning || null,
        source: building.source || "new_development",
        ...(building.notes ? { notes: building.notes } : {}),
      });
      setSavedMsg("Saved!");
      setTimeout(() => setSavedMsg(null), 2000);
      setSaveModal(null);
    } catch (err) {
      console.error(err);
    } finally { setSaving(false); }
  };

  const boroughDisplayName = ({ MANHATTAN: "Manhattan", BRONX: "Bronx", BROOKLYN: "Brooklyn", QUEENS: "Queens", "STATEN ISLAND": "Staten Island" } as Record<string, string>)[ndFilters.borough] || "";

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

      {/* Pitch Compose Modal */}
      {pitchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Draft Leasing Pitch</h2>
                <p className="text-xs text-slate-500 mt-0.5">{pitchModal.address}</p>
              </div>
              <button onClick={() => setPitchModal(null)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">To (email)</label>
                <input
                  value={pitchTo}
                  onChange={(e) => setPitchTo(e.target.value)}
                  placeholder="developer@example.com"
                  type="email"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
                <input
                  value={pitchSubject}
                  onChange={(e) => setPitchSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
                <textarea
                  value={pitchBody}
                  onChange={(e) => setPitchBody(e.target.value)}
                  rows={12}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(pitchBody);
                    setCopiedPitch(true);
                    setTimeout(() => setCopiedPitch(false), 2000);
                  }}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {copiedPitch ? "Copied!" : "Copy to Clipboard"}
                </button>
                {pitchTo && (
                  <button
                    onClick={() => {
                      window.open(`mailto:${pitchTo}?subject=${encodeURIComponent(pitchSubject)}&body=${encodeURIComponent(pitchBody)}`, "_blank");
                    }}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm"
                  >
                    Open in Email Client
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search Form */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 mb-6">
        <p className="text-sm text-slate-500 mb-4">Search NYC DOB filings for new buildings (NB) and major alterations (A1). Find developers, unit counts, and contact info.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Borough</label>
            <select
              value={ndFilters.borough}
              onChange={(e) => { setNdFilters((f) => ({ ...f, borough: e.target.value })); setNdNeighborhoods([]); }}
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
            <NeighborhoodDropdown
              borough={boroughDisplayName}
              selected={ndNeighborhoods}
              onChange={setNdNeighborhoods}
            />
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
              <option value="R">Permit Issued</option>
              <option value="P">Plan Exam Approved</option>
              <option value="Q">Partial Permit</option>
              <option value="X">Signed Off</option>
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
                const ndZipCodes = ndNeighborhoods.length > 0 ? getZipCodesForNeighborhoods(ndNeighborhoods) : undefined;
                const results = await searchNewDevelopments({
                  borough: ndFilters.borough || undefined,
                  minUnits: ndFilters.minUnits || undefined,
                  jobType: ndFilters.jobType,
                  status: ndFilters.status || undefined,
                  minCost: ndFilters.minCost || undefined,
                  filedAfter: ndFilters.filedAfter || undefined,
                  zipCodes: ndZipCodes,
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

      {/* Loading State */}
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
                <p className="text-xs text-slate-500">{ndSelected.zip ? (() => { const nh = getNeighborhoodNameByZip(ndSelected.zip); return nh ? `${nh}, ${ndSelected.borough}` : ndSelected.borough; })() : ndSelected.borough}</p>
              </div>
              <button onClick={() => setNdSelected(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 text-lg">&times;</button>
            </div>
            <div className="p-5 space-y-6">
              {/* Address + badges */}
              <div>
                <h3 className="text-lg font-bold text-slate-900">{ndSelected.address || "No Address"}, {ndSelected.zip ? (() => { const nh = getNeighborhoodNameByZip(ndSelected.zip); return nh ? `${nh}, ${ndSelected.borough}` : ndSelected.borough; })() : ndSelected.borough}</h3>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${ndSelected.jobType === "NB" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {ndSelected.jobType === "NB" ? "New Building" : "Major Alteration"}
                  </span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${ndSelected.filingStatus === "R" || ndSelected.filingStatus === "X" || ndSelected.filingStatus === "P" ? "bg-emerald-50 text-emerald-700" : ndSelected.filingStatus === "Q" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                    {ndSelected.filingStatusDescription || ndSelected.filingStatus}
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
                        notes: JSON.stringify({
                          proposedUnits: ndSelected.proposedUnits,
                          estimatedCost: ndSelected.estimatedCost,
                          filingStatus: ndSelected.filingStatus,
                          developerName: ndSelected.ownerName || ndSelected.ownerBusiness,
                          filingDate: ndSelected.filingDate,
                          jobType: ndSelected.jobType,
                        }),
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

      {/* Results */}
      {!ndLoading && ndResults.length > 0 && (
        <>
          {/* Stats bar */}
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

          {/* Result cards */}
          <div className="space-y-3">
            {ndResults.map((nd, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 hover:border-blue-300 hover:shadow-md transition-all">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-slate-900">{nd.address || "No Address"}</h3>
                    <p className="text-sm text-slate-500 mt-0.5">{nd.zip ? (() => { const nh = getNeighborhoodNameByZip(nd.zip); return nh ? `${nh}, ${nd.borough}` : nd.borough; })() : nd.borough} &bull; Block {nd.block}, Lot {nd.lot}</p>
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
                  <span className={`font-semibold px-2 py-0.5 rounded ${nd.filingStatus === "R" || nd.filingStatus === "X" || nd.filingStatus === "P" ? "bg-emerald-50 text-emerald-700" : nd.filingStatus === "Q" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                    {nd.filingStatusDescription || nd.filingStatus}
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
                        notes: JSON.stringify({
                          proposedUnits: nd.proposedUnits,
                          estimatedCost: nd.estimatedCost,
                          filingStatus: nd.filingStatus,
                          developerName: nd.ownerName || nd.ownerBusiness,
                          filingDate: nd.filingDate,
                          jobType: nd.jobType,
                        }),
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

      {/* Empty state */}
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
  );
}
