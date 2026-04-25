"use client";

import { useEffect, useRef, useCallback } from "react";
import { MAP_LAYERS, MAP_PANES, type MapLayerConfig } from "@/lib/map-layers";
import {
  buildingFootprintStyle,
  subwayLineStyle,
  neighborhoodStyle,
  neighborhoodHoverStyle,
  zoningStyle,
  opportunityZoneStyle,
  buildingFootprintTooltip,
  subwayStationTooltip,
  neighborhoodTooltip,
  zoningTooltip,
  opportunityZoneTooltip,
  resolveSubwayColor,
} from "@/lib/map-styles";
import { fetchBuildingFootprints } from "./footprint-actions";
import { fetchNTABoundaries } from "./neighborhood-actions";

interface Props {
  map: any; // Leaflet map instance
  visibility: Record<string, boolean>;
  onFootprintClick?: (bbl: string) => void;
  selectedNeighborhoods?: string[];
  isDrawMode?: boolean;
  isNeighborhoodSelectMode?: boolean;
  onNeighborhoodSelect?: (ntaName: string | null, bounds?: { swLat: number; swLng: number; neLat: number; neLng: number }, polygon?: [number, number][]) => void;
}

// Style function lookup by layer ID
const STYLE_FNS: Record<string, (feature: any) => Record<string, any>> = {
  "subway-lines": subwayLineStyle,
  zoning: zoningStyle,
  "opportunity-zones": opportunityZoneStyle,
};

// Tooltip function lookup by layer ID
const TOOLTIP_FNS: Record<string, (feature: any) => string> = {
  "subway-stations": subwayStationTooltip,
  zoning: zoningTooltip,
  "opportunity-zones": opportunityZoneTooltip,
};

/**
 * MapLayersRenderer — manages all overlay layers on the Leaflet map.
 * Handles: static GeoJSON loading, pane creation, zoom-gated visibility,
 * style application, tooltips, and toggle state.
 *
 * Does NOT render any DOM — purely imperative Leaflet manipulation.
 */
