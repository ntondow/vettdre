// Vitality Data Fetching — Google Places API + OpenStreetMap Overpass API
// Fetches POIs for a ZIP code and matches against brand indicator registry

import {
  PLACES_SEARCH_CATEGORIES,
  OSM_AMENITY_TAGS,
  classifyPOI,
  type POIResult,
} from "./vitality-engine";
import { NYC_ZIP_CENTROIDS, haversineDistance } from "./nyc-zip-centroids";

/* ------------------------------------------------------------------ */
/*  Google Places API (New) — Text Search                              */
/* ------------------------------------------------------------------ */

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

/**
 * Fetch places by category search term for a given ZIP code.
 * Uses Google Places Text Search (New) API.
 * E.g., "grocery store near 11201"
 */
export async function fetchPlacesByCategory(
  zipCode: string,
  categorySearch: string,
): Promise<POIResult[]> {
  if (!GOOGLE_PLACES_API_KEY) return [];

  const centroid = NYC_ZIP_CENTROIDS.find((z) => z.zip === zipCode);
  if (!centroid) return [];

  try {
    const resp = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
          "X-Goog-FieldMask":
            "places.displayName,places.formattedAddress,places.location,places.id",
        },
        body: JSON.stringify({
          textQuery: `${categorySearch} near ${zipCode}`,
          locationBias: {
            circle: {
              center: { latitude: centroid.lat, longitude: centroid.lng },
              radius: 1500, // 1.5km ~ roughly ZIP radius
            },
          },
          maxResultCount: 20,
        }),
      },
    );

    if (!resp.ok) {
      console.error(`Places API error for "${categorySearch}" in ${zipCode}: ${resp.status}`);
      return [];
    }

    const data = await resp.json();
    const places: any[] = data.places || [];
    const results: POIResult[] = [];

    for (const place of places) {
      const name = place.displayName?.text || "";
      const address = place.formattedAddress || "";
      const lat = place.location?.latitude;
      const lng = place.location?.longitude;
      if (!name || !lat || !lng) continue;

      const classified = classifyPOI(name, address, lat, lng, "google_places", place.id);
      if (classified) results.push(classified);
    }

    return results;
  } catch (err) {
    console.error(`Places API fetch error for ${zipCode}/${categorySearch}:`, err);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  OpenStreetMap Overpass API                                          */
/* ------------------------------------------------------------------ */

/**
 * Fetch POIs from OpenStreetMap Overpass API within a bounding box.
 * Free, no API key needed. Rate limit: 1 req/sec.
 */
export async function fetchOSMPOIs(
  bounds: { south: number; west: number; north: number; east: number },
): Promise<POIResult[]> {
  // Build Overpass QL query for all relevant amenity tags
  const tagFilters = OSM_AMENITY_TAGS.map((tag) => {
    const [key, value] = tag.split("=");
    return `node["${key}"="${value}"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});`;
  }).join("\n");

  const query = `
    [out:json][timeout:30];
    (
      ${tagFilters}
    );
    out body;
  `;

  try {
    const resp = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!resp.ok) {
      console.error(`OSM Overpass error: ${resp.status}`);
      return [];
    }

    const data = await resp.json();
    const elements: any[] = data.elements || [];
    const results: POIResult[] = [];

    for (const el of elements) {
      if (!el.lat || !el.lon) continue;
      const name = el.tags?.name || el.tags?.operator || "";
      if (!name) continue;
      const address = [el.tags?.["addr:housenumber"], el.tags?.["addr:street"]]
        .filter(Boolean)
        .join(" ");

      const classified = classifyPOI(name, address, el.lat, el.lon, "osm");
      if (classified) results.push(classified);
    }

    return results;
  } catch (err) {
    console.error("OSM Overpass fetch error:", err);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Data Fusion & Deduplication                                        */
/* ------------------------------------------------------------------ */

const DEDUP_DISTANCE_MILES = 0.03; // ~50 meters

/**
 * Deduplicate POIs by proximity. Google Places data wins on conflicts.
 */
export function fuseAndDeduplicatePOIs(
  googlePOIs: POIResult[],
  osmPOIs: POIResult[],
): POIResult[] {
  // Start with Google Places as the primary source
  const merged = [...googlePOIs];

  for (const osmPoi of osmPOIs) {
    // Check if a Google Places POI already covers this location
    const isDuplicate = merged.some(
      (gPoi) =>
        haversineDistance(gPoi.lat, gPoi.lng, osmPoi.lat, osmPoi.lng) <
        DEDUP_DISTANCE_MILES,
    );
    if (!isDuplicate) {
      merged.push(osmPoi);
    }
  }

  return merged;
}

/* ------------------------------------------------------------------ */
/*  Full ZIP Code Fetch                                                */
/* ------------------------------------------------------------------ */

/**
 * Fetch all POIs for a ZIP code from both Google Places and OSM,
 * fuse, deduplicate, and return classified results.
 */
export async function fetchAllPOIsForZip(zipCode: string): Promise<POIResult[]> {
  const centroid = NYC_ZIP_CENTROIDS.find((z) => z.zip === zipCode);
  if (!centroid) return [];

  // ~1 mile bounding box around ZIP centroid for OSM queries
  const osmBounds = {
    south: centroid.lat - 0.015,
    west: centroid.lng - 0.02,
    north: centroid.lat + 0.015,
    east: centroid.lng + 0.02,
  };

  // Fetch Google Places by category (8 category searches per ZIP)
  const googleResults: POIResult[] = [];

  if (GOOGLE_PLACES_API_KEY) {
    for (const category of PLACES_SEARCH_CATEGORIES) {
      const results = await fetchPlacesByCategory(zipCode, category);
      googleResults.push(...results);
      // Brief delay between requests to be polite
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  // Fetch OSM POIs
  const osmResults = await fetchOSMPOIs(osmBounds);

  // Fuse and deduplicate
  return fuseAndDeduplicatePOIs(googleResults, osmResults);
}
