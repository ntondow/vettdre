"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { lookupProperty, lookupPropertyByBBL, searchAddresses, searchOwnership, searchByName } from "./actions";
import type { AddressSuggestion } from "./actions";
import { searchNewDevelopments, NewDevelopment } from "./new-development-actions";
import { createContactFromBuilding, searchDistressedProperties, checkRPIENonCompliance, searchByEnergyGrade } from "./building-profile-actions";
import type { RPIERecord, LL84Data } from "./building-profile-actions";
import BuildingDetail from "./building-detail";
import BuildingProfile from "./building-profile";
import { getLists, addBuildingToList } from "../prospecting/actions";
import { getNeighborhoodsByBorough, getNeighborhoodNameByZip, getNeighborhoodByZip, getZipCodesForNeighborhoods } from "@/lib/neighborhoods";
import { getCounties, getMunicipalitiesByCounty } from "@/lib/neighborhoods-nys";
import { getNJCounties, getNJMunicipalitiesByCounty } from "@/lib/neighborhoods-nj";
import { searchNYSProperties, searchNYSAddresses } from "./nys-actions";
import type { NYSPropertyResult } from "./nys-actions";
import { searchNJProperties, searchNJAddresses } from "./nj-actions";
import type { NJPropertyResult } from "./nj-actions";
import NYSBuildingProfile from "./nys-building-profile";
import NJBuildingProfile from "./nj-building-profile";
import { searchAreaListings, type ParsedListing } from "@/lib/brave-listings";
import { isBraveSearchAvailable } from "@/lib/brave-search";
import NeighborhoodDropdown from "./neighborhood-dropdown";
import dynamic from "next/dynamic";
const MapSearch = dynamic(() => import("./map-search"), { ssr: false, loading: () => <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div></div> });

type MainTab = "property" | "ownership" | "name" | "map" | "new-development" | "distressed" | "on-market";
type View = "results" | "building";