export default function MapLayersRenderer({ map, visibility, onFootprintClick, selectedNeighborhoods = [], isDrawMode, isNeighborhoodSelectMode, onNeighborhoodSelect }: Props) {
  // Store created panes to avoid re-creation
  const panesCreatedRef = useRef(false);
  // Store layer instances keyed by layer ID
  const layerInstancesRef = useRef<Map<string, any>>(new Map());
  // Store loaded GeoJSON data (cache after first fetch)
  const geojsonCacheRef = useRef<Map<string, any>>(new Map());
  // Track current zoom to manage zoom-gated visibility
  const currentZoomRef = useRef<number>(0);

  // Create custom panes on mount
  useEffect(() => {
    if (!map || panesCreatedRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    // Create custom panes with z-indices
    for (const [name, zIndex] of Object.entries(MAP_PANES)) {
      const pane = map.createPane(name);
      pane.style.zIndex = String(zIndex);
    }
    panesCreatedRef.current = true;
  }, [map]);

  // Get pane name for a layer based on its paneZ
  const getPaneName = useCallback((layer: MapLayerConfig): string => {
    const entries = Object.entries(MAP_PANES);
    // Find the closest pane (floor)
    let closest = entries[0][0];
    let closestDiff = Infinity;
    for (const [name, z] of entries) {
      const diff = layer.paneZ - z;
      if (diff >= 0 && diff < closestDiff) {
        closest = name;
        closestDiff = diff;
      }
    }
    return closest;
  }, []);

  // Load a static GeoJSON file, returning cached data if available
  const loadGeoJSON = useCallback(async (url: string): Promise<any> => {
    if (geojsonCacheRef.current.has(url)) {
      return geojsonCacheRef.current.get(url);
    }
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    geojsonCacheRef.current.set(url, data);
    return data;
  }, []);

  // Create or update a layer on the map
  const ensureLayer = useCallback(
    async (config: MapLayerConfig) => {
      const L = (window as any).L;
      if (!L || !map) return;

      // Already created? Just make sure it's on the map
      if (layerInstancesRef.current.has(config.id)) {
        const existing = layerInstancesRef.current.get(config.id);
        if (!map.hasLayer(existing)) {
          map.addLayer(existing);
        }
        return;
      }

      // Only handle static-geojson layers here
      // (viewport-api, viewport-pluto, arcgis-raster handled separately)
      if (config.source.type !== "static-geojson") return;

      const data = await loadGeoJSON(config.source.url);
      if (!data) return;

      const styleFn = STYLE_FNS[config.id];
      const tooltipFn = TOOLTIP_FNS[config.id];
      const paneName = getPaneName(config);

      if (config.id === "subway-stations") {
        // Stations are points — render as circleMarkers
        const layer = L.geoJSON(data, {
          pane: paneName,
          pointToLayer: (_feature: any, latlng: any) => {
            const routes = _feature?.properties?.daytime_routes || "";
            const color = resolveSubwayColor(routes);
            return L.circleMarker(latlng, {
              pane: paneName,
              radius: 4,
              fillColor: color,
              color: "#1e293b",
              weight: 1,
              fillOpacity: 0.9,
            });
          },
          onEachFeature: (feature: any, layer: any) => {
            if (tooltipFn) {
              layer.bindTooltip(tooltipFn(feature), {
                direction: "top",
                offset: [0, -6],
                className: "map-layer-tooltip",
              });
            }
          },
        });
        layer.addTo(map);
        layerInstancesRef.current.set(config.id, layer);
      } else {
        // Polygon/line layers
        const layer = L.geoJSON(data, {
          pane: paneName,
          style: styleFn || (() => ({})),
          onEachFeature: (feature: any, layer: any) => {
            if (tooltipFn) {
              layer.bindTooltip(tooltipFn(feature), {
                sticky: true,
                direction: "top",
                className: "map-layer-tooltip",
              });
            }
          },
        });
        layer.addTo(map);
        layerInstancesRef.current.set(config.id, layer);
      }
    },
    [map, loadGeoJSON, getPaneName],
  );

  // Remove a layer from the map (but keep in cache)
  const removeLayer = useCallback(
    (layerId: string) => {
      if (!map) return;
      const layer = layerInstancesRef.current.get(layerId);
      if (layer && map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    },
    [map],
  );

  // Sync layers with visibility state + zoom level
  const syncLayers = useCallback(() => {
    if (!map) return;
    const zoom = map.getZoom();
    currentZoomRef.current = zoom;

    // Only process static-geojson layers (handled by this component)
    const staticLayers = MAP_LAYERS.filter(
      (l) => l.source.type === "static-geojson",
    );

    for (const config of staticLayers) {
      const isVisible = visibility[config.id] ?? config.defaultVisible;
      const inZoomRange = zoom >= config.minZoom && zoom <= config.maxZoom;

      if (isVisible && inZoomRange) {
        ensureLayer(config);
      } else {
        removeLayer(config.id);
      }
    }
  }, [map, visibility, ensureLayer, removeLayer]);

  // Sync on visibility changes
  useEffect(() => {
    syncLayers();
  }, [syncLayers]);

  // Sync on zoom changes
  useEffect(() => {
    if (!map) return;
    const handler = () => syncLayers();
    map.on("zoomend", handler);
    return () => { map.off("zoomend", handler); };
  }, [map, syncLayers]);

  // FEMA Flood Zones — ArcGIS MapServer tile overlay
  const floodLayerRef = useRef<any>(null);

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !map) return;

    const isVisible = visibility["flood-zones"] ?? false;
    const zoom = map.getZoom();
    const floodConfig = MAP_LAYERS.find((l) => l.id === "flood-zones");
    const inZoomRange = floodConfig ? zoom >= floodConfig.minZoom : zoom >= 12;

    if (isVisible && inZoomRange) {
      if (!floodLayerRef.current) {
        // Use ArcGIS MapServer export as tile layer
        // FEMA NFHL flood hazard zones via their MapServer
        floodLayerRef.current = L.tileLayer(
          "https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/export?bbox={xmin},{ymin},{xmax},{ymax}&bboxSR=4326&imageSR=4326&size=256,256&format=png32&transparent=true&layers=show:28&f=image",
          {
            // Custom tile URL builder to inject bbox
            maxZoom: 19,
            opacity: 0.4,
            attribution: "FEMA NFHL",
          },
        );
        // Override getTileUrl to use proper bbox from tile coords
        floodLayerRef.current.getTileUrl = function (this: any, coords: any) {
          if (!coords || coords.z === undefined || !this._map) return "";
          const tileSize = 256;
          const nw = this._map.unproject([coords.x * tileSize, coords.y * tileSize], coords.z);
          const se = this._map.unproject([(coords.x + 1) * tileSize, (coords.y + 1) * tileSize], coords.z);
          return `https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/export?bbox=${se.lng},${se.lat},${nw.lng},${nw.lat}&bboxSR=4326&imageSR=4326&size=${tileSize},${tileSize}&format=png32&transparent=true&layers=show:28&f=image`;
        };
        floodLayerRef.current.addTo(map);
      }
    } else {
      if (floodLayerRef.current && map.hasLayer(floodLayerRef.current)) {
        map.removeLayer(floodLayerRef.current);
        floodLayerRef.current = null;
      }
    }
  }, [map, visibility]);

  // Also sync flood layer on zoom changes
  useEffect(() => {
    if (!map) return;
    const handler = () => {
      const L = (window as any).L;
      if (!L) return;
      const zoom = map.getZoom();
      const isVisible = visibility["flood-zones"] ?? false;
      if (!isVisible || zoom < 12) {
        if (floodLayerRef.current && map.hasLayer(floodLayerRef.current)) {
          map.removeLayer(floodLayerRef.current);
          floodLayerRef.current = null;
        }
      }
    };
    map.on("zoomend", handler);
    return () => { map.off("zoomend", handler); };
  }, [map, visibility]);

  // Neighborhoods — NTA polygon boundaries from NYC Open Data
  const neighborhoodLayerRef = useRef<any>(null);
  const neighborhoodDataRef = useRef<any>(null);
  const neighborhoodLoadingRef = useRef(false);

  const loadNeighborhoods = useCallback(async () => {
    const L = (window as any).L;
    if (!L || !map || neighborhoodLoadingRef.current) return;

    const zoom = map.getZoom();
    const nhConfig = MAP_LAYERS.find((l) => l.id === "neighborhoods");
    const isVisible = visibility["neighborhoods"] ?? nhConfig?.defaultVisible ?? false;

    // Remove if not visible or out of zoom range
    if (!isVisible || zoom < (nhConfig?.minZoom ?? 11) || zoom > (nhConfig?.maxZoom ?? 15)) {
      if (neighborhoodLayerRef.current && map.hasLayer(neighborhoodLayerRef.current)) {
        map.removeLayer(neighborhoodLayerRef.current);
      }
      return;
    }

    // If already on map, remove and re-add (to refresh highlight state)
    if (neighborhoodLayerRef.current && map.hasLayer(neighborhoodLayerRef.current)) {
      map.removeLayer(neighborhoodLayerRef.current);
    }

    // Fetch data (cached after first call)
    if (!neighborhoodDataRef.current) {
      neighborhoodLoadingRef.current = true;
      try {
        // Primary: NTA boundaries from NYC Open Data (server action)
        const data = await fetchNTABoundaries();
        if (data && data.features?.length > 50) {
          neighborhoodDataRef.current = data;
        } else {
          // Fallback: local GeoJSON file (262 real polygon features)
          try {
            const resp = await fetch("/data/neighborhoods.geojson");
            if (resp.ok) {
              const local = await resp.json();
              if (local?.features?.length > 50) {
                neighborhoodDataRef.current = local;
              }
            }
          } catch {
            // Both sources failed — render nothing
          }
        }
        if (!neighborhoodDataRef.current) {
          neighborhoodLoadingRef.current = false;
          return;
        }
      } catch {
        neighborhoodLoadingRef.current = false;
        return;
      }
      neighborhoodLoadingRef.current = false;
    }

    // Remove old layer if exists
    if (neighborhoodLayerRef.current && map.hasLayer(neighborhoodLayerRef.current)) {
      map.removeLayer(neighborhoodLayerRef.current);
    }

    // Ensure pane exists
    const paneName = "overlayBase";
    if (!map.getPane(paneName)) {
      const pane = map.createPane(paneName);
      pane.style.zIndex = String(MAP_PANES.overlayBase);
    }

    const selectedSet = new Set(selectedNeighborhoods);

    neighborhoodLayerRef.current = L.geoJSON(neighborhoodDataRef.current, {
      pane: paneName,
      interactive: !isDrawMode, // Disable click interception during draw mode
      style: (feature: any) => {
        const ntaName = feature?.properties?.ntaname || feature?.properties?.NTAName || "";
        if (selectedSet.has(ntaName)) {
          return { ...neighborhoodStyle(feature), weight: 3, fillOpacity: 0.15, color: "#4F46E5" };
        }
        return neighborhoodStyle(feature);
      },
      onEachFeature: (feature: any, layer: any) => {
        const name = neighborhoodTooltip(feature);
        const ntaName = feature?.properties?.ntaname || feature?.properties?.NTAName || "";
        layer.bindTooltip(name, {
          sticky: true,
          direction: "top",
          className: "map-layer-tooltip",
        });
        layer.on("mouseover", () => {
          if (!selectedSet.has(ntaName)) {
            layer.setStyle(neighborhoodHoverStyle());
          }
        });
        layer.on("mouseout", () => {
          if (selectedSet.has(ntaName)) {
            layer.setStyle({ ...neighborhoodStyle(feature), weight: 3, fillOpacity: 0.15, color: "#4F46E5" });
          } else {
            layer.setStyle(neighborhoodStyle(feature));
          }
        });
        layer.on("click", () => {
          // Skip neighborhood clicks during draw mode — let the draw handler take them
          if (isDrawMode) return;
          // Require explicit neighborhood select mode — don't activate on casual map clicks
          if (!isNeighborhoodSelectMode) return;

          if (onNeighborhoodSelect && ntaName) {
            // Compute polygon bounding box for spatial queries
            const layerBounds = layer.getBounds();
            const sw = layerBounds.getSouthWest();
            const ne = layerBounds.getNorthEast();
            const spatialBounds = layerBounds.isValid()
              ? { swLat: sw.lat, swLng: sw.lng, neLat: ne.lat, neLng: ne.lng }
              : undefined;
            // Extract polygon coordinates from the GeoJSON feature for point-in-polygon
            const geojson = (layer as any).toGeoJSON?.();
            let polygonCoords: [number, number][] | undefined;
            if (geojson?.geometry) {
              const geo = geojson.geometry;
              if (geo.type === "Polygon" && geo.coordinates?.[0]) {
                polygonCoords = geo.coordinates[0].map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
              } else if (geo.type === "MultiPolygon" && geo.coordinates?.[0]?.[0]) {
                let largest = geo.coordinates[0][0];
                for (const poly of geo.coordinates) {
                  if (poly[0] && poly[0].length > largest.length) largest = poly[0];
                }
                polygonCoords = largest.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
              }
            }
            // Toggle: onNeighborhoodSelect handles add/remove logic in parent
            onNeighborhoodSelect(ntaName, spatialBounds, polygonCoords);
            // Fly to neighborhood bounds (only if adding — parent handles deselect)
            if (layerBounds.isValid() && !selectedSet.has(ntaName)) {
              map.flyToBounds(layerBounds, { padding: [30, 30], duration: 0.6 });
            }
          }
        });
      },
    });
    neighborhoodLayerRef.current.addTo(map);
  }, [map, visibility, selectedNeighborhoods, isDrawMode, isNeighborhoodSelectMode, onNeighborhoodSelect]);

  // Sync neighborhoods on visibility/zoom changes
  useEffect(() => {
    loadNeighborhoods();
  }, [loadNeighborhoods]);

  useEffect(() => {
    if (!map) return;
    const handler = () => loadNeighborhoods();
    map.on("zoomend", handler);
    return () => { map.off("zoomend", handler); };
  }, [map, loadNeighborhoods]);

  // Building footprints — viewport-based loading at zoom 16+
  const footprintDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const footprintLayerRef = useRef<any>(null);
  const footprintLoadingRef = useRef(false);

  const loadFootprints = useCallback(async () => {
    const L = (window as any).L;
    if (!L || !map || footprintLoadingRef.current) return;

    const zoom = map.getZoom();
    const fpConfig = MAP_LAYERS.find((l) => l.id === "building-footprints");
    const isVisible = visibility["building-footprints"] ?? fpConfig?.defaultVisible ?? true;

    // Remove if not visible or below min zoom
    if (!isVisible || zoom < 16) {
      if (footprintLayerRef.current && map.hasLayer(footprintLayerRef.current)) {
        map.removeLayer(footprintLayerRef.current);
      }
      return;
    }

    footprintLoadingRef.current = true;
    try {
      const bounds = map.getBounds();
      const data = await fetchBuildingFootprints({
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      });

      if (!data?.features?.length) {
        footprintLoadingRef.current = false;
        return;
      }

      // Remove old layer
      if (footprintLayerRef.current && map.hasLayer(footprintLayerRef.current)) {
        map.removeLayer(footprintLayerRef.current);
      }

      // Create new footprint layer in the buildings pane
      const paneName = "buildings";
      // Ensure pane exists
      if (!map.getPane(paneName)) {
        const pane = map.createPane(paneName);
        pane.style.zIndex = String(MAP_PANES.buildings);
      }

      // Single reusable tooltip — avoids sticky/orphaned tooltips when mouse
      // moves quickly between adjacent footprint polygons
      const hoverTooltip = L.tooltip({
        permanent: false,
        sticky: false,
        direction: "top",
        offset: [0, -10],
        className: "map-layer-tooltip",
      });

      footprintLayerRef.current = L.geoJSON(data, {
        pane: paneName,
        style: buildingFootprintStyle,
        onEachFeature: (feature: any, layer: any) => {
          const tip = buildingFootprintTooltip(feature);
          // Click → open building profile
          const bbl = feature?.properties?.base_bbl || feature?.properties?.mpluto_bbl;
          if (bbl && onFootprintClick) {
            layer.on("click", () => onFootprintClick(bbl));
          }
          // Hover: show single reusable tooltip + highlight polygon
          layer.on("mouseover", (e: any) => {
            layer.setStyle({ fillOpacity: 0.8, weight: 1.5 });
            if (tip) {
              hoverTooltip.setContent(tip);
              hoverTooltip.setLatLng(e.latlng);
              map.openTooltip(hoverTooltip);
            }
          });
          layer.on("mousemove", (e: any) => {
            if (tip) hoverTooltip.setLatLng(e.latlng);
          });
          layer.on("mouseout", () => {
            layer.setStyle(buildingFootprintStyle(feature));
            map.closeTooltip(hoverTooltip);
          });
        },
      });
      footprintLayerRef.current.addTo(map);
    } catch (err) {
      console.error("Footprint load error:", err);
    }
    footprintLoadingRef.current = false;
  }, [map, visibility, onFootprintClick]);

  // Debounced footprint loading on move/zoom
  useEffect(() => {
    if (!map) return;
    const handler = () => {
      clearTimeout(footprintDebounceRef.current);
      footprintDebounceRef.current = setTimeout(loadFootprints, 500);
    };
    map.on("moveend", handler);
    map.on("zoomend", handler);
    // Initial load
    handler();
    return () => {
      map.off("moveend", handler);
      map.off("zoomend", handler);
      clearTimeout(footprintDebounceRef.current);
    };
  }, [map, loadFootprints]);

  // Cleanup all layers on unmount
  useEffect(() => {
    return () => {
      if (!map) return;
      for (const [, layer] of layerInstancesRef.current) {
        if (map.hasLayer(layer)) {
          map.removeLayer(layer);
        }
      }
      layerInstancesRef.current.clear();
      if (footprintLayerRef.current && map.hasLayer(footprintLayerRef.current)) {
        map.removeLayer(footprintLayerRef.current);
      }
      if (floodLayerRef.current && map.hasLayer(floodLayerRef.current)) {
        map.removeLayer(floodLayerRef.current);
      }
      if (neighborhoodLayerRef.current && map.hasLayer(neighborhoodLayerRef.current)) {
        map.removeLayer(neighborhoodLayerRef.current);
      }
    };
  }, [map]);

  // Inject tooltip CSS once
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (document.getElementById("map-layer-tooltip-css")) return;
    const style = document.createElement("style");
    style.id = "map-layer-tooltip-css";
    style.textContent = `
      .map-layer-tooltip {
        background: rgba(15, 23, 42, 0.9);
        color: #f1f5f9;
        border: none;
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 11px;
        font-family: system-ui, -apple-system, sans-serif;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      }
      .map-layer-tooltip::before {
        border-top-color: rgba(15, 23, 42, 0.9) !important;
      }
    `;
    document.head.appendChild(style);
  }, []);

  // No DOM output — this component is purely imperative
  return null;
}
