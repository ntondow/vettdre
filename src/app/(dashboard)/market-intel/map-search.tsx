"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchPropertiesInBounds, geocodeAddress } from "./map-actions";
import { buildOwnershipGraph } from "./graph-engine";
import BuildingProfile from "./building-profile";

const fmtPrice = (n: number) => n > 0 ? "$" + n.toLocaleString() : "—";

interface MapProperty {
  address: string; ownerName: string; unitsRes: number; unitsTot: number;
  yearBuilt: number; numFloors: number; assessTotal: number; bldgClass: string;
  zoneDist: string; boroCode: string; block: string; lot: string;
  lat: number; lng: number; bldgArea: number; lotArea: number; borough: string;
}

interface Filters {
  minUnits?: number; maxUnits?: number; minValue?: number; maxValue?: number;
  minYearBuilt?: number; maxYearBuilt?: number; minFloors?: number;
  bldgClass?: string; zoneDist?: string; excludePublic?: boolean;
}

export default function MapSearch({ onNameClick }: { onNameClick?: (name: string) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const [properties, setProperties] = useState<MapProperty[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<MapProperty | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({ excludePublic: true });
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [sortBy, setSortBy] = useState<"units" | "value" | "year" | "floors">("units");
  const [addressSearch, setAddressSearch] = useState("");
  const [pinnedSearch, setPinnedSearch] = useState("");
  const [searchMsg, setSearchMsg] = useState<{ type: "error" | "info"; text: string } | null>(null);
  const [portfolioMarkers, setPortfolioMarkers] = useState<MapProperty[]>([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const fetchTimeoutRef = useRef<any>(null);
  const searchHighlightRef = useRef<any>(null);

  // Load Leaflet dynamically (client-side only)
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Add Leaflet CSS
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    // Add pulse animation CSS
    if (!document.getElementById("map-pulse-css")) {
      const style = document.createElement("style");
      style.id = "map-pulse-css";
      style.textContent = `
        @keyframes marker-pulse {
          0% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.5); opacity: 0.4; }
          100% { transform: scale(1); opacity: 0.9; }
        }
        .search-highlight-pulse {
          animation: marker-pulse 1.5s ease-in-out infinite;
          transform-origin: center;
        }
      `;
      document.head.appendChild(style);
    }

    // Add Leaflet JS
    if (!(window as any).L) {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => setLeafletLoaded(true);
      document.head.appendChild(script);
    } else {
      setLeafletLoaded(true);
    }
  }, []);

  // Initialize map once Leaflet is loaded
  useEffect(() => {
    if (!leafletLoaded || !mapRef.current || leafletMapRef.current) return;

    const L = (window as any).L;
    let initCenter = [40.7128, -73.9560];
    let initZoom = 15;
    try {
      const saved = sessionStorage.getItem("vettdre-map");
      if (saved) {
        const p = JSON.parse(saved);
        initCenter = [p.lat, p.lng];
        initZoom = p.zoom;
      }
    } catch {}
    const map = L.map(mapRef.current, {
      center: initCenter,
      zoom: initZoom,
      zoomControl: false,
    });

    L.control.zoom({ position: "topright" }).addTo(map);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);
    leafletMapRef.current = map;

    // Fetch on map move (debounced)
    map.on("moveend", () => {
      try {
        const c = map.getCenter();
        sessionStorage.setItem("vettdre-map", JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() }));
      } catch {}

      // Clear search highlight on pan/zoom
      if (searchHighlightRef.current) {
        searchHighlightRef.current.remove();
        searchHighlightRef.current = null;
      }

      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => {
        loadProperties();
      }, 800);
    });

    // Initial load
    setTimeout(() => loadProperties(), 100);

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [leafletLoaded]);

  const addSearchHighlight = (lat: number, lng: number, address: string) => {
    const L = (window as any).L;
    if (!L || !leafletMapRef.current) return;

    // Remove previous highlight
    if (searchHighlightRef.current) {
      searchHighlightRef.current.remove();
    }

    // Pulsing outer ring (uses CSS animation via a divIcon overlay)
    const pulseIcon = L.divIcon({
      className: "",
      html: `<div class="search-highlight-pulse" style="width:36px;height:36px;border-radius:50%;background:rgba(239,68,68,0.3);border:2px solid #ef4444;"></div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
    const pulseMarker = L.marker([lat, lng], { icon: pulseIcon, interactive: false });

    // Solid center marker
    const centerMarker = L.circleMarker([lat, lng], {
      radius: 12,
      fillColor: "#ef4444",
      color: "#fff",
      weight: 3,
      opacity: 1,
      fillOpacity: 0.9,
    });

    centerMarker.bindPopup(
      `<div style="font-family:system-ui;font-size:12px;font-weight:600;">${address}</div>`,
      { closeButton: false, offset: [0, -10] }
    ).openPopup();

    const group = L.layerGroup([pulseMarker, centerMarker]).addTo(leafletMapRef.current);
    searchHighlightRef.current = group;
  };

  const handleAddressSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!addressSearch.trim() || !leafletMapRef.current) return;
    const query = addressSearch.trim();
    setPinnedSearch(query);
    setSearchMsg(null);

    // Try server-side geocoding
    let geocoded = false;
    let geoLat = 0;
    let geoLng = 0;
    const geoResult = await geocodeAddress(query);
    if (geoResult) {
      geoLat = geoResult.lat;
      geoLng = geoResult.lng;
      leafletMapRef.current.setView([geoLat, geoLng], 17);
      geocoded = true;
    }

    if (geocoded) {
      // Try to find matching PLUTO property for a better label, otherwise use search query
      const lq = query.toLowerCase();
      const plutoMatch = properties.find(p => p.address.toLowerCase().includes(lq));
      addSearchHighlight(geoLat, geoLng, plutoMatch?.address || query);
      if (plutoMatch) setSelectedProperty(plutoMatch);
      return;
    }

    // Fallback: match against loaded PLUTO properties by address
    const lowerQuery = query.toLowerCase();
    const match = properties.find(p => p.address.toLowerCase().includes(lowerQuery));
    if (match && match.lat && match.lng) {
      leafletMapRef.current.setView([match.lat, match.lng], 17);
      addSearchHighlight(match.lat, match.lng, match.address);
      setSelectedProperty(match);
      setSearchMsg({ type: "info", text: "Geocoding unavailable — matched from loaded properties." });
    } else {
      setSearchMsg({ type: "error", text: "Address not found. Try panning the map to the area first." });
    }
    setTimeout(() => setSearchMsg(null), 5000);
  };

  const handleShowPortfolio = async (p: MapProperty) => {
    if (!p.block || !p.lot || !p.boroCode) return;
    setLoadingPortfolio(true);
    try {
      const result = await buildOwnershipGraph(p.block, p.lot, p.boroCode, 1);
      const L = (window as any).L;
      if (result.properties && result.properties.length > 0 && markersRef.current && L) {
        const portfolioProps = result.properties
          .filter((pp: any) => pp.lat && pp.lng && pp.lat !== 0)
          .map((pp: any) => ({
            address: pp.address || "",
            ownerName: pp.ownerName || "",
            unitsRes: pp.unitsRes || 0,
            unitsTot: 0,
            yearBuilt: pp.yearBuilt || 0,
            numFloors: pp.numFloors || 0,
            assessTotal: pp.assessTotal || 0,
            bldgClass: "",
            zoneDist: pp.zoneDist || "",
            boroCode: pp.boroCode || "",
            block: pp.block || "",
            lot: pp.lot || "",
            lat: parseFloat(pp.lat || "0"),
            lng: parseFloat(pp.lng || "0"),
            bldgArea: 0,
            lotArea: 0,
            borough: pp.borough || "",
          }));
        setPortfolioMarkers(portfolioProps);

        // Add orange markers for portfolio properties
        portfolioProps.forEach((pp: MapProperty) => {
          if (pp.lat === 0 || pp.lng === 0) return;
          const marker = L.circleMarker([pp.lat, pp.lng], {
            radius: 9,
            fillColor: "#f59e0b",
            color: "#fff",
            weight: 3,
            opacity: 1,
            fillOpacity: 0.9,
          });
          marker.bindTooltip(
            '<div style="font-family:system-ui;font-size:12px;"><strong>Portfolio: ' + pp.address + '</strong><br/>' + pp.borough + '</div>',
            { direction: "top", offset: [0, -9] }
          );
          marker.on("click", () => setSelectedProperty(pp));
          markersRef.current.addLayer(marker);
        });

        // Fit map to show all portfolio properties + current
        const allLats = [p.lat, ...portfolioProps.map((pp: MapProperty) => pp.lat)].filter(v => v !== 0);
        const allLngs = [p.lng, ...portfolioProps.map((pp: MapProperty) => pp.lng)].filter(v => v !== 0);
        if (allLats.length > 1) {
          leafletMapRef.current.fitBounds([
            [Math.min(...allLats) - 0.002, Math.min(...allLngs) - 0.002],
            [Math.max(...allLats) + 0.002, Math.max(...allLngs) + 0.002],
          ]);
        }
      }
    } catch (err) { console.error("Portfolio error:", err); }
    setLoadingPortfolio(false);
  };

  const handleSaveToList = async (p: MapProperty) => {
    try {
      const res = await fetch("/api/lists", { method: "GET" });
      let listId = "";
      if (res.ok) {
        const lists = await res.json();
        if (lists.length > 0) {
          listId = lists[0].id;
        }
      }
      if (!listId) {
        const createRes = await fetch("/api/lists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Map Prospects", description: "Saved from map search" }),
        });
        if (createRes.ok) {
          const newList = await createRes.json();
          listId = newList.id;
        }
      }
      if (listId) {
        await fetch("/api/lists/" + listId + "/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: p.address,
            borough: p.borough,
            block: p.block,
            lot: p.lot,
            boroCode: p.boroCode,
            units: p.unitsRes,
            yearBuilt: p.yearBuilt,
            assessedValue: p.assessTotal,
            ownerName: p.ownerName,
          }),
        });
        setSaveSuccess(p.address);
        setTimeout(() => setSaveSuccess(null), 2000);
      }
    } catch (err) { console.error("Save error:", err); }
  };

  const loadProperties = useCallback(async () => {
    const map = leafletMapRef.current;
    if (!map) return;

    const zoom = map.getZoom();
    if (zoom < 14) {
      setProperties([]);
      setTotal(0);
      return;
    }

    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    setLoading(true);
    try {
      const result = await fetchPropertiesInBounds(sw.lat, sw.lng, ne.lat, ne.lng, filters);
      setProperties(result.properties);
      setTotal(result.total);
      updateMarkers(result.properties);
    } catch (err) {
      console.error("Map load error:", err);
    }
    setLoading(false);
  }, [filters]);

  // Reload when filters change
  useEffect(() => {
    loadProperties();
  }, [filters]);

  const updateMarkers = (props: MapProperty[]) => {
    const L = (window as any).L;
    if (!markersRef.current || !L) return;

    markersRef.current.clearLayers();

    props.forEach((p) => {
      const radius = p.unitsRes >= 50 ? 10 : p.unitsRes >= 20 ? 8 : p.unitsRes >= 10 ? 6 : 4;
      const color = p.unitsRes >= 50 ? "#7c3aed" : p.unitsRes >= 20 ? "#2563eb" : p.unitsRes >= 10 ? "#0891b2" : "#64748b";

      const marker = L.circleMarker([p.lat, p.lng], {
        radius,
        fillColor: color,
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85,
      });

      marker.on("click", () => {
        setSelectedProperty(p);
      });

      marker.bindTooltip(
        `<div style="font-family:system-ui;font-size:12px;line-height:1.4;">
          <strong>${p.address}</strong><br/>
          ${p.unitsRes} units · ${p.numFloors} floors<br/>
          ${fmtPrice(p.assessTotal)}
        </div>`,
        { direction: "top", offset: [0, -radius] }
      );

      markersRef.current.addLayer(marker);
    });
  };

  const isPinnedMatch = (p: MapProperty) =>
    pinnedSearch && p.address.toLowerCase().includes(pinnedSearch.toLowerCase());

  const sortedProperties = [...properties].sort((a, b) => {
    const aPinned = isPinnedMatch(a);
    const bPinned = isPinnedMatch(b);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    switch (sortBy) {
      case "value": return b.assessTotal - a.assessTotal;
      case "year": return b.yearBuilt - a.yearBuilt;
      case "floors": return b.numFloors - a.numFloors;
      default: return b.unitsRes - a.unitsRes;
    }
  });

  const handleFilterChange = (key: keyof Filters, value: string) => {
    const num = value === "" ? undefined : parseInt(value);
    setFilters(prev => ({ ...prev, [key]: num }));
  };

  const handleStringFilterChange = (key: keyof Filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value || undefined }));
  };

  const clearFilters = () => {
    setFilters({});
  };

  const activeFilterCount = Object.values(filters).filter(v => v !== undefined).length;

  // If a building profile is selected to view in detail
  const [viewProfile, setViewProfile] = useState(false);

  return (
    <div className="flex h-[calc(100vh-200px)] min-h-[600px] rounded-xl overflow-hidden border border-slate-200 bg-white">
      {/* Left Panel: List + Filters */}
      <div className="w-[340px] flex-shrink-0 flex flex-col border-r border-slate-200">
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="text-xs font-bold text-slate-900">
              {loading ? "Searching..." : `${properties.length} of ${total.toLocaleString()} properties`}
            </h3>
            <button onClick={() => setShowFilters(!showFilters)}
              className={"text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors " + (
                showFilters || activeFilterCount > 0
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-100"
              )}>
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
          </div>

          {/* Quick toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" className="rounded border-slate-300 text-blue-600 w-3 h-3"
              checked={filters.excludePublic || false}
              onChange={e => setFilters(prev => ({ ...prev, excludePublic: e.target.checked }))} />
            <span className="text-[10px] text-slate-500">Hide public</span>
          </label>

          {/* Sort */}
          <div className="flex items-center gap-0.5 text-[10px]">
            <span className="text-slate-400 mr-1">Sort:</span>
            {(["units", "value", "year", "floors"] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)}
                className={"px-1.5 py-0.5 rounded " + (sortBy === s ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-200")}>
                {s === "units" ? "Units" : s === "value" ? "Value" : s === "year" ? "Year" : "Floors"}
              </button>
            ))}
          </div>

          {/* Zoom warning */}
          {leafletMapRef.current && leafletMapRef.current.getZoom() < 14 && (
            <p className="text-xs text-amber-600 mt-2">Zoom in to see properties</p>
          )}
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="px-3 py-2.5 border-b border-slate-200 bg-blue-50/50 space-y-2">
            {/* Public housing toggle */}
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[11px] font-semibold text-slate-700">Hide public housing (NYCHA, gov)</span>
              <div className="relative">
                <input type="checkbox" className="sr-only peer"
                  checked={filters.excludePublic || false}
                  onChange={e => setFilters(prev => ({ ...prev, excludePublic: e.target.checked }))} />
                <div className="w-8 h-4.5 bg-slate-300 rounded-full peer peer-checked:bg-blue-600 transition-colors"></div>
                <div className="absolute left-0.5 top-0.5 w-3.5 h-3.5 bg-white rounded-full peer-checked:translate-x-3.5 transition-transform shadow-sm"></div>
              </div>
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="text-[10px] text-slate-500 font-medium uppercase">Min Units</label>
                <input type="number" placeholder="Any" value={filters.minUnits || ""}
                  onChange={e => handleFilterChange("minUnits", e.target.value)}
                  className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-200 rounded" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-medium uppercase">Max Units</label>
                <input type="number" placeholder="Any" value={filters.maxUnits || ""}
                  onChange={e => handleFilterChange("maxUnits", e.target.value)}
                  className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-200 rounded" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-medium uppercase">Min Value ($)</label>
                <input type="number" placeholder="Any" value={filters.minValue || ""}
                  onChange={e => handleFilterChange("minValue", e.target.value)}
                  className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-200 rounded" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-medium uppercase">Max Value ($)</label>
                <input type="number" placeholder="Any" value={filters.maxValue || ""}
                  onChange={e => handleFilterChange("maxValue", e.target.value)}
                  className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-200 rounded" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-medium uppercase">Built After</label>
                <input type="number" placeholder="e.g. 1980" value={filters.minYearBuilt || ""}
                  onChange={e => handleFilterChange("minYearBuilt", e.target.value)}
                  className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-200 rounded" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-medium uppercase">Built Before</label>
                <input type="number" placeholder="e.g. 2020" value={filters.maxYearBuilt || ""}
                  onChange={e => handleFilterChange("maxYearBuilt", e.target.value)}
                  className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-200 rounded" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-medium uppercase">Min Floors</label>
                <input type="number" placeholder="Any" value={filters.minFloors || ""}
                  onChange={e => handleFilterChange("minFloors", e.target.value)}
                  className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-200 rounded" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-medium uppercase">Zoning</label>
                <select value={filters.zoneDist || ""}
                  onChange={e => handleStringFilterChange("zoneDist", e.target.value)}
                  className="w-full mt-0.5 px-2 py-1 text-xs border border-slate-200 rounded bg-white">
                  <option value="">Any</option>
                  <option value="R">Residential (R)</option>
                  <option value="C">Commercial (C)</option>
                  <option value="M">Manufacturing (M)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={loadProperties}
                className="flex-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold rounded transition-colors">
                Apply
              </button>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters}
                  className="px-2 py-1.5 bg-white border border-slate-200 text-slate-500 text-[11px] font-medium rounded hover:bg-slate-50">
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        {/* Property List or Selected Detail */}
        <div className="flex-1 overflow-y-auto">
          {selectedProperty && viewProfile ? (
            <div className="p-3">
              <button onClick={() => { setViewProfile(false); setSelectedProperty(null); }}
                className="text-xs text-blue-600 hover:underline mb-2 flex items-center gap-1">
                ← Back to list
              </button>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                <p className="text-xs text-blue-700 font-medium">Profile panel open →</p>
                <p className="text-[10px] text-blue-500 mt-0.5">Click backdrop or × to close</p>
              </div>
            </div>
          ) : selectedProperty ? (
            <div className="p-3">
              <button onClick={() => setSelectedProperty(null)}
                className="text-xs text-blue-600 hover:underline mb-2 flex items-center gap-1">
                ← Back to list
              </button>

              <div className="space-y-3">
                {/* Address Header */}
                <div>
                  <h3 className="text-sm font-bold text-slate-900 leading-tight">{selectedProperty.address}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{selectedProperty.borough} · Blk {selectedProperty.block}, Lot {selectedProperty.lot}</p>
                </div>

                {/* Key Stats - 3 columns, compact */}
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="bg-slate-50 rounded px-2 py-1.5 text-center">
                    <p className="text-[10px] text-slate-400 uppercase">Units</p>
                    <p className="text-base font-bold text-slate-900">{selectedProperty.unitsRes}</p>
                  </div>
                  <div className="bg-slate-50 rounded px-2 py-1.5 text-center">
                    <p className="text-[10px] text-slate-400 uppercase">Floors</p>
                    <p className="text-base font-bold text-slate-900">{selectedProperty.numFloors}</p>
                  </div>
                  <div className="bg-slate-50 rounded px-2 py-1.5 text-center">
                    <p className="text-[10px] text-slate-400 uppercase">Built</p>
                    <p className="text-base font-bold text-slate-900">{selectedProperty.yearBuilt || "—"}</p>
                  </div>
                </div>

                {/* Value + Area row */}
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="bg-blue-50 rounded px-2 py-1.5">
                    <p className="text-[10px] text-blue-500 uppercase">Assessed Value</p>
                    <p className="text-sm font-bold text-blue-900">{fmtPrice(selectedProperty.assessTotal)}</p>
                  </div>
                  <div className="bg-slate-50 rounded px-2 py-1.5">
                    <p className="text-[10px] text-slate-400 uppercase">Bldg Area</p>
                    <p className="text-sm font-bold text-slate-900">{selectedProperty.bldgArea > 0 ? selectedProperty.bldgArea.toLocaleString() + " sf" : "—"}</p>
                  </div>
                </div>

                {/* Details */}
                <div className="text-xs space-y-1 text-slate-600">
                  {selectedProperty.ownerName && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Owner</span>
                      {onNameClick ? (
                        <button onClick={() => onNameClick(selectedProperty.ownerName)} className="text-blue-600 hover:underline font-medium text-right max-w-[220px] truncate">
                          {selectedProperty.ownerName} →
                        </button>
                      ) : (
                        <span className="font-medium text-right max-w-[220px] truncate">{selectedProperty.ownerName}</span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Zoning</span>
                    <span className="font-medium">{selectedProperty.zoneDist || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Class</span>
                    <span className="font-medium">{selectedProperty.bldgClass || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Lot Area</span>
                    <span className="font-medium">{selectedProperty.lotArea > 0 ? selectedProperty.lotArea.toLocaleString() + " sf" : "—"}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-1.5">
                  <div className="flex gap-1.5">
                    <button onClick={() => setViewProfile(true)}
                      className="flex-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold rounded-lg transition-colors">
                      Full Profile
                    </button>
                    <button onClick={() => handleSaveToList(selectedProperty)}
                      className="flex-1 px-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded-lg transition-colors">
                      {saveSuccess === selectedProperty.address ? "✓ Saved!" : "Save to List"}
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    {onNameClick && selectedProperty.ownerName && (
                      <button onClick={() => onNameClick(selectedProperty.ownerName)}
                        className="flex-1 px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold rounded-lg transition-colors">
                        Name Search
                      </button>
                    )}
                    <button onClick={() => handleShowPortfolio(selectedProperty)}
                      disabled={loadingPortfolio}
                      className="flex-1 px-2 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-50">
                      {loadingPortfolio ? "Finding..." : "Show Portfolio on Map"}
                    </button>
                  </div>
                </div>

                {/* Portfolio results summary */}
                {portfolioMarkers.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 mt-1">
                    <p className="text-[11px] font-semibold text-amber-800">{portfolioMarkers.length} portfolio properties shown in orange</p>
                    <button onClick={() => { setPortfolioMarkers([]); loadProperties(); }}
                      className="text-[10px] text-amber-600 hover:underline mt-0.5">Clear portfolio markers</button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              {sortedProperties.map((p, i) => {
                const pinned = isPinnedMatch(p);
                return (
                <div key={i} onClick={() => {
                  setSelectedProperty(p);
                  if (leafletMapRef.current) {
                    leafletMapRef.current.panTo([p.lat, p.lng]);
                  }
                }}
                  className={"px-4 py-3 border-b cursor-pointer transition-colors " + (
                    pinned ? "bg-amber-50 border-l-2 border-l-amber-500 border-b-amber-200 hover:bg-amber-100" : "border-slate-100 hover:bg-blue-50"
                  )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h4 className="text-sm font-semibold text-slate-900 truncate">{p.address}</h4>
                      {pinned && <span className="flex-shrink-0 text-[9px] font-bold bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded">Searched</span>}
                    </div>
                    <span className={"text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 ml-1.5 " + (
                      p.unitsRes >= 50 ? "bg-purple-100 text-purple-700" :
                      p.unitsRes >= 20 ? "bg-blue-100 text-blue-700" :
                      p.unitsRes >= 10 ? "bg-cyan-100 text-cyan-700" :
                      "bg-slate-100 text-slate-600"
                    )}>{p.unitsRes} units</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span>{p.borough}</span>
                    <span>{p.numFloors} fl</span>
                    <span>{p.yearBuilt || "—"}</span>
                    <span className="ml-auto font-medium text-slate-700">{fmtPrice(p.assessTotal)}</span>
                  </div>
                  {p.ownerName && (
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{p.ownerName}</p>
                  )}
                </div>
                );
              })}
              {properties.length === 0 && !loading && (
                <div className="p-8 text-center">
                  <p className="text-sm text-slate-400">Pan and zoom the map to search properties</p>
                  <p className="text-xs text-slate-300 mt-1">Zoom to street level to see results</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {/* Address Search Bar */}
        <div className="absolute top-3 left-3 z-[1000]">
          <form onSubmit={handleAddressSearch} className="flex">
            <input type="text" value={addressSearch} onChange={e => setAddressSearch(e.target.value)}
              placeholder="Search address..."
              className="w-56 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-l-lg shadow-lg focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400" />
            <button type="submit" className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-r-lg shadow-lg transition-colors">Go</button>
          </form>
          {searchMsg && (
            <div className={"mt-1.5 px-3 py-1.5 rounded-lg shadow-lg text-xs font-medium " + (
              searchMsg.type === "error" ? "bg-red-600 text-white" : "bg-amber-500 text-white"
            )}>
              {searchMsg.text}
            </div>
          )}
        </div>
        <div ref={mapRef} className="w-full h-full" />

        {/* Save success toast */}
        {saveSuccess && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1001] bg-emerald-600 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-lg">
            ✓ Saved {saveSuccess} to list
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div className="absolute top-3 left-3 bg-white rounded-lg shadow-lg px-3 py-2 flex items-center gap-2 z-[1000]">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
            <span className="text-xs text-slate-600">Loading properties...</span>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm rounded-lg shadow px-2.5 py-1.5 z-[1000]">
          <div className="flex items-center gap-2.5 text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>1-9</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-600"></span>10-19</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>20-49</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-purple-600"></span>50+</span>
          </div>
        </div>

        {/* Property count */}
        <div className="absolute top-3 right-14 bg-white/90 backdrop-blur-sm rounded-lg shadow px-2.5 py-1.5 z-[1000]">
          <p className="text-[10px] font-medium text-slate-600">
            {total > properties.length ? `Showing top ${properties.length} of ${total.toLocaleString()}` : `${properties.length} properties`}
          </p>
        </div>
      </div>
      {/* Building Profile Modal */}
      {selectedProperty && viewProfile && (
        <div className="fixed inset-0 z-[2000] flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setViewProfile(false)} />
          <div className="relative ml-auto w-full max-w-3xl bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right">
            <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">{selectedProperty.address}</h2>
                <p className="text-xs text-slate-500">{selectedProperty.borough}</p>
              </div>
              <button onClick={() => setViewProfile(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 text-lg">
                &times;
              </button>
            </div>
            <div className="p-5">
              <BuildingProfile
                boroCode={selectedProperty.boroCode}
                block={selectedProperty.block}
                lot={selectedProperty.lot}
                address={selectedProperty.address}
                borough={selectedProperty.borough}
                ownerName={selectedProperty.ownerName}
                onClose={() => setViewProfile(false)}
                onNameClick={(name) => { setViewProfile(false); if (onNameClick) onNameClick(name); }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}