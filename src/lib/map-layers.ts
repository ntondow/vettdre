// Map layer configuration — NO "use server" so client components can import

import type { Feature } from "./feature-gate";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type LayerSource =
  | { type: "static-geojson"; url: string }
  | { type: "server-action" }
  | { type: "viewport-api"; endpoint: string; minZoom: number; maxFeatures: number }
  | { type: "arcgis-raster"; url: string; layers: number[] }
  | { type: "viewport-pluto"; minZoom: number; maxFeatures: number };

export type LayerGroup = "base" | "intelligence" | "transit" | "regulatory" | "boundaries" | "street-intel";

export interface LegendItem {
  label: string;
  color: string;
  type: "fill" | "line" | "circle";
}

export interface MapLayerConfig {
  id: string;
  label: string;
  group: LayerGroup;
  source: LayerSource;
  /** Leaflet pane z-index (higher = on top) */
  paneZ: number;
  /** Minimum zoom to render (inclusive). Layers hidden below this. */
  minZoom: number;
  /** Maximum zoom to render (inclusive, 19 = always visible above minZoom) */
  maxZoom: number;
  /** Feature gate — layer hidden if user doesn't have this permission */
  featureGate?: Feature;
  /** Default on/off state */
  defaultVisible: boolean;
  /** Icon shown in layer control panel */
  icon: string;
  /** Legend items for this layer */
  legend: LegendItem[];
  /** Opacity range 0-1 */
  opacity: number;
}

/* ------------------------------------------------------------------ */
/*  Tile sources for base map switcher                                */
/* ------------------------------------------------------------------ */

export interface BasemapOption {
  id: string;
  label: string;
  url: string;
  attribution: string;
  maxZoom: number;
}

export const BASEMAPS: BasemapOption[] = [
  {
    id: "street",
    label: "Street",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19,
  },
  {
    id: "satellite",
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
    maxZoom: 19,
  },
  {
    id: "dark",
    label: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19,
  },
];

/* ------------------------------------------------------------------ */
/*  Custom pane z-indices                                             */
/* ------------------------------------------------------------------ */

export const MAP_PANES = {
  overlayBase: 300,    // neighborhoods, zoning, flood, opp-zones
  violations: 340,     // violation density heatmap (below footprints)
  buildings: 350,      // building footprints, land use
  violationBadges: 360, // per-building violation count badges
  buildingLabels: 370, // owner name + units labels at z17+
  transit: 400,        // subway lines + stations
  construction: 420,   // construction activity markers
  sales: 430,          // recent sale price pills
  searchResults: 450,  // existing circleMarkers (above everything)
} as const;

/* ------------------------------------------------------------------ */
/*  Layer definitions                                                 */
/* ------------------------------------------------------------------ */

