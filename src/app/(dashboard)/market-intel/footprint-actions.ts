"use server";

/**
 * Server actions for fetching building footprints from NYC Open Data.
 * Uses the Socrata API with spatial within_box queries.
 * Dataset: NYC Building Footprints (5zhs-2jue)
 */

const FOOTPRINT_ENDPOINT = "https://data.cityofnewyork.us/resource/5zhs-2jue.geojson";
const MAX_FEATURES = 2000;

export interface FootprintBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Fetch building footprint GeoJSON for the given viewport bounds.
 * Returns GeoJSON FeatureCollection or null on error.
 */
export async function fetchBuildingFootprints(
  bounds: FootprintBounds,
): Promise<any | null> {
  try {
    // Socrata within_box spatial query on the_geom column
    const url = new URL(FOOTPRINT_ENDPOINT);
    url.searchParams.set(
      "$where",
      `within_box(the_geom, ${bounds.north}, ${bounds.west}, ${bounds.south}, ${bounds.east})`,
    );
    url.searchParams.set("$limit", String(MAX_FEATURES));
    // Only request essential fields to reduce payload
    url.searchParams.set(
      "$select",
      "the_geom,base_bbl,mpluto_bbl,heightroof,cnstrct_yr,feat_code,groundelev,shape_area",
    );

    const resp = await fetch(url.toString(), {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!resp.ok) {
      console.error(`Footprint API error: ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    return data;
  } catch (err) {
    console.error("fetchBuildingFootprints error:", err);
    return null;
  }
}
