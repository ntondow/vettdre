"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchNJPropertiesInBounds } from "./nj-actions";
import type { NJPropertyResult } from "./nj-actions";
import NJBuildingProfile from "./nj-building-profile";
import { geocodeAddress } from "./map-actions";

const fmtPrice = (n: number) => n > 0 ? "$" + n.toLocaleString() : "—";

interface Filters {
  minUnits?: number;
  maxUnits?: number;
  maxValue?: number;
  minYearBuilt?: number;
  maxYearBuilt?: number;
  ownerName?: string;
}

export default function NJMapSearch() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const [properties, setProperties] = useState<NJPropertyResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<NJPropertyResult | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({});
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [sortBy, setSortBy] = useState<"units" | "value" | "year">("units");
  const [addressSearch, setAddressSearch] = useState("");
  const [searchMsg, setSearchMsg] = useState<{ type: "error" | "info"; text: string } | null>(null);
  const fetchTimeoutRef = useRef<any>(null);
  const searchHighlightRef = useRef<any>(null);
  const loadPropertiesRef = useRef<() => void>(() => {});

  // Mobile drawer state
  const [drawerState, setDrawerState] = useState<"closed" | "peek" | "half" | "full">("closed");

  // Load Leaflet dynamically
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    if (!(window as any).L) {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => setLeafletLoaded(true);
      document.head.appendChild(script);
    } else {
      setLeafletLoaded(true);
    }
  }, []);

  // Initialize map
  useEffect(() => {
    if (!leafletLoaded || !mapRef.current || leafletMapRef.current) return;

    const L = (window as any).L;
    let initCenter = [40.7282, -74.0776]; // Jersey City
    let initZoom = 14;
    try {
      const saved = sessionStorage.getItem("vettdre-nj-map");
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

    map.on("moveend", () => {
      try {
        const c = map.getCenter();
        sessionStorage.setItem("vettdre-nj-map", JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() }));
      } catch {}

      if (searchHighlightRef.current) {
        searchHighlightRef.current.remove();
        searchHighlightRef.current = null;
      }

      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => {
        loadPropertiesRef.current();
      }, 800);
    });

    setTimeout(() => loadPropertiesRef.current(), 100);

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [leafletLoaded]);

  // Detect visibility (tab switch)
  useEffect(() => {
    if (!mapRef.current || !leafletMapRef.current) return;
    const mapEl = mapRef.current;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && leafletMapRef.current) {
        leafletMapRef.current.invalidateSize();
        loadPropertiesRef.current();
      }
    }, { threshold: 0.1 });
    observer.observe(mapEl);
    return () => observer.disconnect();
  }, [leafletLoaded]);

  const updateMarkers = useCallback((props: NJPropertyResult[]) => {
    const L = (window as any).L;
    if (!L || !markersRef.current) return;
    markersRef.current.clearLayers();

    props.forEach((p) => {
      if (p.lat === 0 || p.lng === 0) return;

      // Green color scheme for NJ
      const radius = p.units >= 50 ? 10 : p.units >= 20 ? 8 : p.units >= 10 ? 6 : 5;
      const fillColor = p.units >= 50 ? "#059669" : p.units >= 20 ? "#10b981" : p.units >= 10 ? "#34d399" : "#6ee7b7";

      const marker = L.circleMarker([p.lat, p.lng], {
        radius,
        fillColor,
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85,
      });

      marker.bindTooltip(
        `<div style="font-family:system-ui;font-size:12px;line-height:1.4;">
          <strong>${p.address || "Block " + p.block + ", Lot " + p.lot}</strong><br/>
          ${p.municipality} · ${p.units} units<br/>
          ${p.assessedTotal > 0 ? "$" + p.assessedTotal.toLocaleString() : ""}
        </div>`,
        { direction: "top", offset: [0, -radius] }
      );

      marker.on("click", () => {
        setSelectedProperty(p);
        setDrawerState("half");
      });

      markersRef.current.addLayer(marker);
    });
  }, []);

  const loadProperties = useCallback(async () => {
    const map = leafletMapRef.current;
    if (!map) return;

    const zoom = map.getZoom();
    if (zoom < 14) {
      setProperties([]);
      setTotal(0);
      if (markersRef.current) markersRef.current.clearLayers();
      return;
    }

    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    setLoading(true);
    try {
      const result = await fetchNJPropertiesInBounds(sw.lat, sw.lng, ne.lat, ne.lng, filters);
      setProperties(result.properties);
      setTotal(result.total);
      updateMarkers(result.properties);
    } catch (err) {
      console.error("NJ Map load error:", err);
    }
    setLoading(false);
  }, [filters, updateMarkers]);

  loadPropertiesRef.current = loadProperties;

  useEffect(() => {
    loadProperties();
  }, [filters]);

  const handleAddressSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!addressSearch.trim() || !leafletMapRef.current) return;
    setSearchMsg(null);

    const geoResult = await geocodeAddress(addressSearch.trim());
    if (geoResult) {
      leafletMapRef.current.setView([geoResult.lat, geoResult.lng], 17);
    } else {
      setSearchMsg({ type: "error", text: "Address not found. Try a more specific address." });
      setTimeout(() => setSearchMsg(null), 5000);
    }
  };

  const sorted = [...properties].sort((a, b) => {
    if (sortBy === "units") return b.units - a.units;
    if (sortBy === "value") return b.assessedTotal - a.assessedTotal;
    if (sortBy === "year") return b.yearBuilt - a.yearBuilt;
    return 0;
  });

  return (
    <div className="relative" style={{ height: "calc(100vh - 180px)" }}>
      {/* Map container */}
      <div ref={mapRef} className="absolute inset-0 z-0" />

      {/* Top bar: search + filters */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center gap-2">
        <form onSubmit={handleAddressSearch} className="flex-1 flex gap-2">
          <input
            value={addressSearch}
            onChange={(e) => setAddressSearch(e.target.value)}
            placeholder="Search NJ address..."
            className="flex-1 h-10 px-3 bg-white rounded-lg shadow-md text-sm border-0 focus:ring-2 focus:ring-green-500 focus:outline-none"
          />
          <button type="submit" className="h-10 px-4 bg-green-600 text-white text-sm font-semibold rounded-lg shadow-md hover:bg-green-700">
            Go
          </button>
        </form>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="h-10 px-3 bg-white rounded-lg shadow-md text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
          </svg>
          Filters
        </button>
      </div>

      {/* Search message */}
      {searchMsg && (
        <div className={`absolute top-16 left-3 right-3 z-10 p-2 rounded-lg shadow text-xs font-medium ${
          searchMsg.type === "error" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"
        }`}>
          {searchMsg.text}
        </div>
      )}

      {/* Filter panel */}
      {showFilters && (
        <div className="absolute top-16 right-3 z-20 bg-white rounded-xl shadow-xl border border-slate-200 w-64 p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-slate-900">Filters</h3>
            <button onClick={() => setShowFilters(false)} className="text-slate-400 hover:text-slate-600">&times;</button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Min Units</label>
              <input type="number" value={filters.minUnits || ""} onChange={(e) => setFilters(f => ({ ...f, minUnits: parseInt(e.target.value) || undefined }))}
                className="w-full h-8 px-2 border border-slate-300 rounded text-xs" placeholder="e.g. 5" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Max Units</label>
              <input type="number" value={filters.maxUnits || ""} onChange={(e) => setFilters(f => ({ ...f, maxUnits: parseInt(e.target.value) || undefined }))}
                className="w-full h-8 px-2 border border-slate-300 rounded text-xs" placeholder="e.g. 100" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Max Assessed Value</label>
              <input type="number" value={filters.maxValue || ""} onChange={(e) => setFilters(f => ({ ...f, maxValue: parseInt(e.target.value) || undefined }))}
                className="w-full h-8 px-2 border border-slate-300 rounded text-xs" placeholder="e.g. 5000000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Min Year Built</label>
              <input type="number" value={filters.minYearBuilt || ""} onChange={(e) => setFilters(f => ({ ...f, minYearBuilt: parseInt(e.target.value) || undefined }))}
                className="w-full h-8 px-2 border border-slate-300 rounded text-xs" placeholder="e.g. 1950" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Owner Name</label>
              <input type="text" value={filters.ownerName || ""} onChange={(e) => setFilters(f => ({ ...f, ownerName: e.target.value || undefined }))}
                className="w-full h-8 px-2 border border-slate-300 rounded text-xs" placeholder="e.g. Smith" />
            </div>
            <button onClick={() => setFilters({})} className="w-full text-xs text-red-600 hover:text-red-700 font-medium mt-1">
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="absolute bottom-3 left-3 z-10 bg-white/90 backdrop-blur-sm rounded-lg shadow px-3 py-2 text-xs text-slate-600 flex items-center gap-2">
        {loading && <span className="animate-spin inline-block w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full" />}
        <span className="font-semibold text-green-700">{total}</span> properties
        {leafletMapRef.current && leafletMapRef.current.getZoom() < 14 && (
          <span className="text-amber-600 ml-1">Zoom in to load data</span>
        )}
      </div>

      {/* Sort bar */}
      <div className="absolute bottom-3 right-3 z-10 bg-white/90 backdrop-blur-sm rounded-lg shadow px-2 py-1 flex gap-1">
        {(["units", "value", "year"] as const).map(s => (
          <button key={s} onClick={() => setSortBy(s)}
            className={`px-2 py-1 text-[10px] font-medium rounded ${sortBy === s ? "bg-green-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            {s === "units" ? "Units" : s === "value" ? "Value" : "Year"}
          </button>
        ))}
      </div>

      {/* Desktop sidebar — property list */}
      <div className="hidden md:block absolute top-16 bottom-12 right-3 z-10 w-80 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700">{sorted.length} Properties</span>
        </div>
        <div className="overflow-y-auto" style={{ height: "calc(100% - 36px)" }}>
          {sorted.map((p, i) => (
            <button
              key={i}
              onClick={() => {
                setSelectedProperty(p);
                if (leafletMapRef.current && p.lat && p.lng) {
                  leafletMapRef.current.panTo([p.lat, p.lng]);
                }
              }}
              className={`w-full text-left px-3 py-2.5 border-b border-slate-100 hover:bg-green-50 transition-colors ${
                selectedProperty === p ? "bg-green-50" : ""
              }`}
            >
              <p className="text-xs font-semibold text-slate-900 truncate">{p.address || `Block ${p.block}, Lot ${p.lot}`}</p>
              <p className="text-[10px] text-slate-400">{p.municipality}, {p.county}</p>
              <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                <span className="font-bold text-green-700">{p.units} units</span>
                {p.yearBuilt > 0 && <span>Built {p.yearBuilt}</span>}
                <span className="ml-auto font-semibold">{fmtPrice(p.assessedTotal)}</span>
              </div>
            </button>
          ))}
          {sorted.length === 0 && !loading && (
            <div className="p-6 text-center text-xs text-slate-400">
              {leafletMapRef.current && leafletMapRef.current.getZoom() < 14
                ? "Zoom in to see NJ properties"
                : "No multifamily properties in this area"}
            </div>
          )}
        </div>
      </div>

      {/* Mobile bottom drawer */}
      <div className="md:hidden">
        {/* Peek bar */}
        {drawerState === "closed" && sorted.length > 0 && (
          <button
            onClick={() => setDrawerState("peek")}
            className="absolute bottom-12 left-3 right-3 z-10 bg-white rounded-xl shadow-xl p-3 flex items-center justify-between"
          >
            <span className="text-xs font-bold text-green-700">{sorted.length} properties</span>
            <span className="text-xs text-slate-400">Tap to expand</span>
          </button>
        )}

        {drawerState !== "closed" && (
          <div
            className="absolute bottom-0 left-0 right-0 z-20 bg-white rounded-t-2xl shadow-2xl"
            style={{
              height: drawerState === "peek" ? "30vh" : drawerState === "half" ? "50vh" : "85vh",
              animation: "slide-up-sheet 0.3s ease-out",
            }}
          >
            <div className="flex items-center justify-center pt-2 pb-1">
              <div className="w-10 h-1 bg-slate-300 rounded-full" />
            </div>
            <div className="flex items-center justify-between px-4 py-1 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700">{sorted.length} Properties</span>
              <div className="flex gap-1">
                {(["peek", "half", "full"] as const).map(s => (
                  <button key={s} onClick={() => setDrawerState(s)}
                    className={`px-2 py-0.5 text-[10px] rounded ${drawerState === s ? "bg-green-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {s === "peek" ? "Min" : s === "half" ? "Half" : "Full"}
                  </button>
                ))}
                <button onClick={() => setDrawerState("closed")} className="px-2 py-0.5 text-[10px] text-slate-400">
                  &times;
                </button>
              </div>
            </div>
            <div className="overflow-y-auto pb-safe" style={{ height: "calc(100% - 52px)" }}>
              {selectedProperty && (
                <div className="p-3 bg-green-50 border-b border-green-200">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{selectedProperty.address || `Block ${selectedProperty.block}, Lot ${selectedProperty.lot}`}</p>
                      <p className="text-xs text-slate-500">{selectedProperty.municipality}, {selectedProperty.county}</p>
                    </div>
                    <button
                      onClick={() => { setShowProfile(true); }}
                      className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded hover:bg-green-200"
                    >
                      View Profile
                    </button>
                  </div>
                  <div className="flex gap-3 mt-2 text-xs text-slate-600">
                    <span className="font-bold text-green-700">{selectedProperty.units} units</span>
                    {selectedProperty.yearBuilt > 0 && <span>Built {selectedProperty.yearBuilt}</span>}
                    <span className="font-semibold">{fmtPrice(selectedProperty.assessedTotal)}</span>
                  </div>
                </div>
              )}
              {sorted.map((p, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setSelectedProperty(p);
                    if (leafletMapRef.current && p.lat && p.lng) {
                      leafletMapRef.current.panTo([p.lat, p.lng]);
                    }
                  }}
                  className={`w-full text-left px-3 py-2.5 border-b border-slate-100 ${
                    selectedProperty === p ? "bg-green-50" : ""
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-900 truncate">{p.address || `Block ${p.block}, Lot ${p.lot}`}</p>
                  <p className="text-[10px] text-slate-400">{p.municipality}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                    <span className="font-bold text-green-700">{p.units} units</span>
                    <span className="ml-auto font-semibold">{fmtPrice(p.assessedTotal)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* NJ Building Profile Slide-over */}
      {showProfile && selectedProperty && (
        <NJBuildingProfile
          municipality={selectedProperty.municipality}
          block={selectedProperty.block}
          lot={selectedProperty.lot}
          county={selectedProperty.county}
          address={selectedProperty.address}
          onClose={() => setShowProfile(false)}
        />
      )}

      {/* Desktop selected property panel */}
      {selectedProperty && !showProfile && (
        <div className="hidden md:block absolute top-16 left-3 z-10 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{selectedProperty.address || `Block ${selectedProperty.block}, Lot ${selectedProperty.lot}`}</h3>
              <p className="text-xs text-slate-500">{selectedProperty.municipality}, {selectedProperty.county}</p>
            </div>
            <button onClick={() => setSelectedProperty(null)} className="text-slate-400 hover:text-slate-600">&times;</button>
          </div>
          <div className="space-y-1 text-xs text-slate-600">
            <div className="flex justify-between"><span>Units</span><span className="font-bold text-green-700">{selectedProperty.units}</span></div>
            {selectedProperty.yearBuilt > 0 && <div className="flex justify-between"><span>Year Built</span><span>{selectedProperty.yearBuilt}</span></div>}
            <div className="flex justify-between"><span>Assessed Total</span><span className="font-semibold">{fmtPrice(selectedProperty.assessedTotal)}</span></div>
            {selectedProperty.ownerName && <div className="flex justify-between"><span>Owner</span><span className="text-right max-w-[140px] truncate">{selectedProperty.ownerName}</span></div>}
            {selectedProperty.lastSalePrice > 0 && <div className="flex justify-between"><span>Last Sale</span><span className="font-semibold">{fmtPrice(selectedProperty.lastSalePrice)}</span></div>}
          </div>
          <button
            onClick={() => setShowProfile(true)}
            className="w-full mt-3 h-8 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700"
          >
            View Full Profile
          </button>
        </div>
      )}
    </div>
  );
}