export const MAP_LAYERS: MapLayerConfig[] = [
  /* ----- Boundaries group ----- */
  {
    id: "neighborhoods",
    label: "Neighborhoods",
    group: "boundaries",
    source: { type: "server-action" },
    paneZ: MAP_PANES.overlayBase,
    minZoom: 11,
    maxZoom: 19,
    defaultVisible: false,
    icon: "MapPin",
    legend: [{ label: "NTA Boundary", color: "#6366F1", type: "line" }],
    opacity: 0.6,
  },

  /* ----- Regulatory group ----- */
  {
    id: "zoning",
    label: "Zoning Districts",
    group: "regulatory",
    source: { type: "static-geojson", url: "/data/zoning-districts.geojson" },
    paneZ: MAP_PANES.overlayBase + 10,
    minZoom: 13,
    maxZoom: 19,
    defaultVisible: false,
    icon: "Grid3X3",
    legend: [
      { label: "Residential (R)", color: "#fbbf24", type: "fill" },
      { label: "Commercial (C)", color: "#f87171", type: "fill" },
      { label: "Manufacturing (M)", color: "#a78bfa", type: "fill" },
    ],
    opacity: 0.25,
  },
  {
    id: "flood-zones",
    label: "FEMA Flood Zones",
    group: "regulatory",
    source: {
      type: "arcgis-raster",
      url: "https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer",
      layers: [28], // Flood Hazard Zones
    },
    paneZ: MAP_PANES.overlayBase + 5,
    minZoom: 12,
    maxZoom: 19,
    defaultVisible: false,
    icon: "Droplets",
    legend: [
      { label: "Zone AE (1%)", color: "#3b82f6", type: "fill" },
      { label: "Zone VE (Coastal)", color: "#1d4ed8", type: "fill" },
      { label: "Zone X (0.2%)", color: "#93c5fd", type: "fill" },
    ],
    opacity: 0.4,
  },
  {
    id: "opportunity-zones",
    label: "Opportunity Zones",
    group: "regulatory",
    source: { type: "static-geojson", url: "/data/opportunity-zones.geojson" },
    paneZ: MAP_PANES.overlayBase + 15,
    minZoom: 11,
    maxZoom: 19,
    featureGate: "bp_census_full",
    defaultVisible: false,
    icon: "TrendingUp",
    legend: [{ label: "Qualified OZ Tract", color: "#10b981", type: "fill" }],
    opacity: 0.3,
  },

  /* ----- Intelligence group ----- */
  {
    id: "building-footprints",
    label: "Building Footprints",
    group: "intelligence",
    source: {
      type: "viewport-api",
      endpoint: "https://data.cityofnewyork.us/resource/5zhs-2jue.geojson",
      minZoom: 16,
      maxFeatures: 2000,
    },
    paneZ: MAP_PANES.buildings,
    minZoom: 16,
    maxZoom: 19,
    defaultVisible: true,
    icon: "Building2",
    legend: [
      { label: "Building Outline", color: "#475569", type: "fill" },
    ],
    opacity: 0.6,
  },
  {
    id: "land-use",
    label: "Land Use",
    group: "intelligence",
    source: {
      type: "viewport-pluto",
      minZoom: 14,
      maxFeatures: 2000,
    },
    paneZ: MAP_PANES.buildings + 5,
    minZoom: 14,
    maxZoom: 19,
    defaultVisible: false,
    icon: "Palette",
    legend: [
      { label: "1-2 Family", color: "#fde68a", type: "fill" },
      { label: "Multi-Family (Walk-up)", color: "#fdba74", type: "fill" },
      { label: "Multi-Family (Elevator)", color: "#fb923c", type: "fill" },
      { label: "Mixed Res/Comm", color: "#f472b6", type: "fill" },
      { label: "Commercial/Office", color: "#f87171", type: "fill" },
      { label: "Industrial", color: "#a78bfa", type: "fill" },
      { label: "Public/Institution", color: "#60a5fa", type: "fill" },
      { label: "Open Space/Park", color: "#4ade80", type: "fill" },
      { label: "Parking", color: "#94a3b8", type: "fill" },
      { label: "Vacant", color: "#e2e8f0", type: "fill" },
    ],
    opacity: 0.5,
  },

  /* ----- Transit group ----- */
  {
    id: "subway-lines",
    label: "Subway Lines",
    group: "transit",
    source: { type: "static-geojson", url: "/data/subway-lines.geojson" },
    paneZ: MAP_PANES.transit,
    minZoom: 11,
    maxZoom: 19,
    defaultVisible: false,
    icon: "TrainFront",
    legend: [
      { label: "1/2/3", color: "#EE352E", type: "line" },
      { label: "4/5/6", color: "#00933C", type: "line" },
      { label: "A/C/E", color: "#0039A6", type: "line" },
      { label: "B/D/F/M", color: "#FF6319", type: "line" },
      { label: "N/Q/R/W", color: "#FCCC0A", type: "line" },
      { label: "J/Z", color: "#996633", type: "line" },
      { label: "L", color: "#A7A9AC", type: "line" },
      { label: "G", color: "#6CBE45", type: "line" },
      { label: "7", color: "#B933AD", type: "line" },
      { label: "S", color: "#808183", type: "line" },
    ],
    opacity: 0.8,
  },
  {
    id: "subway-stations",
    label: "Subway Stations",
    group: "transit",
    source: { type: "static-geojson", url: "/data/subway-stations.geojson" },
    paneZ: MAP_PANES.transit + 5,
    minZoom: 13,
    maxZoom: 19,
    defaultVisible: false,
    icon: "CircleDot",
    legend: [{ label: "Station", color: "#1e293b", type: "circle" }],
    opacity: 0.9,
  },

  /* ----- Street Intelligence group (zoom 16+) ----- */
  {
    id: "construction",
    label: "Construction Activity",
    group: "street-intel",
    source: { type: "viewport-api", endpoint: "dob-permits", minZoom: 16, maxFeatures: 300 },
    paneZ: MAP_PANES.construction,
    minZoom: 16,
    maxZoom: 19,
    featureGate: "street_intel_construction",
    defaultVisible: false,
    icon: "HardHat",
    legend: [
      { label: "New Building", color: "#f97316", type: "circle" },
      { label: "Major Alteration", color: "#eab308", type: "circle" },
      { label: "Demolition", color: "#ef4444", type: "circle" },
    ],
    opacity: 0.9,
  },
  {
    id: "recent-sales",
    label: "Recent Sales",
    group: "street-intel",
    source: { type: "viewport-api", endpoint: "rolling-sales", minZoom: 16, maxFeatures: 200 },
    paneZ: MAP_PANES.sales,
    minZoom: 16,
    maxZoom: 19,
    featureGate: "street_intel_sales",
    defaultVisible: false,
    icon: "DollarSign",
    legend: [
      { label: "Sale < $1M", color: "#22c55e", type: "circle" },
      { label: "Sale $1-5M", color: "#3b82f6", type: "circle" },
      { label: "Sale $5M+", color: "#8b5cf6", type: "circle" },
    ],
    opacity: 0.9,
  },
  {
    id: "violations",
    label: "Violation Density",
    group: "street-intel",
    source: { type: "viewport-api", endpoint: "violations", minZoom: 16, maxFeatures: 700 },
    paneZ: MAP_PANES.violations,
    minZoom: 16,
    maxZoom: 19,
    featureGate: "street_intel_violations",
    defaultVisible: false,
    icon: "AlertTriangle",
    legend: [
      { label: "Class C (Hazardous)", color: "#ef4444", type: "circle" },
      { label: "Class B (Hazardous)", color: "#f97316", type: "circle" },
      { label: "Class A / DOB", color: "#eab308", type: "circle" },
    ],
    opacity: 0.7,
  },
  {
    id: "complaints-311",
    label: "311 Complaints",
    group: "street-intel",
    source: { type: "viewport-api", endpoint: "311", minZoom: 16, maxFeatures: 500 },
    paneZ: MAP_PANES.violations + 5,
    minZoom: 16,
    maxZoom: 19,
    featureGate: "street_intel_311",
    defaultVisible: false,
    icon: "Phone",
    legend: [
      { label: "Noise", color: "#8b5cf6", type: "circle" },
      { label: "Building Issue", color: "#f97316", type: "circle" },
      { label: "Pest / Rodent", color: "#84cc16", type: "circle" },
      { label: "Sanitary", color: "#06b6d4", type: "circle" },
    ],
    opacity: 0.6,
  },
  {
    id: "building-labels",
    label: "Building Labels",
    group: "street-intel",
    source: { type: "viewport-pluto", minZoom: 17, maxFeatures: 200 },
    paneZ: MAP_PANES.buildingLabels,
    minZoom: 17,
    maxZoom: 19,
    featureGate: "building_labels",
    defaultVisible: false,
    icon: "Tag",
    legend: [{ label: "Owner + Units label", color: "#334155", type: "fill" }],
    opacity: 0.9,
  },

  /* ----- Overlay Intelligence (custom render in map-search.tsx) ----- */
  {
    id: "hot-leads",
    label: "Hot Leads",
    group: "intelligence",
    source: { type: "viewport-api", endpoint: "motivation", minZoom: 13, maxFeatures: 25 },
    paneZ: MAP_PANES.searchResults,
    minZoom: 13,
    maxZoom: 19,
    featureGate: "motivation_scoring",
    defaultVisible: false,
    icon: "Flame",
    legend: [
      { label: "Very High", color: "#dc2626", type: "circle" },
      { label: "High", color: "#f97316", type: "circle" },
    ],
    opacity: 0.9,
  },
  {
    id: "vitality",
    label: "Neighborhood Vitality",
    group: "intelligence",
    source: { type: "viewport-api", endpoint: "vitality", minZoom: 10, maxFeatures: 500 },
    paneZ: MAP_PANES.overlayBase - 10,
    minZoom: 10,
    maxZoom: 19,
    featureGate: "vitality_overlay",
    defaultVisible: false,
    icon: "HeartPulse",
    legend: [
      { label: "Strong Growth", color: "#059669", type: "fill" },
      { label: "Declining", color: "#F87171", type: "fill" },
    ],
    opacity: 0.5,
  },
  {
    id: "new-developments",
    label: "New Developments",
    group: "intelligence",
    source: { type: "viewport-api", endpoint: "new-developments", minZoom: 13, maxFeatures: 200 },
    paneZ: MAP_PANES.searchResults,
    minZoom: 13,
    maxZoom: 19,
    defaultVisible: false,
    icon: "HardHat",
    legend: [{ label: "New Building", color: "#f59e0b", type: "circle" }],
    opacity: 0.85,
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

export function getLayerById(id: string): MapLayerConfig | undefined {
  return MAP_LAYERS.find((l) => l.id === id);
}

export function getLayersByGroup(group: LayerGroup): MapLayerConfig[] {
  return MAP_LAYERS.filter((l) => l.group === group);
}

export function getDefaultVisibility(): Record<string, boolean> {
  const vis: Record<string, boolean> = {};
  for (const layer of MAP_LAYERS) {
    vis[layer.id] = layer.defaultVisible;
  }
  return vis;
}

/** Load visibility from localStorage, falling back to defaults */
export function loadLayerVisibility(): Record<string, boolean> {
  const defaults = getDefaultVisibility();
  if (typeof window === "undefined") return defaults;
  try {
    const saved = localStorage.getItem("vettdre-map-layers");
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, boolean>;
      // Merge: use saved values for known layers, defaults for new ones
      for (const layer of MAP_LAYERS) {
        if (parsed[layer.id] !== undefined) {
          defaults[layer.id] = parsed[layer.id];
        }
      }
    }
  } catch {}
  return defaults;
}

/** Persist visibility to localStorage */
export function saveLayerVisibility(vis: Record<string, boolean>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("vettdre-map-layers", JSON.stringify(vis));
  } catch {}
}
