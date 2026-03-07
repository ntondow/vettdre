// Map layer style functions — NO "use server" so client components can import

/* ------------------------------------------------------------------ */
/*  Subway route → official MTA color mapping                         */
/* ------------------------------------------------------------------ */

export const SUBWAY_COLORS: Record<string, string> = {
  // IRT
  "1": "#EE352E", "2": "#EE352E", "3": "#EE352E",
  "4": "#00933C", "5": "#00933C", "6": "#00933C",
  "7": "#B933AD",
  // IND
  A: "#0039A6", C: "#0039A6", E: "#0039A6",
  B: "#FF6319", D: "#FF6319", F: "#FF6319", M: "#FF6319",
  G: "#6CBE45",
  // BMT
  J: "#996633", Z: "#996633",
  L: "#A7A9AC",
  N: "#FCCC0A", Q: "#FCCC0A", R: "#FCCC0A", W: "#FCCC0A",
  // Shuttles
  S: "#808183", SI: "#0039A6",
};

/** Resolve the dominant color for a subway route string like "A-C-E" or "N,Q,R,W" */
export function resolveSubwayColor(routeStr: string | undefined): string {
  if (!routeStr) return "#808183";
  // Routes may be separated by dashes, commas, slashes, or spaces
  const first = routeStr.split(/[-,/\s]+/)[0]?.trim().toUpperCase();
  return SUBWAY_COLORS[first] || "#808183";
}

/* ------------------------------------------------------------------ */
/*  PLUTO Land Use code → color mapping                               */
/* ------------------------------------------------------------------ */

export const LAND_USE_COLORS: Record<string, string> = {
  "01": "#fde68a", // One & Two Family Buildings
  "02": "#fdba74", // Multi-Family Walk-Up
  "03": "#fb923c", // Multi-Family Elevator
  "04": "#f472b6", // Mixed Residential & Commercial
  "05": "#f87171", // Commercial & Office
  "06": "#a78bfa", // Industrial & Manufacturing
  "07": "#60a5fa", // Transportation & Utility
  "08": "#60a5fa", // Public Facilities & Institutions
  "09": "#4ade80", // Open Space & Recreation
  "10": "#94a3b8", // Parking Facilities
  "11": "#e2e8f0", // Vacant Land
};

export const LAND_USE_LABELS: Record<string, string> = {
  "01": "1-2 Family",
  "02": "Multi-Family (Walk-up)",
  "03": "Multi-Family (Elevator)",
  "04": "Mixed Res/Comm",
  "05": "Commercial/Office",
  "06": "Industrial",
  "07": "Transportation/Utility",
  "08": "Public/Institution",
  "09": "Open Space/Park",
  "10": "Parking",
  "11": "Vacant",
};

/* ------------------------------------------------------------------ */
/*  Zoning district prefix → color mapping                            */
/* ------------------------------------------------------------------ */

const ZONING_COLORS: Record<string, string> = {
  R: "#fbbf24",  // Residential — amber
  C: "#f87171",  // Commercial — red
  M: "#a78bfa",  // Manufacturing — violet
  P: "#4ade80",  // Park — green
  B: "#60a5fa",  // Battery Park City — blue
};

/* ------------------------------------------------------------------ */
/*  Style functions (for Leaflet L.geoJSON style callbacks)           */
/* ------------------------------------------------------------------ */

/**
 * Building footprint polygon style.
 * Default grey; optionally colored by land use code if available.
 */
export function buildingFootprintStyle(feature: any): Record<string, any> {
  const landUse = feature?.properties?.landuse;
  const color = landUse ? (LAND_USE_COLORS[landUse] || "#475569") : "#475569";
  return {
    fillColor: color,
    fillOpacity: 0.5,
    weight: 0.5,
    color: "#334155",
    opacity: 0.7,
  };
}

/**
 * Land use choropleth: colors building footprints by PLUTO land use code.
 */