export default function MarketIntelSearch() {
  const router = useRouter();
  const [market, setMarket] = useState<"nyc" | "nys" | "nj">("nyc");
  const [mainTab, setMainTab] = useState<MainTab>("property");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // NYS search state
  const [nysCounty, setNysCounty] = useState("");
  const [nysMunicipality, setNysMunicipality] = useState("");
  const [nysAddress, setNysAddress] = useState("");
  const [nysOwner, setNysOwner] = useState("");
  const [nysMinUnits, setNysMinUnits] = useState("");
  const [nysResults, setNysResults] = useState<NYSPropertyResult[]>([]);
  const [nysLoading, setNysLoading] = useState(false);
  const [nysSelectedProperty, setNysSelectedProperty] = useState<NYSPropertyResult | null>(null);
  const [nysViewProfile, setNysViewProfile] = useState(false);
  const [nysSuggestions, setNysSuggestions] = useState<{ address: string; municipality: string; swisCode: string; printKey: string }[]>([]);
  const [showNysSuggestions, setShowNysSuggestions] = useState(false);
  const nysDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nysSuggestionsRef = useRef<HTMLDivElement>(null);

  // NJ search state
  const [njCounty, setNjCounty] = useState("");
  const [njMunicipality, setNjMunicipality] = useState("");
  const [njAddress, setNjAddress] = useState("");
  const [njOwner, setNjOwner] = useState("");
  const [njMinUnits, setNjMinUnits] = useState("");
  const [njResults, setNjResults] = useState<NJPropertyResult[]>([]);
  const [njLoading, setNjLoading] = useState(false);
  const [njSelectedProperty, setNjSelectedProperty] = useState<NJPropertyResult | null>(null);
  const [njViewProfile, setNjViewProfile] = useState(false);

  // Distressed (RPIE) search state
  const [distressedResults, setDistressedResults] = useState<RPIERecord[]>([]);
  const [distressedLoading, setDistressedLoading] = useState(false);
  const [distressedBorough, setDistressedBorough] = useState("");
  const [distressedMinUnits, setDistressedMinUnits] = useState("");
  const [distressedMinValue, setDistressedMinValue] = useState("");

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
  const [pitchModal, setPitchModal] = useState<NewDevelopment | null>(null);
  const [pitchTo, setPitchTo] = useState("");
  const [pitchSubject, setPitchSubject] = useState("");
  const [pitchBody, setPitchBody] = useState("");

  // On-Market listings search (Brave)
  const [omResults, setOmResults] = useState<ParsedListing[]>([]);
  const [omLoading, setOmLoading] = useState(false);
  const [omArea, setOmArea] = useState("");
  const [omMinPrice, setOmMinPrice] = useState("");
  const [omMaxPrice, setOmMaxPrice] = useState("");
  const [omMinUnits, setOmMinUnits] = useState("");
  const [omBraveAvailable, setOmBraveAvailable] = useState<boolean | null>(null);
  const [omSelectedListing, setOmSelectedListing] = useState<ParsedListing | null>(null);

  // Property search — address typeahead
  const [propQuery, setPropQuery] = useState("");
  const [propSuggestions, setPropSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<AddressSuggestion | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Property search neighborhood
  const [propBorough, setPropBorough] = useState("");
  const [propNeighborhoods, setPropNeighborhoods] = useState<string[]>([]);

  // Ownership neighborhood filter
  const [ownerBorough, setOwnerBorough] = useState("");
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>([]);
  const [neighborhoodSearch, setNeighborhoodSearch] = useState("");
  const [showNeighborhoodDropdown, setShowNeighborhoodDropdown] = useState(false);
  const neighborhoodRef = useRef<HTMLDivElement>(null);

  // New development neighborhood
  const [ndNeighborhoods, setNdNeighborhoods] = useState<string[]>([]);

  const fmtPrice = (n: number) => (n > 0 ? `$${n.toLocaleString()}` : "—");
  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try {
      return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
    } catch {
      return d;
    }
  };

  // Debounced address search
  const handleAddressInput = useCallback((value: string) => {
    setPropQuery(value);
    setSelectedSuggestion(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 3) {
      setPropSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setSuggestionsLoading(true);
    setShowSuggestions(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchAddresses(value);
        setPropSuggestions(results);
        setShowSuggestions(true);
      } catch {
        setPropSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 300);
  }, []);

  // NYS address typeahead
  const handleNysAddressInput = useCallback((value: string) => {
    setNysAddress(value);
    if (nysDebounceRef.current) clearTimeout(nysDebounceRef.current);
    if (value.trim().length < 3) { setNysSuggestions([]); setShowNysSuggestions(false); return; }
    setShowNysSuggestions(true);
    nysDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchNYSAddresses(value, nysCounty || undefined);
        setNysSuggestions(results);
        setShowNysSuggestions(true);
      } catch { setNysSuggestions([]); }
    }, 400);
  }, [nysCounty]);

  // NYS property search
  const handleNysSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setNysLoading(true);
    setError(null);
    try {
      const result = await searchNYSProperties({
        county: nysCounty || undefined,
        municipality: nysMunicipality || undefined,
        streetAddress: nysAddress || undefined,
        ownerName: nysOwner || undefined,
        minUnits: nysMinUnits ? parseInt(nysMinUnits) : undefined,
      });
      setNysResults(result.properties);
    } catch (err: any) {
      setError(err.message || "NYS search failed");
    }
    setNysLoading(false);
  };

  // NJ property search
  const handleNjSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setNjLoading(true);
    setError(null);
    try {
      const result = await searchNJProperties({
        county: njCounty || undefined,
        municipality: njMunicipality || undefined,
        streetAddress: njAddress || undefined,
        ownerName: njOwner || undefined,
        minUnits: njMinUnits ? parseInt(njMinUnits) : undefined,
      });
      setNjResults(result.properties);
    } catch (err: any) {
      setError(err.message || "NJ search failed");
    }
    setNjLoading(false);
  };

  // Distressed (RPIE) search
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

  // Close suggestions on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
      if (nysSuggestionsRef.current && !nysSuggestionsRef.current.contains(e.target as Node)) {
        setShowNysSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
        ...(building.notes ? { notes: building.notes } : {}),
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
    setShowSuggestions(false);
    try {
      let results;
      if (selectedSuggestion) {
        // User selected a typeahead suggestion — lookup by BBL for precise results
        results = await lookupPropertyByBBL(selectedSuggestion.boroCode, selectedSuggestion.block, selectedSuggestion.lot);
      } else {
        // Fallback: use the typed query + optional borough
        const fd = new FormData(e.currentTarget);
        const address = propQuery.trim();
        const borough = propBorough;
        if (!address) { setError("Please enter an address or BBL"); setLoading(false); return; }

        // Detect BBL pattern
        const bblMatch = address.match(/^(\d)[\s-]?(\d{1,5})[\s-]?(\d{1,4})$/);
        const bbl10 = address.match(/^(\d)(\d{5})(\d{4})$/);
        if (bblMatch || bbl10) {
          const m = (bblMatch || bbl10)!;
          results = await lookupPropertyByBBL(m[1], m[2].replace(/^0+/, ""), m[3].replace(/^0+/, ""));
        } else if (borough) {
          // Use legacy lookup with borough
          fd.set("address", address);
          fd.set("borough", borough);
          results = await lookupProperty(fd);
        } else {
          // No borough selected — try typeahead first to find matching properties, then do lookup on best match
          const suggestions = await searchAddresses(address);
          if (suggestions.length > 0) {
            const best = suggestions[0];
            results = await lookupPropertyByBBL(best.boroCode, best.block, best.lot);
          } else {
            setError("No properties found. Try a more specific address or select a borough.");
            setLoading(false);
            return;
          }
        }
      }
      // Client-side filter by neighborhood zips if selected
      if (propNeighborhoods.length > 0 && results?.buildings) {
        const allZips = new Set(getZipCodesForNeighborhoods(propNeighborhoods));
        results.buildings = results.buildings.filter((b: any) => !b.zipCode || allZips.has(b.zipCode));
      }
      setPropResults(results);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Close neighborhood dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (neighborhoodRef.current && !neighborhoodRef.current.contains(e.target as Node)) {
        setShowNeighborhoodDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleOwnershipSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setOwnerDetailBuilding(null);
    try {
      const fd = new FormData(e.currentTarget);
      // If neighborhoods selected, override zip with neighborhood zip codes
      if (selectedNeighborhoods.length > 0) {
        const zips = getZipCodesForNeighborhoods(selectedNeighborhoods);
        if (zips.length > 0) fd.set("zip", zips[0]); // Primary zip — server will use it
        // We'll filter client-side by all zips after
      }
      const results = await searchOwnership(fd);
      // Client-side filter by neighborhood zips if multiple
      if (selectedNeighborhoods.length > 0 && results?.buildings) {
        const allZips = new Set(getZipCodesForNeighborhoods(selectedNeighborhoods));
        results.buildings = results.buildings.filter((b: any) => !b.zip || allZips.has(b.zip));
      }
      setOwnerResults(results);
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
        <div className="px-4 md:px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔍</span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Market Intelligence</h1>
              <p className="text-sm text-slate-500">
                {market === "nyc" ? "NYC property records, ownership & portfolio data" : market === "nys" ? "NYS assessment rolls & property data" : "NJ tax records & property data"}
              </p>
            </div>
          </div>
          {/* Market Toggle */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => { setMarket("nyc"); setMainTab("property"); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                market === "nyc" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}>
              NYC
            </button>
            <button onClick={() => { setMarket("nys"); setMainTab("property"); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                market === "nys" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}>
              NY State
            </button>
            <button onClick={() => { setMarket("nj"); setMainTab("property"); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                market === "nj" ? "bg-white text-green-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}>
              New Jersey
            </button>
          </div>
        </div>
        <div className="px-4 md:px-8 flex gap-0 overflow-x-auto no-scrollbar">
          {(market === "nyc" ? [
              { key: "property" as const, label: "🏠 Property" },
              { key: "ownership" as const, label: "👤 Ownership" },
              { key: "name" as const, label: "🔎 Name / Portfolio" },
              { key: "map" as const, label: "🗺️ Map" },
              { key: "new-development" as const, label: "🏗️ New Dev" },
              { key: "distressed" as const, label: "🔥 Distressed" },
              { key: "on-market" as const, label: "🏷️ On-Market" },
            ] : market === "nj" ? [
              { key: "property" as const, label: "🏠 Property Search" },
              { key: "on-market" as const, label: "🏷️ On-Market" },
            ] : [
              { key: "property" as const, label: "🏠 Property Search" },
              { key: "on-market" as const, label: "🏷️ On-Market" },
            ]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setMainTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        {/* ======================== PROPERTY TAB ======================== */}
        {/* ========== NYS PROPERTY SEARCH ========== */}
        {market === "nys" && mainTab === "property" && (
          <>
            <form onSubmit={handleNysSearch} className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <div ref={nysSuggestionsRef}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                  <div className="relative">
                    <input value={nysAddress} onChange={(e) => handleNysAddressInput(e.target.value)}
                      placeholder="e.g., 123 Main St"
                      className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    {showNysSuggestions && nysSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-56 overflow-y-auto">
                        {nysSuggestions.map((s, i) => (
                          <button key={i} type="button" onClick={() => {
                            setNysAddress(s.address);
                            setShowNysSuggestions(false);
                            // Auto-search for this specific property
                            setNysSelectedProperty(null);
                          }}
                            className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-slate-100 last:border-0">
                            <p className="text-sm font-medium text-slate-900">{s.address}</p>
                            <p className="text-xs text-slate-400">{s.municipality}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">County</label>
                  <select value={nysCounty} onChange={(e) => { setNysCounty(e.target.value); setNysMunicipality(""); }}
                    className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">All Counties</option>
                    {getCounties().map(c => <option key={c.fips} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Municipality</label>
                  <select value={nysMunicipality} onChange={(e) => setNysMunicipality(e.target.value)}
                    disabled={!nysCounty}
                    className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                    <option value="">All</option>
                    {nysCounty && getMunicipalitiesByCounty(nysCounty).map(m => (
                      <option key={m.swisCode} value={m.name}>{m.name} ({m.type})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Owner Name</label>
                  <input value={nysOwner} onChange={(e) => setNysOwner(e.target.value)}
                    placeholder="e.g., Smith"
                    className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="flex items-end gap-3 mt-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Min Units</label>
                  <input type="number" value={nysMinUnits} onChange={(e) => setNysMinUnits(e.target.value)}
                    placeholder="2"
                    className="w-24 h-12 md:h-auto px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <button type="submit" disabled={nysLoading}
                  className="px-6 py-2.5 h-12 md:h-auto bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
                  {nysLoading ? "Searching..." : "Search NYS"}
                </button>
              </div>
            </form>

            {/* NYS Results */}
            {nysResults.length > 0 && !nysViewProfile && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-900">{nysResults.length} properties found</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {nysResults.map((p, i) => (
                    <div key={i} onClick={() => { setNysSelectedProperty(p); setNysViewProfile(true); }}
                      className="bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-md cursor-pointer transition-all">
                      <div className="flex items-start justify-between mb-2">
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-slate-900 truncate">{p.address || p.printKey}</h4>
                          <p className="text-xs text-slate-400">{p.municipality}, {p.county} County</p>
                        </div>
                        {p.totalUnits > 0 && (
                          <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded flex-shrink-0 ml-2">{p.totalUnits} units</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        {p.yearBuilt > 0 && <span>Built {p.yearBuilt}</span>}
                        {p.stories > 0 && <span>{p.stories} fl</span>}
                        <span className="ml-auto font-semibold text-slate-700">{fmtPrice(p.fullMarketValue)}</span>
                      </div>
                      {p.ownerName && <p className="text-xs text-slate-400 mt-1 truncate">{p.ownerName}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {nysResults.length === 0 && !nysLoading && (
              <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
                <p className="text-4xl mb-4">🏛️</p>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Search NYS Properties</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Search New York State assessment rolls for multifamily properties across Westchester, Nassau, Suffolk, Rockland, Orange, Dutchess, Albany, Erie, Monroe, and Onondaga counties.
                </p>
              </div>
            )}

            {/* NYS Building Profile Modal */}
            {nysSelectedProperty && nysViewProfile && (
              <div className="fixed inset-0 z-[2000] flex">
                <div className="absolute inset-0 bg-black/40" onClick={() => setNysViewProfile(false)} />
                <div className="relative ml-auto w-full md:max-w-3xl bg-white shadow-2xl overflow-y-auto">
                  <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 md:px-5 py-3 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">{nysSelectedProperty.address || nysSelectedProperty.printKey}</h2>
                      <p className="text-xs text-slate-500">{nysSelectedProperty.municipality}, {nysSelectedProperty.county} County</p>
                    </div>
                    <button onClick={() => setNysViewProfile(false)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 text-lg">&times;</button>
                  </div>
                  <div className="p-4 md:p-5">
                    <NYSBuildingProfile
                      swisCode={nysSelectedProperty.swisCode}
                      printKey={nysSelectedProperty.printKey}
                      county={nysSelectedProperty.county}
                      address={nysSelectedProperty.address}
                      municipality={nysSelectedProperty.municipality}
                      onClose={() => setNysViewProfile(false)}
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ========== NJ PROPERTY SEARCH ========== */}
        {market === "nj" && mainTab === "property" && (
          <>
            <form onSubmit={handleNjSearch} className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">County</label>
                  <select value={njCounty} onChange={e => { setNjCounty(e.target.value); setNjMunicipality(""); }}
                    className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                    <option value="">All Counties</option>
                    {getNJCounties().map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Municipality</label>
                  <select value={njMunicipality} onChange={e => setNjMunicipality(e.target.value)}
                    className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                    <option value="">All</option>
                    {njCounty && getNJMunicipalitiesByCounty(njCounty).map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                  <input value={njAddress} onChange={e => setNjAddress(e.target.value)} placeholder="e.g., 123 Main St"
                    className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Min Units</label>
                  <input type="number" value={njMinUnits} onChange={e => setNjMinUnits(e.target.value)} placeholder="e.g., 5" min="0"
                    className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button type="submit" disabled={njLoading} className="bg-green-700 hover:bg-green-800 text-white px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors">
                  {njLoading ? "Searching..." : "Search NJ Properties"}
                </button>
              </div>
            </form>

            {/* NJ Results */}
            {njResults.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-slate-500 mb-3">{njResults.length} properties found</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {njResults.map((p, i) => (
                    <button key={i} onClick={() => { setNjSelectedProperty(p); setNjViewProfile(true); }}
                      className="bg-white rounded-xl border border-slate-200 p-4 text-left hover:border-green-300 hover:shadow transition-all">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{p.address || `Block ${p.block}, Lot ${p.lot}`}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{p.municipality}, {p.county} County</p>
                        </div>
                        <span className="text-xs font-semibold bg-green-50 text-green-700 px-2 py-0.5 rounded">NJ</span>
                      </div>
                      <div className="flex gap-4 mt-2 text-xs text-slate-600">
                        <span>{p.units} units</span>
                        {p.yearBuilt > 0 && <span>Built {p.yearBuilt}</span>}
                        <span className="font-semibold text-green-700">{p.assessedTotal > 0 ? `$${p.assessedTotal.toLocaleString()}` : "—"}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!njLoading && njResults.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
                <p className="text-4xl mb-4">🏘️</p>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Search NJ Properties</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">Search multifamily properties across 8 NJ investment counties using MOD-IV tax records.</p>
              </div>
            )}
          </>
        )}

        {/* NJ Building Profile Modal */}
        {njViewProfile && njSelectedProperty && (
          <NJBuildingProfile
            municipality={njSelectedProperty.municipality}
            block={njSelectedProperty.block}
            lot={njSelectedProperty.lot}
            county={njSelectedProperty.county}
            address={njSelectedProperty.address}
            onClose={() => setNjViewProfile(false)}
          />
        )}

        {/* ========== DISTRESSED TAB (RPIE) — NYC only ========== */}
        {market === "nyc" && mainTab === "distressed" && (
          <>
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
          </>
        )}

        {/* ========== NYC PROPERTY SEARCH ========== */}
        {market === "nyc" && mainTab === "property" && (
          <>
            <form onSubmit={handlePropertySearch} className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <div className="sm:col-span-2" ref={suggestionsRef}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Address or BBL</label>
                  <div className="relative">
                    <input
                      value={propQuery}
                      onChange={(e) => handleAddressInput(e.target.value)}
                      onFocus={() => propSuggestions.length > 0 && setShowSuggestions(true)}
                      placeholder="e.g., 350 Park Ave, 1-634-1, or 1006340001"
                      className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {suggestionsLoading && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                      </div>
                    )}
                    {showSuggestions && propSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto">
                        {propSuggestions.map((s, i) => (
                          <button
                            key={`${s.boroCode}-${s.block}-${s.lot}-${i}`}
                            type="button"
                            onClick={() => {
                              setSelectedSuggestion(s);
                              setPropQuery(`${s.address}, ${s.borough}`);
                              setPropBorough(s.borough);
                              setShowSuggestions(false);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-slate-100 last:border-b-0 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium text-slate-900">{s.address}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{s.borough}{s.zip ? ` ${s.zip}` : ""}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                {s.unitsRes > 0 && <span className="text-xs text-blue-600 font-medium">{s.unitsRes} units</span>}
                                {s.yearBuilt > 0 && <p className="text-[10px] text-slate-400">Built {s.yearBuilt}</p>}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {showSuggestions && !suggestionsLoading && propSuggestions.length === 0 && propQuery.trim().length >= 3 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 px-4 py-3">
                        <p className="text-sm text-slate-400">No matches found</p>
                      </div>
                    )}
                  </div>
                  {selectedSuggestion && (
                    <p className="text-xs text-green-600 mt-1">
                      {selectedSuggestion.borough} — Block {selectedSuggestion.block}, Lot {selectedSuggestion.lot}
                      {selectedSuggestion.ownerName && ` — ${selectedSuggestion.ownerName}`}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Borough <span className="text-slate-400 font-normal">(optional)</span></label>
                  <select value={propBorough} onChange={(e) => { setPropBorough(e.target.value); setPropNeighborhoods([]); }}
                    className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm bg-white">
                    <option value="">Any</option>
                    <option value="Manhattan">Manhattan</option>
                    <option value="Brooklyn">Brooklyn</option>
                    <option value="Queens">Queens</option>
                    <option value="Bronx">Bronx</option>
                    <option value="Staten Island">Staten Island</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button type="submit" disabled={loading || !propQuery.trim()} className="w-full md:w-auto h-12 md:h-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                    {loading ? "Searching..." : "Search"}
                  </button>
                </div>
              </div>
              {propBorough && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="max-w-xs">
                    <NeighborhoodDropdown borough={propBorough} selected={propNeighborhoods} onChange={setPropNeighborhoods} />
                  </div>
                </div>
              )}
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
        {market === "nyc" && mainTab === "ownership" && (
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
                      <select name="borough" value={ownerBorough} onChange={(e) => { setOwnerBorough(e.target.value); setSelectedNeighborhoods([]); setNeighborhoodSearch(""); }} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white">
                        <option value="">Any</option><option value="Manhattan">Manhattan</option><option value="Brooklyn">Brooklyn</option>
                        <option value="Queens">Queens</option><option value="Bronx">Bronx</option><option value="Staten Island">Staten Island</option>
                      </select>
                    </div>
                    <div ref={neighborhoodRef} className="relative"><label className="block text-sm font-medium text-slate-700 mb-1">Neighborhood</label>
                      <div
                        onClick={() => ownerBorough && setShowNeighborhoodDropdown(!showNeighborhoodDropdown)}
                        className={`w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white cursor-pointer flex items-center gap-1 min-h-[42px] ${!ownerBorough ? "text-slate-400" : "text-slate-700"}`}
                      >
                        {!ownerBorough ? (
                          <span>Select borough first</span>
                        ) : selectedNeighborhoods.length === 0 ? (
                          <span className="text-slate-400">Any neighborhood</span>
                        ) : selectedNeighborhoods.length <= 2 ? (
                          <span className="truncate">{selectedNeighborhoods.join(", ")}</span>
                        ) : (
                          <span>{selectedNeighborhoods.length} selected</span>
                        )}
                        <svg className="w-4 h-4 ml-auto text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                      </div>
                      {showNeighborhoodDropdown && ownerBorough && (() => {
                        const neighborhoods = getNeighborhoodsByBorough(ownerBorough);
                        const filtered = neighborhoodSearch
                          ? neighborhoods.filter(n => n.name.toLowerCase().includes(neighborhoodSearch.toLowerCase()))
                          : neighborhoods;
                        return (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-64 overflow-hidden flex flex-col">
                            <div className="p-2 border-b border-slate-100">
                              <input
                                value={neighborhoodSearch}
                                onChange={(e) => setNeighborhoodSearch(e.target.value)}
                                placeholder="Search neighborhoods..."
                                className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                autoFocus
                              />
                            </div>
                            {selectedNeighborhoods.length > 0 && (
                              <button onClick={() => setSelectedNeighborhoods([])} className="px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 text-left border-b border-slate-100">
                                Clear all ({selectedNeighborhoods.length})
                              </button>
                            )}
                            <div className="overflow-y-auto max-h-48">
                              {filtered.map(n => (
                                <label key={n.name} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
                                  <input
                                    type="checkbox"
                                    checked={selectedNeighborhoods.includes(n.name)}
                                    onChange={(e) => {
                                      if (e.target.checked) setSelectedNeighborhoods([...selectedNeighborhoods, n.name]);
                                      else setSelectedNeighborhoods(selectedNeighborhoods.filter(s => s !== n.name));
                                    }}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span>{n.name}</span>
                                </label>
                              ))}
                              {filtered.length === 0 && (
                                <p className="px-3 py-4 text-sm text-slate-400 text-center">No neighborhoods match</p>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">ZIP code</label>
                      <input name="zip" placeholder="e.g., 11211" disabled={selectedNeighborhoods.length > 0} className={`w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${selectedNeighborhoods.length > 0 ? "bg-slate-50 text-slate-400" : ""}`} />
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
                                <p className="text-sm text-slate-500 mt-0.5">
                                  {b.zip ? (() => { const nh = getNeighborhoodNameByZip(b.zip); return nh ? `${nh}, ${b.boro}` : b.boro; })() : b.boro}
                                  {" "}• ZIP: {b.zip} • Block {b.block}, Lot {b.lot}
                                </p>
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
        {market === "nyc" && mainTab === "name" && (
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
        {market === "nyc" && mainTab === "new-development" && (
          <>
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
                    borough={{ MANHATTAN: "Manhattan", BRONX: "Bronx", BROOKLYN: "Brooklyn", QUEENS: "Queens", "STATEN ISLAND": "Staten Island" }[ndFilters.borough] || ""}
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

        {market === "nyc" && (
          <div style={mainTab !== "map" ? { position: "absolute", left: "-9999px", width: "100%" } : {}}>
            <MapSearch onNameClick={(name) => { setMainTab("name"); searchOwnerName(name); }} />
          </div>
        )}

        {/* ============================================================ */}
        {/* ON-MARKET LISTINGS (Brave Web Search) */}
        {/* ============================================================ */}
        {mainTab === "on-market" && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-bold text-slate-900">On-Market Listings</h2>
                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase">Brave Search</span>
              </div>
              <p className="text-sm text-slate-500 mb-4">
                Search active real estate listings across the web. Powered by Brave Web Search API.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Area / Neighborhood</label>
                  <input
                    type="text"
                    value={omArea}
                    onChange={e => setOmArea(e.target.value)}
                    placeholder={market === "nj" ? "e.g. Jersey City" : market === "nys" ? "e.g. Westchester" : "e.g. East Village, Brooklyn"}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Min Price</label>
                  <input
                    type="text"
                    value={omMinPrice}
                    onChange={e => setOmMinPrice(e.target.value)}
                    placeholder="e.g. 1000000"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Max Price</label>
                  <input
                    type="text"
                    value={omMaxPrice}
                    onChange={e => setOmMaxPrice(e.target.value)}
                    placeholder="e.g. 10000000"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Min Units</label>
                  <input
                    type="text"
                    value={omMinUnits}
                    onChange={e => setOmMinUnits(e.target.value)}
                    placeholder="e.g. 5"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <button
                onClick={async () => {
                  if (!omArea.trim()) return;
                  setOmLoading(true);
                  setOmResults([]);
                  setOmSelectedListing(null);
                  try {
                    const available = await isBraveSearchAvailable();
                    setOmBraveAvailable(available);
                    if (!available) { setOmLoading(false); return; }
                    const result = await searchAreaListings(omArea.trim(), market, {
                      minPrice: omMinPrice ? parseInt(omMinPrice) : undefined,
                      maxPrice: omMaxPrice ? parseInt(omMaxPrice) : undefined,
                      minUnits: omMinUnits ? parseInt(omMinUnits) : undefined,
                    });
                    setOmResults(result.listings);
                  } catch (err) {
                    console.error("On-market search error:", err);
                  } finally {
                    setOmLoading(false);
                  }
                }}
                disabled={omLoading || !omArea.trim()}
                className="w-full md:w-auto px-6 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
              >
                {omLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Searching...
                  </span>
                ) : "Search Listings"}
              </button>
            </div>

            {/* Brave API not available warning */}
            {omBraveAvailable === false && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center mb-6">
                <p className="text-4xl mb-3">🔑</p>
                <h3 className="text-lg font-semibold text-amber-900 mb-2">Brave Search API Key Required</h3>
                <p className="text-sm text-amber-700">
                  Set <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs font-mono">BRAVE_SEARCH_API_KEY</code> in your environment variables to enable on-market listing search.
                </p>
              </div>
            )}

            {/* Results */}
            {omResults.length > 0 && (
              <div>
                <p className="text-sm text-slate-500 mb-3">{omResults.length} listings found</p>
                <div className="space-y-3">
                  {omResults.map((listing, i) => (
                    <div
                      key={i}
                      onClick={() => setOmSelectedListing(omSelectedListing === listing ? null : listing)}
                      className={"bg-white rounded-xl border transition-colors cursor-pointer " + (omSelectedListing === listing ? "border-green-400 ring-2 ring-green-100" : "border-slate-200 hover:border-slate-300")}
                    >
                      <div className="p-4 flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">LISTED</span>
                            <h3 className="text-sm font-bold text-slate-900 truncate">{listing.address}</h3>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            {listing.units && <span>{listing.units} units · </span>}
                            {listing.sqft && <span>{listing.sqft.toLocaleString()} sf · </span>}
                            {listing.brokerage && <span>{listing.brokerage} · </span>}
                            {listing.broker && <span>Agent: {listing.broker} · </span>}
                            {listing.daysOnMarket !== undefined && <span>{listing.daysOnMarket}d on market</span>}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">{listing.sourceDomain}</p>
                        </div>
                        <div className="text-right ml-4 shrink-0">
                          <p className="text-lg font-bold text-green-700">{listing.priceStr}</p>
                          {listing.pricePerUnit && <p className="text-xs text-slate-400">${listing.pricePerUnit.toLocaleString()}/unit</p>}
                          {listing.pricePerSqft && <p className="text-xs text-slate-400">${listing.pricePerSqft}/sf</p>}
                        </div>
                      </div>
                      {/* Expanded detail */}
                      {omSelectedListing === listing && (
                        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 rounded-b-xl">
                          <p className="text-xs text-slate-600 mb-3">{listing.description}</p>
                          <div className="flex flex-wrap gap-2">
                            <a href={listing.sourceUrl} target="_blank" rel="noopener noreferrer"
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                              View Original Listing →
                            </a>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                try { sessionStorage.setItem("vettdre_listing_price", JSON.stringify({ price: listing.price, address: listing.address, source: listing.sourceDomain })); } catch {}
                                router.push("/deals/new");
                              }}
                              className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                            >
                              Model This Deal
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!omLoading && omResults.length === 0 && omBraveAvailable !== false && (
              <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
                <p className="text-4xl mb-4">🏷️</p>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Search on-market listings</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Enter a neighborhood or area to find active real estate listings from across the web.
                  Results include pricing, unit counts, brokers, and days on market.
                </p>
              </div>
            )}
          </>
        )}

        {/* Building profile from distressed tab click */}
        {selectedProperty && mainTab === "distressed" && (
          <BuildingProfile
            boroCode={selectedProperty.boroCode}
            block={selectedProperty.block}
            lot={selectedProperty.lot}
            address={selectedProperty.address}
            borough={selectedProperty.borough}
            onClose={() => setSelectedProperty(null)}
            onNameClick={(name) => { setMainTab("name"); searchOwnerName(name); }}
          />
        )}

        <p className="text-xs text-slate-400 mt-6 text-center">
          {market === "nyc"
            ? "Data: NYC Open Data • NYS Dept. of State • ACRIS • HPD • PLUTO • DOB • LL84 • RPIE • Brave Web Search"
            : market === "nj"
            ? "Data: NJ MOD-IV Tax Records via ArcGIS • Brave Web Search"
            : "Data: NYS Open Data • Assessment Rolls • Municipal Tax Rates • Brave Web Search"}
        </p>
      </div>
    </div>
  );
}
