"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Search, X, Loader2 as SearchSpinner, ChevronRight, MapPin, ExternalLink } from "lucide-react";
import { searchAddresses, type AddressSuggestion } from "./actions";
import { fetchPropertiesInBounds, geocodeAddress, fetchNewDevelopmentsInBounds, fetchPropertyAtLocation } from "./map-actions";
import type { MapNewDevelopment } from "./map-actions";
import { prefetchBuilding } from "./building-profile-actions";
import { buildOwnershipGraph } from "./graph-engine";
// BuildingProfile and ProfileModal removed — rendered by parent layout
import MapLayersRenderer from "./map-layers-renderer";
import LayerControl from "./layer-control";
import { loadLayerVisibility, BASEMAPS, MAP_PANES } from "@/lib/map-layers";
import { getNeighborhoodByZip } from "@/lib/neighborhoods";
import NtaNeighborhoodFilter from "./nta-neighborhood-filter";
import { fetchNTANameList, fetchNTAPolygon, type NTAEntry } from "./neighborhood-actions";
import { getHotLeads, type HotLead } from "./motivation-actions";
import { MOTIVATION_LEVEL_CONFIG, getMotivationLevel } from "@/lib/motivation-engine";
import { hasPermission } from "@/lib/feature-gate";
import { getVitalityScoresForBounds } from "./vitality-actions";
import { VITALITY_LEVEL_CONFIG, getVitalityLevel, type VitalityScore } from "@/lib/vitality-engine";
import {
  fetchConstructionInBounds,
  fetchRecentSalesInBounds,
  fetchViolationsInBounds,
  fetch311InBounds,
  fetchViolationCountsByBlocks,
  fetch311CountsByBounds,
  fetchPermitCountsByBlocks,
  fetchRecentSalesByBlocks,
  type ConstructionActivity,
  type RecentSale,
  type ViolationPoint,
  type Complaint311,
} from "./street-intel-actions";

const fmtPrice = (n: number) => n > 0 ? "$" + n.toLocaleString() : "—";