export function landUseStyle(feature: any): Record<string, any> {
  const code = feature?.properties?.landuse || feature?.properties?.LandUse || "11";
  const color = LAND_USE_COLORS[code] || "#e2e8f0";
  return {
    fillColor: color,
    fillOpacity: 0.55,
    weight: 0.5,
    color: "#334155",
    opacity: 0.5,
  };
}

/**
 * Zoning district polygon style — colored by zone prefix (R/C/M).
 */
export function zoningStyle(feature: any): Record<string, any> {
  const zone = feature?.properties?.zonedist ||
    feature?.properties?.ZONEDIST ||
    feature?.properties?.zonedist1 ||
    "";
  const prefix = zone.charAt(0).toUpperCase();
  const color = ZONING_COLORS[prefix] || "#94a3b8";
  return {
    fillColor: color,
    fillOpacity: 0.2,
    weight: 1,
    color,
    opacity: 0.5,
    dashArray: prefix === "P" ? "4 4" : undefined,
  };
}

/**
 * Subway line style — colored by the route served.
 */
export function subwayLineStyle(feature: any): Record<string, any> {
  const route = feature?.properties?.service ||
    feature?.properties?.rt_symbol ||
    feature?.properties?.name ||
    feature?.properties?.line ||
    "";
  const color = resolveSubwayColor(route);
  return {
    color,
    weight: 3,
    opacity: 0.85,
    lineCap: "round",
    lineJoin: "round",
  };
}

/**
 * Opportunity zone polygon style — green tinted fill.
 */
export function opportunityZoneStyle(_feature: any): Record<string, any> {
  return {
    fillColor: "#10b981",
    fillOpacity: 0.2,
    weight: 1.5,
    color: "#059669",
    opacity: 0.6,
    dashArray: "5 3",
  };
}

/**
 * Neighborhood boundary style — dashed indigo outline, nearly transparent fill.
 */
export function neighborhoodStyle(_feature: any): Record<string, any> {
  return {
    fillColor: "#6366F1",
    fillOpacity: 0.03,
    weight: 1.5,
    color: "#6366F1",
    opacity: 0.5,
    dashArray: "4 4",
  };
}

/** Neighborhood hover style — slightly more visible fill and heavier outline. */
export function neighborhoodHoverStyle(): Record<string, any> {
  return {
    fillColor: "#6366F1",
    fillOpacity: 0.08,
    weight: 2.5,
    color: "#6366F1",
    opacity: 0.7,
    dashArray: "4 4",
  };
}

/* ------------------------------------------------------------------ */
/*  Tooltip formatters                                                */
/* ------------------------------------------------------------------ */

/** Tooltip for building footprint on hover */
export function buildingFootprintTooltip(feature: any): string {
  const p = feature?.properties || {};
  const addr = p.base_bbl ? `BBL ${p.base_bbl}` : "";
  const height = p.heightroof ? `${Math.round(p.heightroof)} ft` : "";
  const year = p.cnstrct_yr && p.cnstrct_yr > 0 ? `Built ${p.cnstrct_yr}` : "";
  const parts = [addr, height, year].filter(Boolean);
  return parts.join(" | ") || "Building";
}

/** Tooltip for subway station */
export function subwayStationTooltip(feature: any): string {
  const p = feature?.properties || {};
  const name = p.stop_name || p.name || p.NAME || "Station";
  const lines = p.daytime_routes || p.line || "";
  return lines ? `${name} (${lines})` : name;
}

/** Tooltip for neighborhood boundary */
export function neighborhoodTooltip(feature: any): string {
  const p = feature?.properties || {};
  return p.ntaname || p.NTAName || p.name || "Neighborhood";
}

/** Tooltip for zoning district */
export function zoningTooltip(feature: any): string {
  const p = feature?.properties || {};
  return p.zonedist || p.ZONEDIST || p.zonedist1 || "Zone";
}

/** Tooltip for opportunity zone */
export function opportunityZoneTooltip(feature: any): string {
  const p = feature?.properties || {};
  const tract = p.GEOID10 || p.census_tract || p.GEOID || p.geoid || "";
  return tract ? `OZ Tract ${tract}` : "Opportunity Zone";
}