// Ray-casting point-in-polygon test for client-side polygon filtering
function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = (yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// NYC metro bounding box
const NYC_BOUNDS = {
  sw: { lat: 40.477, lng: -74.260 },
  ne: { lat: 40.917, lng: -73.700 },
};
const isWithinNYC = (lat: number, lng: number) =>
  lat >= NYC_BOUNDS.sw.lat && lat <= NYC_BOUNDS.ne.lat &&
  lng >= NYC_BOUNDS.sw.lng && lng <= NYC_BOUNDS.ne.lng;

export interface MapProperty {
  address: string; ownerName: string; unitsRes: number; unitsTot: number;
  yearBuilt: number; numFloors: number; assessTotal: number; bldgClass: string;
  zoneDist: string; boroCode: string; block: string; lot: string;
  lat: number; lng: number; bldgArea: number; lotArea: number; borough: string;
  zip: string; ntaName: string;
}

export interface MapSearchProps {
  onBuildingSelect?: (property: MapProperty) => void;
  onNameClick?: (name: string) => void;
  externalHoveredBbl?: string | null;
  flyTo?: { lat: number; lng: number; zoom?: number } | null;
}

interface Filters {
  minUnits?: number; maxUnits?: number; minValue?: number; maxValue?: number;
  minYearBuilt?: number; maxYearBuilt?: number; minFloors?: number;
  bldgClass?: string; zoneDist?: string; excludePublic?: boolean;
}

export default function MapSearch({ onBuildingSelect, onNameClick, externalHoveredBbl, flyTo }: MapSearchProps) {
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
  const [sortBy, setSortBy] = useState<"units" | "value" | "year" | "floors" | "distance" | "violations" | "311" | "distress" | "recentSale">("units");
  // Address search state removed — now handled by parent UnifiedSearchBar
  const [portfolioMarkers, setPortfolioMarkers] = useState<MapProperty[]>([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [newDevs, setNewDevs] = useState<MapNewDevelopment[]>([]);
  const [selectedNewDev, setSelectedNewDev] = useState<MapNewDevelopment | null>(null);
  const [loadingNewDevs, setLoadingNewDevs] = useState(false);
  const newDevMarkersRef = useRef<any>(null);
  const fetchTimeoutRef = useRef<any>(null);
  const searchHighlightRef = useRef<any>(null);
  const loadPropertiesRef = useRef<() => void>(() => {});
  const fetchIdRef = useRef(0); // monotonic counter — only latest fetch wins
  // Bug 2+3: independently-fetched property from address search (bypasses filters)
  const [searchedProperty, setSearchedProperty] = useState<MapProperty | null>(null);

  // Floating map search bar state
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [mapSearchResults, setMapSearchResults] = useState<AddressSuggestion[]>([]);
  const [mapSearchLoading, setMapSearchLoading] = useState(false);
  const [mapSearchOpen, setMapSearchOpen] = useState(false);
  const [mapSearchFocusIdx, setMapSearchFocusIdx] = useState(-1);
  const mapSearchRef = useRef<HTMLDivElement>(null);
  const mapSearchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Side panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [searchPanelResults, setSearchPanelResults] = useState<AddressSuggestion[]>([]);
  const [pinnedResult, setPinnedResult] = useState<AddressSuggestion | MapProperty | null>(null);
  const [pinnedLabel, setPinnedLabel] = useState<"search" | "marker" | null>(null);
  const [activeResultKey, setActiveResultKey] = useState<string | null>(null);
  const [activeMarkerProperty, setActiveMarkerProperty] = useState<MapProperty | null>(null);
  const [panelSortKey, setPanelSortKey] = useState<"units" | "assessed" | "year">("units");
  const [panelSortDesc, setPanelSortDesc] = useState(true);
  const [panelFilter, setPanelFilter] = useState("");
  const lastSearchQueryRef = useRef("");
  const panelListRef = useRef<HTMLDivElement>(null);

  // Neighborhood geofence filter — clicking NTA polygon or selecting from dropdown (multi-select)
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>([]);
  // Polygon coordinates per neighborhood for precise point-in-polygon filtering
  const [neighborhoodPolygons, setNeighborhoodPolygons] = useState<Map<string, [number, number][]>>(new Map());
  // Custom user-drawn polygon coordinates [lat, lng][]
  const [drawnPolygon, setDrawnPolygon] = useState<[number, number][] | null>(null);
  const drawnPolygonRef = useRef<[number, number][] | null>(null);
  const [isDrawMode, setIsDrawMode] = useState(false);

  // Stable key for Map — changes only when neighborhoods are added/removed
  const neighborhoodPolygonKey = neighborhoodPolygons.size > 0
    ? `${neighborhoodPolygons.size}:${[...neighborhoodPolygons.keys()].sort().join(",")}`
    : "";
  // Memoized to prevent infinite API call loop: without this, activePolygons is a new
  // reference every render → loadProperties useCallback recreated → useEffect fires → loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const activePolygons = useMemo<[number, number][][]>(() => {
    if (drawnPolygon) return [drawnPolygon];
    return Array.from(neighborhoodPolygons.values());
  }, [drawnPolygon, neighborhoodPolygonKey]);
  const hasActivePolygon = activePolygons.length > 0;

  // NTA name list for the dropdown (fetched from NTA GeoJSON — same names as map polygons)
  const [ntaList, setNtaList] = useState<NTAEntry[]>([]);
  useEffect(() => {
    fetchNTANameList().then(setNtaList).catch(() => {});
  }, []);

  // Toggle neighborhood in multi-select — adds/removes from list, fetches polygon
  const toggleNeighborhood = useCallback(async (
    name: string | null,
    bounds?: { swLat: number; swLng: number; neLat: number; neLng: number },
    polygon?: [number, number][], // polygon coords from map click — skip server fetch
  ) => {
    if (!name) {
      // Clear all neighborhoods
      setSelectedNeighborhoods([]);
      setNeighborhoodPolygons(new Map());
      return;
    }

    setDrawnPolygon(null); // neighborhood selection clears drawn polygon

    setSelectedNeighborhoods(prev => {
      if (prev.includes(name)) {
        // Remove this neighborhood
        setNeighborhoodPolygons(prevPolys => {
          const next = new Map(prevPolys);
          next.delete(name);
          return next;
        });
        return prev.filter(n => n !== name);
      } else {
        // Add this neighborhood — fetch polygon
        (async () => {
          let coords = polygon;
          if (!coords || coords.length < 3) {
            coords = (await fetchNTAPolygon(name)) ?? undefined;
          }
          if (coords && coords.length >= 3) {
            setNeighborhoodPolygons(prevPolys => new Map(prevPolys).set(name, coords!));
          }
        })();
        return [...prev, name];
      }
    });

    if (bounds && leafletMapRef.current) {
      const L = (window as any).L;
      if (L) {
        leafletMapRef.current.flyToBounds(
          L.latLngBounds([bounds.swLat, bounds.swLng], [bounds.neLat, bounds.neLng]),
          { padding: [30, 30], duration: 0.6 },
        );
      }
    }
    // Auto-enable neighborhoods layer
    setLayerVisibility(prev => ({ ...prev, neighborhoods: true }));
  }, []);

  // Bi-directional hover highlighting between map markers and list items
  const markersByBblRef = useRef<Map<string, any>>(new Map());
  const prevHighlightRef = useRef<string | null>(null);
  const [hoveredBbl, setHoveredBbl] = useState<string | null>(null);

  // Draw tool refs
  const drawVerticesRef = useRef<[number, number][]>([]);
  const drawPreviewRef = useRef<any>(null); // L.polyline for in-progress drawing
  const drawMarkersRef = useRef<any[]>([]); // L.circleMarker vertices
  const drawnPolygonLayerRef = useRef<any>(null); // L.polygon for completed drawing
  const isDrawModeRef = useRef(false); // ref mirror for Leaflet closure access
  const drawControlRef = useRef<any>(null); // L.Control instance for Draw button
  const drawControlClickRef = useRef<(() => void) | null>(null); // click handler ref for Leaflet control

  // Neighborhood select mode — opt-in via toolbar button
  const [isNeighborhoodSelectMode, setIsNeighborhoodSelectMode] = useState(false);
  const isNeighborhoodSelectModeRef = useRef(false);
  const neighborhoodControlRef = useRef<any>(null);
  const neighborhoodControlClickRef = useRef<(() => void) | null>(null);

  // Recent searches + ProfileModal state removed — handled by parent layout

  // Map layers state — single source of truth for all layer toggles
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>(() => loadLayerVisibility());
  const [activeBasemap, setActiveBasemap] = useState("street");
  const tileLayerRef = useRef<any>(null);

  // Derived toggle booleans from layerVisibility (replaces standalone useState)
  const showNewDevs = layerVisibility["new-developments"] ?? false;
  const showHotLeads = layerVisibility["hot-leads"] ?? false;
  const showVitality = layerVisibility["vitality"] ?? false;
  const showConstruction = layerVisibility["construction"] ?? false;
  const showSales = layerVisibility["recent-sales"] ?? false;
  const showViolations = layerVisibility["violations"] ?? false;
  const show311 = layerVisibility["complaints-311"] ?? false;
  const showBldgLabels = layerVisibility["building-labels"] ?? false;

  // Hot Leads — motivation-scored properties (Pro+ feature)
  const [hotLeads, setHotLeads] = useState<HotLead[]>([]);
  const [hotLeadsLoading, setHotLeadsLoading] = useState(false);
  const hotLeadsMarkersRef = useRef<any>(null);
  const hotLeadsDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Neighborhood Vitality heatmap overlay (Pro+ feature)
  const [vitalityScores, setVitalityScores] = useState<VitalityScore[]>([]);
  const [vitalityLoading, setVitalityLoading] = useState(false);
  const vitalityLayerRef = useRef<any>(null);
  const vitalityGeoJsonRef = useRef<any>(null); // cached boundary data
  const vitalityDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Street Intelligence layers — zoom 16+ viewport fetching
  const [constructionData, setConstructionData] = useState<ConstructionActivity[]>([]);
  const [constructionLoading, setConstructionLoading] = useState(false);
  const constructionLayerRef = useRef<any>(null);
  const constructionDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [salesData, setSalesData] = useState<RecentSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const salesLayerRef = useRef<any>(null);
  const salesDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [violationsData, setViolationsData] = useState<ViolationPoint[]>([]);
  const [violationsLoading, setViolationsLoading] = useState(false);
  const violationsLayerRef = useRef<any>(null);
  const violationsDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [complaints311Data, setComplaints311Data] = useState<Complaint311[]>([]);
  const [complaints311Loading, setComplaints311Loading] = useState(false);
  const complaints311LayerRef = useRef<any>(null);
  const complaints311DebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const bldgLabelsLayerRef = useRef<any>(null);
  const clusterLayerRef = useRef<any>(null);

  // Pill-sort enrichment: cached counts per property, keyed by "boroCode-block-lot"
  const [enrichmentCounts, setEnrichmentCounts] = useState<{
    violations?: Record<string, number>;
    complaints311?: Record<string, number>; // keyed by uppercase address
    permits?: Record<string, number>;
    sales?: Record<string, { date: string; price: number }>;
  }>({});
  const [enrichLoading, setEnrichLoading] = useState(false);

  // Keep isDrawModeRef in sync for Leaflet closure access
  useEffect(() => { isDrawModeRef.current = isDrawMode; }, [isDrawMode]);

  // Keep neighborhood select mode ref in sync
  useEffect(() => { isNeighborhoodSelectModeRef.current = isNeighborhoodSelectMode; }, [isNeighborhoodSelectMode]);

  // Keep drawn polygon ref in sync — used in Leaflet closures to avoid stale state
  useEffect(() => { drawnPolygonRef.current = drawnPolygon; }, [drawnPolygon]);

  // External flyTo prop — parent tells us to navigate the map
  useEffect(() => {
    if (flyTo && leafletMapRef.current) {
      leafletMapRef.current.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom ?? 17, { duration: 0.8 });
      addSearchHighlight(flyTo.lat, flyTo.lng, "");
    }
  }, [flyTo]);

  // Sync external hover from results panel to map markers
  useEffect(() => {
    if (!externalHoveredBbl) return;
    const marker = markersByBblRef.current.get(externalHoveredBbl);
    if (marker) {
      const L = (window as any).L;
      if (L) {
        marker.setStyle({ weight: 4, color: "#3b82f6", fillOpacity: 1 });
      }
    }
    return () => {
      if (marker) {
        marker.setStyle({ weight: 2, color: "#fff", fillOpacity: 0.85 });
      }
    };
  }, [externalHoveredBbl]);

  // Wire the Draw control click handler to React state
  useEffect(() => {
    drawControlClickRef.current = () => {
      if (isDrawMode) {
        // Cancel draw mode
        setIsDrawMode(false);
        drawVerticesRef.current = [];
        if (drawPreviewRef.current && leafletMapRef.current) {
          leafletMapRef.current.removeLayer(drawPreviewRef.current);
          drawPreviewRef.current = null;
        }
        drawMarkersRef.current.forEach(m => leafletMapRef.current?.removeLayer(m));
        drawMarkersRef.current = [];
      } else {
        setIsDrawMode(true);
        setDrawnPolygon(null);
        setSelectedNeighborhoods([]);
        setNeighborhoodPolygons(new Map());
        drawVerticesRef.current = [];
        if (drawnPolygonLayerRef.current && leafletMapRef.current) {
          leafletMapRef.current.removeLayer(drawnPolygonLayerRef.current);
          drawnPolygonLayerRef.current = null;
        }
      }
    };
  }, [isDrawMode]);

  // Sync Draw control button appearance with draw mode state
  useEffect(() => {
    const ctrl = drawControlRef.current;
    if (!ctrl) return;
    const container = ctrl.getContainer?.();
    const btn = container?._btn;
    if (!btn) return;
    if (isDrawMode) {
      btn.innerHTML = "✕";
      btn.title = "Cancel drawing";
      btn.style.cssText = "width:34px;height:34px;line-height:34px;text-align:center;font-size:16px;cursor:pointer;background:#ef4444;color:#fff;font-weight:bold;";
    } else {
      btn.innerHTML = "✏️";
      btn.title = "Draw custom search area";
      btn.style.cssText = "width:34px;height:34px;line-height:34px;text-align:center;font-size:16px;cursor:pointer;background:#fff;";
    }
  }, [isDrawMode]);

  // Wire neighborhood select control click handler
  useEffect(() => {
    neighborhoodControlClickRef.current = () => {
      const next = !isNeighborhoodSelectMode;
      setIsNeighborhoodSelectMode(next);
      if (next) {
        // Entering neighborhood select mode — cancel draw mode if active
        if (isDrawMode) {
          setIsDrawMode(false);
          drawVerticesRef.current = [];
          if (drawPreviewRef.current && leafletMapRef.current) {
            leafletMapRef.current.removeLayer(drawPreviewRef.current);
            drawPreviewRef.current = null;
          }
          drawMarkersRef.current.forEach(m => leafletMapRef.current?.removeLayer(m));
          drawMarkersRef.current = [];
        }
        // Auto-enable neighborhoods layer
        setLayerVisibility(prev => ({ ...prev, neighborhoods: true }));
      }
    };
  }, [isNeighborhoodSelectMode, isDrawMode]);

  // Sync neighborhood control button appearance
  useEffect(() => {
    const ctrl = neighborhoodControlRef.current;
    if (!ctrl) return;
    const container = ctrl.getContainer?.();
    const btn = container?._btn;
    if (!btn) return;
    if (isNeighborhoodSelectMode) {
      btn.innerHTML = "\u{1F3D8}\uFE0F";
      btn.title = "Cancel neighborhood selection";
      btn.style.cssText = "width:34px;height:34px;line-height:34px;text-align:center;font-size:16px;cursor:pointer;background:#4F46E5;color:#fff;font-weight:bold;";
    } else {
      btn.innerHTML = "\u{1F3D8}\uFE0F";
      btn.title = "Select neighborhood on map";
      btn.style.cssText = "width:34px;height:34px;line-height:34px;text-align:center;font-size:16px;cursor:pointer;background:#fff;";
    }
    // Hide button during draw mode
    if (container) container.style.display = isDrawMode ? "none" : "";
  }, [isNeighborhoodSelectMode, isDrawMode]);

  // Crosshair cursor + Escape key for neighborhood select mode
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    if (isNeighborhoodSelectMode) {
      (map.getContainer() as HTMLElement).style.cursor = "crosshair";
    } else if (!isDrawMode) {
      (map.getContainer() as HTMLElement).style.cursor = "";
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isNeighborhoodSelectMode) {
        setIsNeighborhoodSelectMode(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (!isDrawMode && map.getContainer()) {
        (map.getContainer() as HTMLElement).style.cursor = "";
      }
    };
  }, [isNeighborhoodSelectMode, isDrawMode]);

  // Load recent searches from sessionStorage
  // Recent searches loading removed — handled by UnifiedSearchBar

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
        .map-dark-tooltip {
          background: #1f2937 !important;
          color: #fff !important;
          border: none !important;
          border-radius: 4px !important;
          padding: 2px 6px !important;
          font-size: 11px !important;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3) !important;
        }
        .map-dark-tooltip::before {
          border-top-color: #1f2937 !important;
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
      maxBounds: L.latLngBounds(
        [NYC_BOUNDS.sw.lat, NYC_BOUNDS.sw.lng],
        [NYC_BOUNDS.ne.lat, NYC_BOUNDS.ne.lng],
      ),
      maxBoundsViscosity: 1.0,
      minZoom: 10,
    });

    L.control.zoom({ position: "topright" }).addTo(map);

    // Draw Area floating control — top-right, above zoom
    const DrawControl = L.Control.extend({
      options: { position: "topright" },
      onAdd() {
        const container = L.DomUtil.create("div", "leaflet-bar leaflet-control");
        const btn = L.DomUtil.create("a", "", container);
        btn.innerHTML = "✏️";
        btn.title = "Draw custom search area";
        btn.href = "#";
        btn.setAttribute("role", "button");
        btn.style.cssText = "width:34px;height:34px;line-height:34px;text-align:center;font-size:16px;cursor:pointer;background:#fff;";
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.on(btn, "click", (e: any) => {
          L.DomEvent.preventDefault(e);
          // Read from ref — outer component will handle state via drawControlClickRef
          drawControlClickRef.current?.();
        });
        (container as any)._btn = btn;
        return container;
      },
    });
    const drawCtrl = new DrawControl();
    drawCtrl.addTo(map);
    drawControlRef.current = drawCtrl;

    // Neighborhood Select control — top-right, below draw
    const NeighborhoodControl = L.Control.extend({
      options: { position: "topright" },
      onAdd() {
        const container = L.DomUtil.create("div", "leaflet-bar leaflet-control");
        const btn = L.DomUtil.create("a", "", container);
        btn.innerHTML = "\u{1F3D8}\uFE0F"; // cityscape emoji
        btn.title = "Select neighborhood on map";
        btn.href = "#";
        btn.setAttribute("role", "button");
        btn.style.cssText = "width:34px;height:34px;line-height:34px;text-align:center;font-size:16px;cursor:pointer;background:#fff;";
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.on(btn, "click", (e: any) => {
          L.DomEvent.preventDefault(e);
          neighborhoodControlClickRef.current?.();
        });
        (container as any)._btn = btn;
        return container;
      },
    });
    const nCtrl = new NeighborhoodControl();
    nCtrl.addTo(map);
    neighborhoodControlRef.current = nCtrl;

    tileLayerRef.current = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    // Create searchResults pane for markers (above all layer overlays)
    const srPane = map.createPane("searchResults");
    srPane.style.zIndex = String(MAP_PANES.searchResults);

    markersRef.current = L.layerGroup({ pane: "searchResults" }).addTo(map);
    newDevMarkersRef.current = L.layerGroup({ pane: "searchResults" }).addTo(map);
    hotLeadsMarkersRef.current = L.layerGroup({ pane: "searchResults" }).addTo(map);

    // Street intel panes
    const constructionPane = map.createPane("construction");
    constructionPane.style.zIndex = "420";
    const salesPane = map.createPane("sales");
    salesPane.style.zIndex = "430";
    const violationsPane = map.createPane("violations");
    violationsPane.style.zIndex = "340";
    const violationBadgesPane = map.createPane("violationBadges");
    violationBadgesPane.style.zIndex = "360";
    const buildingLabelsPane = map.createPane("buildingLabels");
    buildingLabelsPane.style.zIndex = "370";

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
        loadPropertiesRef.current();
      }, 800);
    });

    // Initial load
    setTimeout(() => loadPropertiesRef.current(), 100);

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [leafletLoaded]);

  // Detect when map container becomes visible (e.g. tab switch) — fix tiles + reload data
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

  // handleAddressSearch removed — now handled by parent UnifiedSearchBar + flyTo prop

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
            zip: pp.zipcode || pp.zip || "",
            ntaName: pp.ntaName || "",
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
          marker.on("click", () => { setSelectedProperty(pp); onBuildingSelect?.(pp); });
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

  const handleLayerToggle = useCallback((layerId: string, visible: boolean) => {
    setLayerVisibility((prev) => ({ ...prev, [layerId]: visible }));
  }, []);

  // Basemap switch handler
  const handleBasemapChange = useCallback((basemapId: string) => {
    const L = (window as any).L;
    if (!L || !leafletMapRef.current || !tileLayerRef.current) return;
    const bm = BASEMAPS.find((b) => b.id === basemapId);
    if (!bm) return;
    leafletMapRef.current.removeLayer(tileLayerRef.current);
    tileLayerRef.current = L.tileLayer(bm.url, {
      attribution: bm.attribution,
      maxZoom: bm.maxZoom,
    }).addTo(leafletMapRef.current);
    // Move tile layer to back so overlays stay on top
    tileLayerRef.current.bringToBack();
    setActiveBasemap(basemapId);
  }, []);

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
    // Skip zoom check when a polygon (neighborhood or drawn) is active
    if (zoom < 12 && !hasActivePolygon) {
      setProperties([]);
      setTotal(0);
      return;
    }

    // Always use the current viewport bounds for the PLUTO query.
    // When polygons are active, the viewport pre-filters (fast via Socrata),
    // then point-in-polygon post-filters for precision.
    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    // Monotonic fetch ID — only the latest request's results are applied.
    // Prevents stale unfiltered results from overwriting polygon-filtered ones.
    const myFetchId = ++fetchIdRef.current;

    setLoading(true);
    try {
      const polys = activePolygons.length > 0 ? activePolygons : undefined;
      const result = await fetchPropertiesInBounds(
        sw.lat, sw.lng, ne.lat, ne.lng,
        filters,
        polys,
      );

      // Discard stale result — a newer loadProperties() call has already started
      if (fetchIdRef.current !== myFetchId) return;

      setProperties(result.properties);
      setTotal(result.total);
      setEnrichmentCounts({}); // Clear stale enrichment data for previous result set
      updateMarkers(result.properties, drawnPolygonRef.current);

      // Prefetch top 5 results for instant profile loading
      result.properties.slice(0, 5).forEach((p: MapProperty) => {
        const bbl10 = p.boroCode + p.block.padStart(5, "0") + p.lot.padStart(4, "0");
        prefetchBuilding(bbl10).catch(() => {});
      });
    } catch (err) {
      if (fetchIdRef.current !== myFetchId) return;
      console.error("Map load error:", err);
    }
    setLoading(false);
  }, [filters, hasActivePolygon, activePolygons]);

  // Keep ref pointing to latest loadProperties (avoids stale closures in event handlers)
  loadPropertiesRef.current = loadProperties;

  // Reload when filters or active polygons change
  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  // Immediate marker re-render when polygon changes — avoids waiting for server round-trip.
  // Uses already-loaded `properties` and just re-filters markers on the client side.
  // Also triggers a server fetch for updated counts.
  useEffect(() => {
    if (drawnPolygon && drawnPolygon.length >= 3) {
      // Instantly re-render markers with polygon filter (no server wait)
      updateMarkers(properties, drawnPolygon);
      // Also kick off server fetch for accurate total/properties
      loadPropertiesRef.current();
    } else if (drawnPolygon === null && properties.length > 0) {
      // Polygon cleared — re-render all markers unfiltered
      updateMarkers(properties, null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawnPolygon]);

  // Lazy enrichment: fetch counts when sortBy requires data not in PLUTO
  useEffect(() => {
    const needsEnrich = sortBy === "violations" || sortBy === "311" || sortBy === "distress" || sortBy === "recentSale";
    if (!needsEnrich || properties.length === 0) return;

    // Check if we already have the data cached
    const needViolations = (sortBy === "violations" || sortBy === "distress") && !enrichmentCounts.violations;
    const need311 = (sortBy === "311" || sortBy === "distress") && !enrichmentCounts.complaints311;
    const needSales = sortBy === "recentSale" && !enrichmentCounts.sales;
    if (!needViolations && !need311 && !needSales) return;

    const map = leafletMapRef.current;
    if (!map) return;

    const blocks = Array.from(
      new Map(properties.map(p => [`${p.boroCode}-${p.block}`, { boroCode: p.boroCode, block: p.block }])).values(),
    );
    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    setEnrichLoading(true);

    (async () => {
      try {
        const fetches: Promise<void>[] = [];
        if (needViolations) {
          fetches.push(fetchViolationCountsByBlocks(blocks).then(data => {
            setEnrichmentCounts(prev => ({ ...prev, violations: data }));
          }));
        }
        if (need311) {
          fetches.push(fetch311CountsByBounds(sw.lat, sw.lng, ne.lat, ne.lng).then(data => {
            setEnrichmentCounts(prev => ({ ...prev, complaints311: data }));
          }));
        }
        if (needSales) {
          fetches.push(fetchRecentSalesByBlocks(blocks).then(data => {
            setEnrichmentCounts(prev => ({ ...prev, sales: data }));
          }));
        }
        await Promise.all(fetches);
      } catch (err) {
        console.error("Enrichment fetch error:", err);
      }
      setEnrichLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, properties.length]);

  // Clear enrichment cache when properties change significantly (new viewport)
  useEffect(() => {
    setEnrichmentCounts({});
  }, [filters, hasActivePolygon]);

  // Load new developments when toggle enabled
  const loadNewDevelopments = useCallback(async () => {
    const map = leafletMapRef.current;
    const L = (window as any).L;
    if (!map || !L || !newDevMarkersRef.current) return;

    const zoom = map.getZoom();
    if (zoom < 13) {
      newDevMarkersRef.current.clearLayers();
      setNewDevs([]);
      return;
    }

    setLoadingNewDevs(true);
    try {
      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const devs = await fetchNewDevelopmentsInBounds(sw.lat, sw.lng, ne.lat, ne.lng);
      setNewDevs(devs);

      newDevMarkersRef.current.clearLayers();
      devs.forEach((d: MapNewDevelopment) => {
        const radius = d.units >= 50 ? 10 : d.units >= 20 ? 8 : 6;
        const marker = L.circleMarker([d.lat, d.lng], {
          radius,
          fillColor: "#f59e0b",
          color: "#fff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.85,
        });
        marker.bindTooltip(
          `<div style="font-family:system-ui;font-size:12px;line-height:1.4;">
            <span style="background:#f59e0b;color:#fff;font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px;">NEW DEV</span><br/>
            <strong>${d.address}</strong><br/>
            ${d.units} new units · ${d.jobType === "NB" ? "New Building" : "Major Alteration"}
          </div>`,
          { direction: "top", offset: [0, -radius] }
        );
        marker.on("click", () => {
          setSelectedNewDev(d);
        });
        newDevMarkersRef.current.addLayer(marker);
      });
    } catch (err) { console.error("New dev load error:", err); }
    setLoadingNewDevs(false);
  }, []);

  useEffect(() => {
    if (showNewDevs) {
      loadNewDevelopments();
    } else {
      if (newDevMarkersRef.current) newDevMarkersRef.current.clearLayers();
      setNewDevs([]);
      setSelectedNewDev(null);
    }
  }, [showNewDevs]);

  // Re-load new developments on map move if toggle is on
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !showNewDevs) return;
    const handler = () => {
      setTimeout(() => loadNewDevelopments(), 900);
    };
    map.on("moveend", handler);
    return () => { map.off("moveend", handler); };
  }, [showNewDevs, loadNewDevelopments]);

  // Hot Leads: fetch and render motivation-scored markers
  const loadHotLeads = useCallback(async () => {
    const map = leafletMapRef.current;
    const L = (window as any).L;
    if (!map || !L) return;

    const zoom = map.getZoom();
    if (zoom < 13) {
      if (hotLeadsMarkersRef.current) hotLeadsMarkersRef.current.clearLayers();
      setHotLeads([]);
      return;
    }

    setHotLeadsLoading(true);
    try {
      const bounds = map.getBounds();
      const leads = await getHotLeads({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      }, 25, 40);
      setHotLeads(leads);

      // Render hot lead markers
      if (!hotLeadsMarkersRef.current) {
        hotLeadsMarkersRef.current = L.layerGroup().addTo(map);
      }
      hotLeadsMarkersRef.current.clearLayers();

      leads.forEach((lead) => {
        // Look up lat/lng from existing properties or use PLUTO position
        const existing = properties.find(p =>
          `${p.boroCode}${p.block.padStart(5, "0")}${p.lot.padStart(4, "0")}` === lead.bbl
        );
        // Extract boro/block/lot from BBL for the marker
        const boroCode = lead.bbl.substring(0, 1);
        const blk = lead.bbl.substring(1, 6);
        const lt = lead.bbl.substring(6, 10);

        // Get position: either from existing property or skip (PLUTO doesn't always return lat/lng in hot leads)
        let lat: number | undefined, lng: number | undefined;
        if (existing) {
          lat = existing.lat;
          lng = existing.lng;
        }
        if (!lat || !lng) return; // Skip if no coordinates

        const levelConfig = MOTIVATION_LEVEL_CONFIG[lead.score.level];
        const color = levelConfig.color;
        const radius = lead.basicInfo.units >= 50 ? 12 : lead.basicInfo.units >= 20 ? 10 : 8;

        const marker = L.circleMarker([lat, lng], {
          radius,
          fillColor: color,
          color: "#fff",
          weight: 2.5,
          opacity: 1,
          fillOpacity: 0.9,
          pane: "searchResults",
        });

        marker.bindTooltip(
          `<div style="font-family:system-ui;font-size:12px;line-height:1.4;">
            <span style="background:${color};color:#fff;font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px;">MOTIVATION ${lead.score.overall}</span><br/>
            <strong>${lead.address}</strong><br/>
            ${lead.basicInfo.units} units · ${lead.score.level.replace("_", " ").toUpperCase()}
            ${lead.score.topSignal ? `<br/><span style="font-size:10px;color:#64748b;">${lead.score.topSignal}</span>` : ""}
          </div>`,
          { direction: "top", offset: [0, -radius] }
        );
        marker.on("click", () => {
          if (existing) {
            setSelectedProperty(existing);
            onBuildingSelect?.(existing);
          }
        });

        hotLeadsMarkersRef.current.addLayer(marker);
      });
    } catch (err) {
      console.error("Hot leads load error:", err);
    }
    setHotLeadsLoading(false);
  }, [properties]);

  // Toggle hot leads on/off
  useEffect(() => {
    if (showHotLeads) {
      loadHotLeads();
    } else {
      if (hotLeadsMarkersRef.current) hotLeadsMarkersRef.current.clearLayers();
      setHotLeads([]);
    }
  }, [showHotLeads]);

  // Reload hot leads on map move (debounced)
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !showHotLeads) return;
    const handler = () => {
      clearTimeout(hotLeadsDebounceRef.current);
      hotLeadsDebounceRef.current = setTimeout(() => loadHotLeads(), 1200);
    };
    map.on("moveend", handler);
    return () => {
      map.off("moveend", handler);
      clearTimeout(hotLeadsDebounceRef.current);
    };
  }, [showHotLeads, loadHotLeads]);

  // ============================================================
  // Neighborhood Vitality Heatmap Overlay
  // ============================================================

  const loadVitalityOverlay = useCallback(async () => {
    const map = leafletMapRef.current;
    const L = (window as any).L;
    if (!map || !L) return;

    setVitalityLoading(true);
    try {
      // 1. Load ZIP boundary GeoJSON (cached after first fetch)
      if (!vitalityGeoJsonRef.current) {
        const resp = await fetch("/data/nyc-zip-boundaries.geojson");
        if (!resp.ok) { setVitalityLoading(false); return; }
        vitalityGeoJsonRef.current = await resp.json();
      }

      // 2. Fetch vitality scores for viewport
      const bounds = map.getBounds();
      const scores = await getVitalityScoresForBounds({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      });
      setVitalityScores(scores);

      // Build lookup: ZIP → score
      const scoreMap = new Map<string, VitalityScore>();
      for (const s of scores) scoreMap.set(s.zipCode, s);

      // 3. Remove old layer
      if (vitalityLayerRef.current && map.hasLayer(vitalityLayerRef.current)) {
        map.removeLayer(vitalityLayerRef.current);
      }

      // 4. Render ZIP polygons with vitality-colored fills
      vitalityLayerRef.current = L.geoJSON(vitalityGeoJsonRef.current, {
        style: (feature: any) => {
          const zip = feature?.properties?.MODZCTA;
          if (zip === "99999") return { fillOpacity: 0, weight: 0, opacity: 0 }; // Skip unassigned areas
          const vs = scoreMap.get(zip);
          if (!vs) return { fillColor: "#94A3B8", fillOpacity: 0.05, weight: 0.5, color: "#94A3B8", opacity: 0.3 };
          const cfg = VITALITY_LEVEL_CONFIG[vs.level];
          return {
            fillColor: cfg.fillColor,
            fillOpacity: cfg.fillOpacity,
            weight: 1,
            color: cfg.color,
            opacity: 0.5,
          };
        },
        onEachFeature: (feature: any, layer: any) => {
          const zip = feature?.properties?.MODZCTA;
          if (zip === "99999") return;
          const vs = scoreMap.get(zip);
          const cfg = vs ? VITALITY_LEVEL_CONFIG[vs.level] : null;
          const topPos = vs?.positiveIndicators.slice(0, 3).map((p) => p.brand || p.name).join(", ") || "—";
          const topNeg = vs?.negativeIndicators.slice(0, 3).map((p) => p.brand || p.name).join(", ") || "—";

          layer.bindTooltip(
            `<div style="font-family:system-ui;font-size:12px;line-height:1.5;max-width:220px;">
              <strong>ZIP ${zip}</strong>
              ${vs ? `<br/><span style="color:${cfg!.color};font-weight:700;">${cfg!.label}</span> · Score: ${vs.score > 0 ? "+" : ""}${vs.score}` : "<br/><span style=\"color:#94a3b8;\">No data</span>"}
              ${vs && vs.positiveCount > 0 ? `<br/><span style="color:#059669;font-size:10px;">▲ ${topPos}</span>` : ""}
              ${vs && vs.negativeCount > 0 ? `<br/><span style="color:#dc2626;font-size:10px;">▼ ${topNeg}</span>` : ""}
            </div>`,
            { sticky: true, direction: "top", className: "map-layer-tooltip" },
          );
        },
        pane: "overlayPane",
      });

      vitalityLayerRef.current.addTo(map);
    } catch (err) {
      console.error("Vitality overlay error:", err);
    }
    setVitalityLoading(false);
  }, []);

  // Toggle vitality overlay on/off
  useEffect(() => {
    if (showVitality) {
      loadVitalityOverlay();
    } else {
      const map = leafletMapRef.current;
      if (vitalityLayerRef.current && map?.hasLayer(vitalityLayerRef.current)) {
        map.removeLayer(vitalityLayerRef.current);
      }
      setVitalityScores([]);
    }
  }, [showVitality, loadVitalityOverlay]);

  // Refresh vitality overlay on map move (debounced)
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !showVitality) return;
    const handler = () => {
      clearTimeout(vitalityDebounceRef.current);
      vitalityDebounceRef.current = setTimeout(() => loadVitalityOverlay(), 800);
    };
    map.on("moveend", handler);
    return () => {
      map.off("moveend", handler);
      clearTimeout(vitalityDebounceRef.current);
    };
  }, [showVitality, loadVitalityOverlay]);

  // ============================================================
  // Street Intelligence Layers — zoom 16+ viewport fetching
  // ============================================================

  // ---- Construction Activity (R1) ----
  const loadConstruction = useCallback(async () => {
    const map = leafletMapRef.current;
    const L = (window as any).L;
    if (!map || !L) return;

    const zoom = map.getZoom();
    if (zoom < 16) {
      if (constructionLayerRef.current) { constructionLayerRef.current.clearLayers(); }
      setConstructionData([]);
      return;
    }

    setConstructionLoading(true);
    try {
      const bounds = map.getBounds();
      const data = await fetchConstructionInBounds({
        south: bounds.getSouth(), west: bounds.getWest(),
        north: bounds.getNorth(), east: bounds.getEast(),
      });
      setConstructionData(data);

      if (!constructionLayerRef.current) {
        constructionLayerRef.current = L.layerGroup({ pane: "construction" }).addTo(map);
      }
      constructionLayerRef.current.clearLayers();

      data.forEach((c) => {
        const color = c.jobType === "NB" ? "#f97316" : c.jobType === "DM" ? "#ef4444" : "#eab308";
        const label = c.jobType === "NB" ? "NEW BLDG" : c.jobType === "DM" ? "DEMO" : c.jobType === "A1" ? "MAJOR ALT" : "ALT";

        const icon = L.divIcon({
          className: "",
          html: `<div style="display:flex;align-items:center;gap:3px;background:${color};color:#fff;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.3);">
            <span style="font-size:11px;">🏗</span> ${label}
          </div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 10],
        });

        const marker = L.marker([c.lat, c.lng], { icon, pane: "construction" });
        marker.bindTooltip(
          `<div style="font-family:system-ui;font-size:12px;line-height:1.5;max-width:220px;">
            <strong>${c.address}</strong><br/>
            <span style="color:${color};font-weight:700;">${label}</span> · ${c.jobStatus}<br/>
            ${c.description ? `<span style="font-size:10px;color:#64748b;">${c.description.slice(0, 80)}</span><br/>` : ""}
            ${c.estimatedCost > 0 ? `Est. $${c.estimatedCost.toLocaleString()}<br/>` : ""}
            ${c.filingDate ? `Filed ${new Date(c.filingDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : ""}
          </div>`,
          { sticky: true, direction: "top", className: "map-layer-tooltip" },
        );
        constructionLayerRef.current.addLayer(marker);
      });
    } catch (err) {
      console.error("Construction load error:", err);
    }
    setConstructionLoading(false);
  }, []);

  useEffect(() => {
    if (showConstruction) loadConstruction();
    else {
      if (constructionLayerRef.current) constructionLayerRef.current.clearLayers();
      setConstructionData([]);
    }
  }, [showConstruction, loadConstruction]);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !showConstruction) return;
    const handler = () => {
      clearTimeout(constructionDebounceRef.current);
      constructionDebounceRef.current = setTimeout(() => loadConstruction(), 600);
    };
    map.on("moveend", handler);
    return () => { map.off("moveend", handler); clearTimeout(constructionDebounceRef.current); };
  }, [showConstruction, loadConstruction]);

  // ---- Recent Sales (R2) ----
  const loadRecentSales = useCallback(async () => {
    const map = leafletMapRef.current;
    const L = (window as any).L;
    if (!map || !L) return;

    const zoom = map.getZoom();
    if (zoom < 16) {
      if (salesLayerRef.current) salesLayerRef.current.clearLayers();
      setSalesData([]);
      return;
    }

    setSalesLoading(true);
    try {
      const bounds = map.getBounds();
      const data = await fetchRecentSalesInBounds({
        south: bounds.getSouth(), west: bounds.getWest(),
        north: bounds.getNorth(), east: bounds.getEast(),
      });
      setSalesData(data);

      if (!salesLayerRef.current) {
        salesLayerRef.current = L.layerGroup({ pane: "sales" }).addTo(map);
      }
      salesLayerRef.current.clearLayers();

      data.forEach((s) => {
        const price = s.salePrice;
        const color = price >= 5000000 ? "#8b5cf6" : price >= 1000000 ? "#3b82f6" : "#22c55e";
        const label = price >= 1000000
          ? `$${(price / 1000000).toFixed(1)}M`
          : `$${Math.round(price / 1000)}K`;

        const icon = L.divIcon({
          className: "",
          html: `<div style="background:${color};color:#fff;font-size:10px;font-weight:800;padding:2px 6px;border-radius:10px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.25);letter-spacing:-0.3px;">
            ${label}
          </div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 10],
        });

        const marker = L.marker([s.lat, s.lng], { icon, pane: "sales" });
        marker.bindTooltip(
          `<div style="font-family:system-ui;font-size:12px;line-height:1.5;max-width:220px;">
            <strong>${s.address}</strong><br/>
            <span style="color:${color};font-weight:700;">$${s.salePrice.toLocaleString()}</span><br/>
            ${s.saleDate ? new Date(s.saleDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}<br/>
            ${s.units > 0 ? `${s.units} units · ` : ""}${s.sqFt > 0 ? `${s.sqFt.toLocaleString()} sf` : ""}
            ${s.pricePerSqFt > 0 ? ` · $${s.pricePerSqFt}/sf` : ""}
          </div>`,
          { sticky: true, direction: "top", className: "map-layer-tooltip" },
        );
        salesLayerRef.current.addLayer(marker);
      });
    } catch (err) {
      console.error("Recent sales load error:", err);
    }
    setSalesLoading(false);
  }, []);

  useEffect(() => {
    if (showSales) loadRecentSales();
    else {
      if (salesLayerRef.current) salesLayerRef.current.clearLayers();
      setSalesData([]);
    }
  }, [showSales, loadRecentSales]);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !showSales) return;
    const handler = () => {
      clearTimeout(salesDebounceRef.current);
      salesDebounceRef.current = setTimeout(() => loadRecentSales(), 600);
    };
    map.on("moveend", handler);
    return () => { map.off("moveend", handler); clearTimeout(salesDebounceRef.current); };
  }, [showSales, loadRecentSales]);

  // ---- Violation Density (R3) ----
  const loadViolations = useCallback(async () => {
    const map = leafletMapRef.current;
    const L = (window as any).L;
    if (!map || !L) return;

    const zoom = map.getZoom();
    if (zoom < 16) {
      if (violationsLayerRef.current) violationsLayerRef.current.clearLayers();
      setViolationsData([]);
      return;
    }

    setViolationsLoading(true);
    try {
      const bounds = map.getBounds();
      const data = await fetchViolationsInBounds({
        south: bounds.getSouth(), west: bounds.getWest(),
        north: bounds.getNorth(), east: bounds.getEast(),
      });
      setViolationsData(data);

      if (!violationsLayerRef.current) {
        violationsLayerRef.current = L.layerGroup({ pane: "violations" }).addTo(map);
      }
      violationsLayerRef.current.clearLayers();

      data.forEach((v) => {
        const color = v.violationClass === "C" ? "#ef4444"
          : v.violationClass === "B" ? "#f97316"
          : v.source === "dob" ? "#eab308"
          : "#eab308";
        const radius = v.violationClass === "C" ? 6 : 4;

        const marker = L.circleMarker([v.lat, v.lng], {
          radius,
          fillColor: color,
          color: "rgba(0,0,0,0.15)",
          weight: 0.5,
          fillOpacity: 0.55,
          pane: "violations",
        });

        marker.bindTooltip(
          `<div style="font-family:system-ui;font-size:11px;line-height:1.4;max-width:200px;">
            <strong>${v.address}</strong><br/>
            <span style="color:${color};font-weight:700;">${v.source === "hpd" ? `HPD Class ${v.violationClass}` : "DOB"}</span> · ${v.status}<br/>
            <span style="font-size:10px;color:#64748b;">${v.description.slice(0, 60)}</span>
          </div>`,
          { direction: "top", className: "map-layer-tooltip" },
        );
        violationsLayerRef.current.addLayer(marker);
      });
    } catch (err) {
      console.error("Violations load error:", err);
    }
    setViolationsLoading(false);
  }, []);

  useEffect(() => {
    if (showViolations) loadViolations();
    else {
      if (violationsLayerRef.current) violationsLayerRef.current.clearLayers();
      setViolationsData([]);
    }
  }, [showViolations, loadViolations]);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !showViolations) return;
    const handler = () => {
      clearTimeout(violationsDebounceRef.current);
      violationsDebounceRef.current = setTimeout(() => loadViolations(), 700);
    };
    map.on("moveend", handler);
    return () => { map.off("moveend", handler); clearTimeout(violationsDebounceRef.current); };
  }, [showViolations, loadViolations]);

  // ---- 311 Complaints (R4) ----
  const COMPLAINT_311_COLORS: Record<string, string> = {
    noise: "#8b5cf6",
    building: "#f97316",
    pest: "#84cc16",
    sanitary: "#06b6d4",
    other: "#94a3b8",
  };

  const load311Complaints = useCallback(async () => {
    const map = leafletMapRef.current;
    const L = (window as any).L;
    if (!map || !L) return;

    const zoom = map.getZoom();
    if (zoom < 16) {
      if (complaints311LayerRef.current) complaints311LayerRef.current.clearLayers();
      setComplaints311Data([]);
      return;
    }

    setComplaints311Loading(true);
    try {
      const bounds = map.getBounds();
      const data = await fetch311InBounds({
        south: bounds.getSouth(), west: bounds.getWest(),
        north: bounds.getNorth(), east: bounds.getEast(),
      });
      setComplaints311Data(data);

      if (!complaints311LayerRef.current) {
        complaints311LayerRef.current = L.layerGroup({ pane: "violations" }).addTo(map);
      }
      complaints311LayerRef.current.clearLayers();

      data.forEach((c) => {
        const color = COMPLAINT_311_COLORS[c.category] || "#94a3b8";
        const marker = L.circleMarker([c.lat, c.lng], {
          radius: 3.5,
          fillColor: color,
          color: "rgba(0,0,0,0.1)",
          weight: 0.5,
          fillOpacity: 0.45,
          pane: "violations",
        });

        marker.bindTooltip(
          `<div style="font-family:system-ui;font-size:11px;line-height:1.4;max-width:200px;">
            <strong>${c.complaintType}</strong><br/>
            ${c.descriptor ? `<span style="font-size:10px;color:#64748b;">${c.descriptor.slice(0, 60)}</span><br/>` : ""}
            ${c.address || ""}<br/>
            <span style="font-size:10px;">${c.status} · ${c.createdDate ? new Date(c.createdDate).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : ""}</span>
          </div>`,
          { direction: "top", className: "map-layer-tooltip" },
        );
        complaints311LayerRef.current.addLayer(marker);
      });
    } catch (err) {
      console.error("311 complaints load error:", err);
    }
    setComplaints311Loading(false);
  }, []);

  useEffect(() => {
    if (show311) load311Complaints();
    else {
      if (complaints311LayerRef.current) complaints311LayerRef.current.clearLayers();
      setComplaints311Data([]);
    }
  }, [show311, load311Complaints]);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !show311) return;
    const handler = () => {
      clearTimeout(complaints311DebounceRef.current);
      complaints311DebounceRef.current = setTimeout(() => load311Complaints(), 700);
    };
    map.on("moveend", handler);
    return () => { map.off("moveend", handler); clearTimeout(complaints311DebounceRef.current); };
  }, [show311, load311Complaints]);

  // ---- Building Labels (R5) — owner name + units on footprints at z17+ ----
  const loadBuildingLabels = useCallback(async () => {
    const map = leafletMapRef.current;
    const L = (window as any).L;
    if (!map || !L) return;

    const zoom = map.getZoom();
    if (zoom < 17) {
      if (bldgLabelsLayerRef.current) bldgLabelsLayerRef.current.clearLayers();
      return;
    }

    if (!bldgLabelsLayerRef.current) {
      bldgLabelsLayerRef.current = L.layerGroup({ pane: "buildingLabels" }).addTo(map);
    }
    bldgLabelsLayerRef.current.clearLayers();

    // Use already-loaded properties as the label source
    properties.forEach((p) => {
      if (!p.lat || !p.lng || !p.ownerName) return;
      const shortOwner = p.ownerName.length > 20 ? p.ownerName.slice(0, 18) + "…" : p.ownerName;
      const icon = L.divIcon({
        className: "",
        html: `<div style="font-family:system-ui;font-size:9px;line-height:1.2;color:#334155;text-align:center;pointer-events:none;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;">
          <div style="font-weight:700;font-size:8px;letter-spacing:0.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px;">${shortOwner}</div>
          <div style="font-size:8px;color:#64748b;">${p.unitsRes}u · ${p.yearBuilt || "—"}</div>
        </div>`,
        iconSize: [120, 24],
        iconAnchor: [60, 12],
      });
      const marker = L.marker([p.lat, p.lng], { icon, interactive: false, pane: "buildingLabels" });
      bldgLabelsLayerRef.current.addLayer(marker);
    });
  }, [properties]);

  useEffect(() => {
    if (showBldgLabels) loadBuildingLabels();
    else {
      if (bldgLabelsLayerRef.current) bldgLabelsLayerRef.current.clearLayers();
    }
  }, [showBldgLabels, loadBuildingLabels]);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !showBldgLabels) return;
    const handler = () => setTimeout(() => loadBuildingLabels(), 300);
    map.on("moveend", handler);
    return () => { map.off("moveend", handler); };
  }, [showBldgLabels, loadBuildingLabels]);

  // ── Draw mode interaction: click to add vertices, dblclick to close polygon ──
  useEffect(() => {
    const map = leafletMapRef.current;
    const L = (window as any).L;
    if (!map || !L) return;

    if (!isDrawMode) {
      // Restore default cursor when exiting draw mode
      (map.getContainer() as HTMLElement).style.cursor = "";
      return;
    }

    // Set crosshair cursor
    (map.getContainer() as HTMLElement).style.cursor = "crosshair";

    // Disable double-click zoom while drawing
    map.doubleClickZoom.disable();

    // Make overlay panes non-interactive so clicks reach the map
    const overlayPanes = ["overlayPane", "overlayBase", "searchResults", "construction", "sales", "violations", "violationBadges", "buildingLabels"];
    const savedPointerEvents: [HTMLElement, string][] = [];
    for (const name of overlayPanes) {
      const pane = map.getPane(name);
      if (pane) {
        savedPointerEvents.push([pane, pane.style.pointerEvents]);
        pane.style.pointerEvents = "none";
      }
    }

    const onClick = (e: any) => {
      const { lat, lng } = e.latlng;
      drawVerticesRef.current.push([lat, lng]);

      // Render vertex marker
      const vertexMarker = L.circleMarker([lat, lng], {
        radius: 5, fillColor: "#2563eb", color: "#fff", weight: 2, opacity: 1, fillOpacity: 1,
        pane: "searchResults",
      });
      vertexMarker.addTo(map);
      drawMarkersRef.current.push(vertexMarker);

      // Update polyline preview
      if (drawPreviewRef.current) {
        map.removeLayer(drawPreviewRef.current);
      }
      if (drawVerticesRef.current.length >= 2) {
        drawPreviewRef.current = L.polyline(drawVerticesRef.current, {
          color: "#2563eb", weight: 2, dashArray: "6,4", opacity: 0.8,
          pane: "searchResults",
        }).addTo(map);
      }
    };

    const onDblClick = () => {
      // Deduplicate consecutive vertices — Leaflet fires two click events before
      // dblclick, adding duplicate vertices at the double-click location.
      // Without dedup, the polygon can have degenerate zero-length edges.
      const rawVerts = drawVerticesRef.current;
      const DEDUP_THRESHOLD = 0.00001; // ~1m — collapse near-identical vertices
      const verts: [number, number][] = [];
      for (const v of rawVerts) {
        const prev = verts[verts.length - 1];
        if (!prev || Math.abs(v[0] - prev[0]) > DEDUP_THRESHOLD || Math.abs(v[1] - prev[1]) > DEDUP_THRESHOLD) {
          verts.push(v);
        }
      }
      if (verts.length < 3) return; // Need at least 3 unique vertices for a polygon

      // Clean up preview layers
      if (drawPreviewRef.current) {
        map.removeLayer(drawPreviewRef.current);
        drawPreviewRef.current = null;
      }
      drawMarkersRef.current.forEach(m => map.removeLayer(m));
      drawMarkersRef.current = [];

      // Remove previous drawn polygon layer
      if (drawnPolygonLayerRef.current) {
        map.removeLayer(drawnPolygonLayerRef.current);
      }

      // Render final polygon
      drawnPolygonLayerRef.current = L.polygon(verts, {
        color: "#2563eb", weight: 2, dashArray: "6,4",
        fillColor: "#3b82f6", fillOpacity: 0.1,
        pane: "searchResults",
      }).addTo(map);

      // Set drawn polygon state (triggers search) and exit draw mode
      const closedPolygon = [...verts] as [number, number][];
      setDrawnPolygon(closedPolygon);
      setIsDrawMode(false);
      drawVerticesRef.current = [];
    };

    map.on("click", onClick);
    map.on("dblclick", onDblClick);

    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDblClick);
      map.doubleClickZoom.enable();
      (map.getContainer() as HTMLElement).style.cursor = "";
      // Restore pointer events on overlay panes
      for (const [pane, original] of savedPointerEvents) {
        pane.style.pointerEvents = original;
      }
    };
  }, [isDrawMode, leafletLoaded]);

  // Clean up drawn polygon layer when drawnPolygon state is cleared
  useEffect(() => {
    if (!drawnPolygon && drawnPolygonLayerRef.current && leafletMapRef.current) {
      leafletMapRef.current.removeLayer(drawnPolygonLayerRef.current);
      drawnPolygonLayerRef.current = null;
    }
  }, [drawnPolygon]);

  const updateMarkers = (props: MapProperty[], polygonFilter?: [number, number][] | null) => {
    const L = (window as any).L;
    const map = leafletMapRef.current;
    if (!markersRef.current || !L || !map) return;

    // Bug 1 fix: close any open tooltips before clearing layers to prevent stale DOM remnants
    markersRef.current.eachLayer((l: any) => { l.closeTooltip?.(); l.unbindTooltip?.(); });
    markersRef.current.clearLayers();
    markersByBblRef.current.clear();
    if (clusterLayerRef.current) {
      clusterLayerRef.current.eachLayer((l: any) => { l.closeTooltip?.(); l.unbindTooltip?.(); });
      clusterLayerRef.current.clearLayers();
    }

    // Bug 3 fix: client-side polygon filter — only render buildings inside drawn polygon
    const filtered = polygonFilter && polygonFilter.length >= 3
      ? props.filter(p => pointInPolygon([p.lat, p.lng], polygonFilter))
      : props;

    const zoom = map.getZoom();

    // Grid-based clustering at zoom < 15
    if (zoom < 15 && filtered.length > 0) {
      if (!clusterLayerRef.current) {
        clusterLayerRef.current = L.layerGroup({ pane: "searchResults" }).addTo(map);
      }

      const CELL_PX = 60;
      const cells = new Map<string, { props: MapProperty[]; sumLat: number; sumLng: number; totalUnits: number }>();

      filtered.forEach((p) => {
        const pt = map.latLngToContainerPoint([p.lat, p.lng]);
        const cellKey = `${Math.floor(pt.x / CELL_PX)}_${Math.floor(pt.y / CELL_PX)}`;
        const cell = cells.get(cellKey);
        if (cell) {
          cell.props.push(p);
          cell.sumLat += p.lat;
          cell.sumLng += p.lng;
          cell.totalUnits += p.unitsRes;
        } else {
          cells.set(cellKey, { props: [p], sumLat: p.lat, sumLng: p.lng, totalUnits: p.unitsRes });
        }
      });

      cells.forEach((cell) => {
        const count = cell.props.length;
        const avgLat = cell.sumLat / count;
        const avgLng = cell.sumLng / count;

        if (count === 1) {
          // Single property — render as normal marker
          const p = cell.props[0];
          const radius = p.unitsRes >= 50 ? 10 : p.unitsRes >= 20 ? 8 : p.unitsRes >= 10 ? 6 : 4;
          const color = p.unitsRes >= 50 ? "#7c3aed" : p.unitsRes >= 20 ? "#2563eb" : p.unitsRes >= 10 ? "#0891b2" : "#64748b";
          const marker = L.circleMarker([p.lat, p.lng], {
            radius, fillColor: color, color: "#fff", weight: 2, opacity: 1, fillOpacity: 0.85,
          });
          marker.bindTooltip(
            `<div style="font-family:system-ui;font-size:11px;font-weight:500;padding:1px 2px;">${p.address}</div>`,
            { direction: "top", offset: [0, -radius], className: "map-dark-tooltip", permanent: false, sticky: false },
          );
          marker.on("mouseover", () => marker.openTooltip());
          marker.on("mouseout", () => marker.closeTooltip());
          marker.on("click", () => {
            setSelectedProperty(p);
            setActiveMarkerProperty(p);
            setPinnedResult(p);
            setPinnedLabel("marker");
            setActiveResultKey(`${p.boroCode}-${p.block}-${p.lot}`);
            setPanelOpen(true);
          });
          clusterLayerRef.current.addLayer(marker);
        } else {
          // Cluster bubble — gradient L.divIcon
          const size = count >= 50 ? 52 : count >= 10 ? 40 : 30;
          const fontSize = count >= 50 ? 15 : count >= 10 ? 13 : 11;
          const glowSize = size + 10;

          // Color tiers: blue → indigo → violet
          let gradFrom: string, gradTo: string, border: string, glow: string;
          if (count >= 50) {
            gradFrom = "#A78BFA"; gradTo = "#7C3AED"; border = "#6D28D9"; glow = "rgba(124,58,237,0.35)";
          } else if (count >= 10) {
            gradFrom = "#818CF8"; gradTo = "#6366F1"; border = "#4F46E5"; glow = "rgba(99,102,241,0.3)";
          } else {
            gradFrom = "#60A5FA"; gradTo = "#3B82F6"; border = "#2563EB"; glow = "rgba(59,130,246,0.3)";
          }

          const bubbleHtml = `<div style="position:relative;width:${glowSize}px;height:${glowSize}px;display:flex;align-items:center;justify-content:center;cursor:pointer;" onmouseover="this.firstElementChild.style.transform='scale(1.12)'" onmouseout="this.firstElementChild.style.transform='scale(1)'"><div style="width:${size}px;height:${size}px;border-radius:50%;background:radial-gradient(circle at 35% 35%,${gradFrom},${gradTo});border:2.5px solid ${border};box-shadow:0 0 0 3px ${glow},0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;transition:transform 0.15s ease;"><span style="font-family:system-ui;font-size:${fontSize}px;font-weight:800;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.4);line-height:1;">${count}</span></div></div>`;

          const icon = L.divIcon({
            className: "",
            html: bubbleHtml,
            iconSize: [glowSize, glowSize],
            iconAnchor: [glowSize / 2, glowSize / 2],
          });

          const marker = L.marker([avgLat, avgLng], { icon, pane: "searchResults" });

          marker.bindTooltip(
            `<div style="font-family:system-ui;font-size:12px;line-height:1.4;"><strong>${count} buildings</strong> · Click to zoom in<br/>${cell.totalUnits.toLocaleString()} total units</div>`,
            { direction: "top", offset: [0, -(glowSize / 2)] },
          );

          marker.on("click", () => {
            map.flyTo([avgLat, avgLng], Math.min(zoom + 2, 17), { duration: 0.4 });
          });

          clusterLayerRef.current.addLayer(marker);
        }
      });
      return;
    }

    // Zoom >= 15 — individual markers
    if (clusterLayerRef.current) clusterLayerRef.current.clearLayers();

    filtered.forEach((p) => {
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

      const bbl = `${p.boroCode}-${p.block}-${p.lot}`;
      markersByBblRef.current.set(bbl, marker);

      marker.on("click", () => {
        setSelectedProperty(p);
        setActiveMarkerProperty(p);
        setPinnedResult(p);
        setPinnedLabel("marker");
        setActiveResultKey(bbl);
        setPanelOpen(true);
        // Scroll panel to show pinned item
        setTimeout(() => panelListRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 100);
      });
      marker.on("dblclick", (e: any) => {
        const LL = (window as any).L;
        if (LL) LL.DomEvent.stopPropagation(e);
        onBuildingSelect?.(p);
      });
      marker.on("mouseover", () => { setHoveredBbl(bbl); marker.openTooltip(); });
      marker.on("mouseout", () => { setHoveredBbl(null); marker.closeTooltip(); });

      marker.bindTooltip(
        `<div style="font-family:system-ui;font-size:11px;font-weight:500;padding:1px 2px;">${p.address}</div>`,
        { direction: "top", offset: [0, -radius], className: "map-dark-tooltip", permanent: false, sticky: false }
      );

      markersRef.current.addLayer(marker);
    });
  };

  // Bug 2: Match by BBL (boro+block+lot) for deduplication, not just address text
  const bblKey = (p: MapProperty) => `${p.boroCode}-${p.block}-${p.lot}`;
  const isSearchedMatch = (p: MapProperty) =>
    searchedProperty != null && bblKey(p) === bblKey(searchedProperty);

  // Bi-directional hover: highlight marker when list item hovered (and vice versa)
  useEffect(() => {
    // Reset previous
    if (prevHighlightRef.current) {
      const prev = markersByBblRef.current.get(prevHighlightRef.current);
      if (prev) {
        prev.setStyle({ weight: 2, color: "#fff", fillOpacity: 0.85 });
        // Restore original radius
        const origRadius = prev._originalRadius;
        if (origRadius) prev.setRadius(origRadius);
      }
    }
    // Highlight current
    if (hoveredBbl) {
      const curr = markersByBblRef.current.get(hoveredBbl);
      if (curr) {
        // Save original radius if not saved
        if (!curr._originalRadius) curr._originalRadius = curr.getRadius();
        curr.setRadius(curr._originalRadius + 3);
        curr.setStyle({ weight: 3, color: "#2563eb", fillOpacity: 1 });
        curr.bringToFront();
      }
    }
    prevHighlightRef.current = hoveredBbl;
  }, [hoveredBbl]);

  // Hover prefetch — warm cache after 300ms hover on a marker/list item
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(prefetchTimerRef.current);
    if (!hoveredBbl) return;
    prefetchTimerRef.current = setTimeout(() => {
      // Build 10-digit BBL from "boroCode-block-lot" key
      const parts = hoveredBbl.split("-");
      if (parts.length === 3) {
        const bbl10 = parts[0] + parts[1].padStart(5, "0") + parts[2].padStart(4, "0");
        prefetchBuilding(bbl10).catch(() => {});
      }
    }, 300);
    return () => clearTimeout(prefetchTimerRef.current);
  }, [hoveredBbl]);

  // Scroll list to selected property when marker is clicked
  useEffect(() => {
    if (selectedProperty) {
      const el = document.getElementById(`prop-${bblKey(selectedProperty)}`);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedProperty]);

  // primaryPhone reset removed — ProfileModal handled by parent

  // Zip-based filtering removed — NTA geofence filter handles neighborhood spatial queries server-side

  // Distance from map center (for distance sorting)
  const getMapCenter = () => {
    const map = leafletMapRef.current;
    if (!map) return { lat: 40.7128, lng: -73.956 };
    const c = map.getCenter();
    return { lat: c.lat, lng: c.lng };
  };

  const distFromCenter = (p: MapProperty) => {
    const c = getMapCenter();
    const dlat = p.lat - c.lat;
    const dlng = p.lng - c.lng;
    return dlat * dlat + dlng * dlng; // squared distance is fine for sorting
  };

  // Client-side polygon filter for panel list — useMemo ensures stable reference
  const polygonFilteredProperties = useMemo(() => {
    if (drawnPolygon && drawnPolygon.length >= 3) {
      return properties.filter(p => pointInPolygon([p.lat, p.lng], drawnPolygon));
    }
    return properties;
  }, [properties, drawnPolygon]);

  // Bug 2+3: Merge searched property at top, deduplicate from bounds results, filters don't apply to it
  const filteredBoundsResults = [...polygonFilteredProperties]
    .filter(p => !isSearchedMatch(p)) // deduplicate: remove searched property from bounds results
    .sort((a, b) => {
      switch (sortBy) {
        case "value": return b.assessTotal - a.assessTotal;
        case "year": return b.yearBuilt - a.yearBuilt;
        case "floors": return b.numFloors - a.numFloors;
        case "distance": return distFromCenter(a) - distFromCenter(b);
        case "violations": {
          const keyA = `${a.boroCode}-${a.block}-${a.lot}`;
          const keyB = `${b.boroCode}-${b.block}-${b.lot}`;
          const diff = (enrichmentCounts.violations?.[keyB] ?? 0) - (enrichmentCounts.violations?.[keyA] ?? 0);
          return diff !== 0 ? diff : b.unitsRes - a.unitsRes;
        }
        case "311": {
          const cA = enrichmentCounts.complaints311?.[a.address.toUpperCase().trim()] ?? 0;
          const cB = enrichmentCounts.complaints311?.[b.address.toUpperCase().trim()] ?? 0;
          const diff = cB - cA;
          return diff !== 0 ? diff : b.unitsRes - a.unitsRes;
        }
        case "distress": {
          const keyA = `${a.boroCode}-${a.block}-${a.lot}`;
          const keyB = `${b.boroCode}-${b.block}-${b.lot}`;
          const vA = (enrichmentCounts.violations?.[keyA] ?? 0) * 2 + (enrichmentCounts.complaints311?.[a.address.toUpperCase().trim()] ?? 0);
          const vB = (enrichmentCounts.violations?.[keyB] ?? 0) * 2 + (enrichmentCounts.complaints311?.[b.address.toUpperCase().trim()] ?? 0);
          const diff = vB - vA;
          return diff !== 0 ? diff : b.unitsRes - a.unitsRes;
        }
        case "recentSale": {
          const keyA = `${a.boroCode}-${a.block}-${a.lot}`;
          const keyB = `${b.boroCode}-${b.block}-${b.lot}`;
          const sA = enrichmentCounts.sales?.[keyA];
          const sB = enrichmentCounts.sales?.[keyB];
          const tA = sA ? new Date(sA.date).getTime() : 0;
          const tB = sB ? new Date(sB.date).getTime() : 0;
          const diff = tB - tA;
          return diff !== 0 ? diff : b.unitsRes - a.unitsRes;
        }
        default: return b.unitsRes - a.unitsRes;
      }
    });

  // Check if searched property would have been excluded by filters
  const searchedExcludedByFilters = searchedProperty != null &&
    !properties.some(p => bblKey(p) === bblKey(searchedProperty));

  const sortedProperties = searchedProperty
    ? [searchedProperty, ...filteredBoundsResults]
    : filteredBoundsResults;

  const handleFilterChange = (key: keyof Filters, value: string) => {
    const num = value === "" ? undefined : parseInt(value);
    setFilters(prev => ({ ...prev, [key]: num }));
  };

  const handleStringFilterChange = (key: keyof Filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value || undefined }));
  };

  const clearFilters = () => {
    setFilters({});
    setSelectedNeighborhoods([]);
    setNeighborhoodPolygons(new Map());
    setDrawnPolygon(null);
    setIsDrawMode(false);
  };

  const activeFilterCount = Object.values(filters).filter(v => v !== undefined).length;

  // viewProfile, mobileFiltersOpen, mobileDrawer, address search removed — handled by parent layout

  // ── Floating map search bar ────────────────────────────────
  // Debounced address search
  useEffect(() => {
    if (mapSearchDebounceRef.current) clearTimeout(mapSearchDebounceRef.current);
    if (mapSearchQuery.trim().length < 4) {
      setMapSearchResults([]);
      setMapSearchOpen(false);
      return;
    }
    setMapSearchLoading(true);
    mapSearchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchAddresses(mapSearchQuery.trim());
        setMapSearchResults(results);
        setMapSearchOpen(results.length > 0);
        setMapSearchFocusIdx(-1);

        // Populate side panel
        if (results.length > 0) {
          lastSearchQueryRef.current = mapSearchQuery.trim();
          setSearchPanelResults(results);
          // Pin first result if its address starts with the normalized query
          const q = mapSearchQuery.trim().toUpperCase();
          const first = results[0];
          const firstAddr = (first.address ?? "").toUpperCase();
          setPinnedResult(firstAddr.startsWith(q) || firstAddr === q ? first : null);
          setPinnedLabel("search");
          setPanelOpen(true);
          setActiveResultKey(null);
          setActiveMarkerProperty(null);
        }
      } catch {
        setMapSearchResults([]);
      } finally {
        setMapSearchLoading(false);
      }
    }, 400);
    return () => { if (mapSearchDebounceRef.current) clearTimeout(mapSearchDebounceRef.current); };
  }, [mapSearchQuery]);

  // Click-outside to close dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (mapSearchRef.current && !mapSearchRef.current.contains(e.target as Node)) {
        setMapSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Select a search result from dropdown: fly to it + open building profile
  const handleMapSearchSelect = useCallback(async (suggestion: AddressSuggestion) => {
    setMapSearchQuery("");
    setMapSearchOpen(false);

    const key = `${suggestion.boroCode}-${suggestion.block}-${suggestion.lot}`;
    setActiveResultKey(key);

    const fullAddress = `${suggestion.address}, ${suggestion.borough}, NY`;
    const coords = await geocodeAddress(fullAddress);
    if (!coords) return;

    const map = leafletMapRef.current;
    if (map) {
      map.flyTo([coords.lat, coords.lng], 17, { animate: true, duration: 0.8 });
    }

    const prop = await fetchPropertyAtLocation(coords.lat, coords.lng);
    if (prop) {
      setSelectedProperty(prop);
      onBuildingSelect?.(prop);
    }
  }, [onBuildingSelect]);

  // Select a result from the side panel — pin it and fly to it
  const handlePanelSelect = useCallback(async (item: AddressSuggestion | MapProperty) => {
    const key = `${item.boroCode}-${item.block}-${item.lot}`;
    setActiveResultKey(key);

    // If it's a MapProperty with coords, use them directly
    if ("lat" in item && item.lat && item.lng) {
      const map = leafletMapRef.current;
      if (map) map.flyTo([item.lat, item.lng], 17, { animate: true, duration: 0.8 });
      setSelectedProperty(item as MapProperty);
      setActiveMarkerProperty(item as MapProperty);
      setPinnedResult(item);
      setPinnedLabel("marker");
      return;
    }

    // AddressSuggestion — geocode and fly
    // On mobile, close panel on select so user sees the map
    if (window.innerWidth < 768) setPanelOpen(false);

    const fullAddress = `${item.address}, ${item.borough}, NY`;
    const coords = await geocodeAddress(fullAddress);
    if (!coords) return;

    const map = leafletMapRef.current;
    if (map) {
      map.flyTo([coords.lat, coords.lng], 17, { animate: true, duration: 0.8 });
    }

    const prop = await fetchPropertyAtLocation(coords.lat, coords.lng);
    if (prop) {
      setSelectedProperty(prop);
      setActiveMarkerProperty(prop);
      setPinnedResult(prop);
      setPinnedLabel("marker");
    }
  }, []);

  // Open full profile for pinned building
  const handleOpenProfile = useCallback((item: AddressSuggestion | MapProperty) => {
    if (!onBuildingSelect) {
      console.warn("[MapSearch] onBuildingSelect prop is undefined — cannot open profile for", item.address);
      return;
    }
    // Close side panel so profile panel is visible
    setPanelOpen(false);

    if ("lat" in item && item.lat !== undefined && item.lat !== null) {
      onBuildingSelect(item as MapProperty);
    } else {
      // Convert AddressSuggestion to MapProperty-like and open
      (async () => {
        const fullAddress = `${item.address}, ${item.borough}, NY`;
        const coords = await geocodeAddress(fullAddress);
        if (!coords) {
          console.warn("[MapSearch] geocodeAddress returned null for:", fullAddress);
          return;
        }
        const prop = await fetchPropertyAtLocation(coords.lat, coords.lng);
        if (!prop) {
          console.warn("[MapSearch] fetchPropertyAtLocation returned null at:", coords.lat, coords.lng);
          return;
        }
        onBuildingSelect(prop);
      })();
    }
  }, [onBuildingSelect]);

  // Mobile drawer removed — handled by parent layout

  // ── Panel computed values ─────────────────────────────────────
  const hasSearchResults = searchPanelResults.length > 0;
  const panelBaseItems: (AddressSuggestion | MapProperty)[] = hasSearchResults ? searchPanelResults : polygonFilteredProperties;

  // Filter
  const panelFilteredItems = panelFilter
    ? panelBaseItems.filter(p => p.address.toLowerCase().includes(panelFilter.toLowerCase()))
    : panelBaseItems;

  // Exclude pinned from list (it's shown separately at top)
  const pinnedKey = pinnedResult ? `${pinnedResult.boroCode}-${pinnedResult.block}-${pinnedResult.lot}` : null;
  const panelItemsExcludingPinned = pinnedKey
    ? panelFilteredItems.filter(p => `${p.boroCode}-${p.block}-${p.lot}` !== pinnedKey)
    : panelFilteredItems;

  // Sort
  const panelSortedItems = [...panelItemsExcludingPinned].sort((a, b) => {
    let diff = 0;
    switch (panelSortKey) {
      case "units": diff = a.unitsRes - b.unitsRes; break;
      case "assessed": diff = a.assessTotal - b.assessTotal; break;
      case "year": diff = a.yearBuilt - b.yearBuilt; break;
    }
    return panelSortDesc ? -diff : diff;
  });

  const panelItemCount = hasSearchResults ? searchPanelResults.length : polygonFilteredProperties.length;

  return (
    <div className="w-full h-full relative overflow-hidden">
      <div className="w-full h-full relative overflow-hidden">

        <div ref={mapRef} className="w-full h-full" />

        {/* Map layer overlays (static GeoJSON + viewport layers) */}
        {leafletMapRef.current && (
          <MapLayersRenderer
            map={leafletMapRef.current}
            visibility={layerVisibility}
            selectedNeighborhoods={selectedNeighborhoods}
            isDrawMode={isDrawMode}
            isNeighborhoodSelectMode={isNeighborhoodSelectMode}
            onNeighborhoodSelect={(name, bounds, polygon) => {
              toggleNeighborhood(name, bounds ?? undefined, polygon ?? undefined);
              if (name && !layerVisibility["neighborhoods"]) {
                handleLayerToggle("neighborhoods", true);
              }
              // Auto-deactivate neighborhood select mode after selection
              setIsNeighborhoodSelectMode(false);
            }}
          />
        )}

        {/* Layer control panel — hidden when results panel is open */}
        {!panelOpen && (
          <LayerControl
            visibility={layerVisibility}
            onToggle={handleLayerToggle}
            activeBasemap={activeBasemap}
            onBasemapChange={handleBasemapChange}
          />
        )}

        {/* Floating address search bar */}
        <div
          ref={mapSearchRef}
          className="absolute top-3 left-3 right-16 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-full md:max-w-sm md:px-0 z-[1000]"
        >
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 flex items-center gap-2 px-3 py-2">
            <Search size={15} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={mapSearchQuery}
              onChange={(e) => setMapSearchQuery(e.target.value)}
              onFocus={() => { if (mapSearchResults.length > 0) setMapSearchOpen(true); }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setMapSearchOpen(false);
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMapSearchFocusIdx((prev) => Math.min(prev + 1, mapSearchResults.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMapSearchFocusIdx((prev) => Math.max(prev - 1, 0));
                } else if (e.key === "Enter" && mapSearchFocusIdx >= 0 && mapSearchResults[mapSearchFocusIdx]) {
                  e.preventDefault();
                  handleMapSearchSelect(mapSearchResults[mapSearchFocusIdx]);
                }
              }}
              placeholder="Search address..."
              className="flex-1 text-sm outline-none placeholder:text-gray-400 bg-transparent"
            />
            {mapSearchLoading && (
              <SearchSpinner size={14} className="text-gray-400 animate-spin shrink-0" />
            )}
            {!mapSearchLoading && mapSearchQuery && (
              <button
                onClick={() => {
                  setMapSearchQuery(""); setMapSearchResults([]); setMapSearchOpen(false);
                  setSearchPanelResults([]); setPinnedResult(null); setPinnedLabel(null); setActiveResultKey(null); setActiveMarkerProperty(null); setPanelFilter("");
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Search results dropdown */}
          {mapSearchOpen && mapSearchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-100 max-h-60 overflow-y-auto z-[1001]">
              {mapSearchResults.map((s, i) => (
                <button
                  key={`${s.boroCode}-${s.block}-${s.lot}`}
                  onClick={() => handleMapSearchSelect(s)}
                  className={`w-full text-left px-3 py-2.5 cursor-pointer transition-colors ${
                    i === mapSearchFocusIdx ? "bg-blue-50" : "hover:bg-gray-50"
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900">{s.address}</p>
                  <p className="text-xs text-gray-500">
                    {s.borough} · {s.unitsRes} unit{s.unitsRes !== 1 ? "s" : ""}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Save success toast */}
        {saveSuccess && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1001] bg-emerald-600 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-lg">
            ✓ Saved {saveSuccess} to list
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div className="absolute top-16 md:top-3 left-3 bg-white rounded-lg shadow-lg px-3 py-2 flex items-center gap-2 z-[1000]">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
            <span className="text-xs text-slate-600">Loading properties...</span>
          </div>
        )}

        {/* Clear polygon button — visible when a drawn polygon is active */}
        {drawnPolygon && drawnPolygon.length >= 3 && (
          <button
            onClick={() => {
              setDrawnPolygon(null);
              if (drawnPolygonLayerRef.current && leafletMapRef.current) {
                leafletMapRef.current.removeLayer(drawnPolygonLayerRef.current);
                drawnPolygonLayerRef.current = null;
              }
            }}
            className="absolute top-48 right-3 z-[1000] bg-white rounded-lg shadow-lg border border-gray-200 px-3 py-2 flex items-center gap-1.5 hover:bg-red-50 transition-colors text-xs font-medium text-gray-700"
          >
            <X size={12} className="text-red-500" />
            Clear polygon
          </button>
        )}

        {/* Legend — pushed up on mobile to sit above the drawer */}
        <div className="absolute bottom-20 md:bottom-3 left-3 bg-white/90 backdrop-blur-sm rounded-lg shadow px-2.5 py-1.5 z-[1000]">
          <div className="flex items-center gap-2.5 text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>1-9</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-600"></span>10-19</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>20-49</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-purple-600"></span>50+</span>
            {showNewDevs && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span>New Dev</span>}
            {showHotLeads && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span>Hot Lead</span>}
            {showConstruction && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-orange-500"></span>🏗</span>}
            {showSales && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span>$</span>}
          </div>
        </div>

        {/* Vitality legend — shown when heatmap is active */}
        {showVitality && (
          <div className="absolute bottom-32 md:bottom-12 left-3 bg-white/90 backdrop-blur-sm rounded-lg shadow px-2.5 py-2 z-[1000]">
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Neighborhood Vitality</p>
            <div className="space-y-0.5 text-[10px] text-slate-600">
              <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ backgroundColor: "#059669", opacity: 0.7 }}></span>Strong Growth</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ backgroundColor: "#34D399", opacity: 0.6 }}></span>Growth</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ backgroundColor: "#94A3B8", opacity: 0.3 }}></span>Stable</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ backgroundColor: "#F87171", opacity: 0.6 }}></span>Declining</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ backgroundColor: "#DC2626", opacity: 0.7 }}></span>Distressed</div>
            </div>
          </div>
        )}

        {/* Side panel — always-on building list */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-full md:w-72 bg-white shadow-xl border-r border-gray-200 z-[999] flex flex-col overflow-hidden transition-transform duration-200 ease-in-out ${
            panelOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* Panel header */}
          <div className="shrink-0 border-b border-gray-100 bg-white">
            <div className="flex items-center justify-between px-3 py-2 min-w-0">
              <span className="text-sm font-semibold text-gray-800 truncate">
                {hasSearchResults ? `${panelItemCount} search results` : `${panelItemCount} buildings in view`}
              </span>
              <button
                onClick={() => setPanelOpen(false)}
                className="ml-2 shrink-0 p-1 rounded hover:bg-gray-100 transition-colors"
              >
                <X size={16} className="text-gray-500" />
              </button>
            </div>
            {/* Sort pills */}
            <div className="flex items-center gap-1.5 px-3 pb-1.5">
              {(["units", "assessed", "year"] as const).map((key) => {
                const labels = { units: "Units", assessed: "Value", year: "Year" };
                const isActive = panelSortKey === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      if (isActive) setPanelSortDesc(!panelSortDesc);
                      else { setPanelSortKey(key); setPanelSortDesc(true); }
                    }}
                    className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                      isActive ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {labels[key]}{isActive ? (panelSortDesc ? " ▾" : " ▴") : ""}
                  </button>
                );
              })}
            </div>
            {/* Filter input */}
            <div className="relative mx-3 mb-2">
              <input
                placeholder="Filter by address..."
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md outline-none focus:border-blue-300 pr-6"
                value={panelFilter}
                onChange={e => setPanelFilter(e.target.value)}
              />
              {panelFilter && (
                <button
                  onClick={() => setPanelFilter("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Pinned result */}
          {pinnedResult && (
            <div
              className={`relative z-10 pointer-events-auto text-left px-3 py-2.5 bg-blue-50 border-b-2 border-blue-200 shrink-0 ${
                activeResultKey === `${pinnedResult.boroCode}-${pinnedResult.block}-${pinnedResult.lot}` ? "ring-1 ring-inset ring-blue-400" : ""
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <MapPin size={14} className="text-blue-500 shrink-0" />
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wide">
                  {pinnedLabel === "search" ? "Searched Address" : "Selected Building"}
                </span>
              </div>
              <p className="text-sm font-semibold text-gray-900">{pinnedResult.address}</p>
              <p className="text-xs text-gray-500">
                {pinnedResult.borough} · {pinnedResult.unitsRes} unit{pinnedResult.unitsRes !== 1 ? "s" : ""}
                {pinnedResult.numFloors > 0 ? ` · ${pinnedResult.numFloors} fl` : ""}
                {pinnedResult.yearBuilt > 0 ? ` · ${pinnedResult.yearBuilt}` : ""}
              </p>
              {pinnedResult.assessTotal > 0 && (
                <p className="text-xs text-gray-400">{fmtPrice(pinnedResult.assessTotal)} assessed</p>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleOpenProfile(pinnedResult); }}
                className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                <ExternalLink size={11} />Open Full Profile
              </button>
            </div>
          )}

          {/* Result list */}
          <div ref={panelListRef} className="flex-1 overflow-y-auto">
            {panelSortedItems.map((s) => {
              const key = `${s.boroCode}-${s.block}-${s.lot}`;
              const isActive = activeResultKey === key;
              return (
                <button
                  key={key}
                  id={`panel-${key}`}
                  onClick={() => handlePanelSelect(s)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-100 cursor-pointer transition-colors border-l-2 ${
                    isActive ? "bg-blue-50 border-l-blue-400" : "border-l-transparent hover:bg-gray-50"
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900">{s.address}</p>
                  <p className="text-xs text-gray-500">
                    {s.borough} · {s.unitsRes} unit{s.unitsRes !== 1 ? "s" : ""}
                    {s.numFloors > 0 ? ` · ${s.numFloors} fl` : ""}
                    {s.yearBuilt > 0 ? ` · ${s.yearBuilt}` : ""}
                  </p>
                  {s.assessTotal > 0 && (
                    <p className="text-xs text-gray-400">{fmtPrice(s.assessTotal)} assessed</p>
                  )}
                </button>
              );
            })}
            {panelSortedItems.length === 0 && panelFilter && (
              <p className="text-xs text-gray-400 text-center py-4">No matches for &ldquo;{panelFilter}&rdquo;</p>
            )}
          </div>
        </div>

        {/* Panel toggle pill — always visible when panel is closed */}
        {!panelOpen && (
          <button
            onClick={() => setPanelOpen(true)}
            className="absolute left-0 top-[40%] z-[1000] bg-white shadow-md border border-gray-200 rounded-r-lg px-2 py-3 flex flex-col items-center gap-1 hover:bg-gray-50 transition-colors"
          >
            <ChevronRight size={14} className="text-gray-600" />
            <span className="text-[10px] text-gray-500 [writing-mode:vertical-lr]">
              {hasSearchResults ? "Results" : "View List"}
            </span>
          </button>
        )}

        {/* Property count — bottom-left above legend */}
        <div className="absolute bottom-28 md:bottom-10 left-3 bg-white/90 backdrop-blur-sm text-xs text-gray-600 px-2.5 py-1 rounded-full shadow-sm border border-gray-200 z-[1000]">
          {sortedProperties.length} properties · {filteredBoundsResults.length} in view
          {total >= 2000 && (
            <span className="text-amber-600 ml-1" title="Zoom in or filter to see all">· 2K cap</span>
          )}
        </div>
      </div>

      {/* Mobile filters moved to parent layout */}

      {/* Building profile now rendered by parent layout */}
    </div>
  );
}