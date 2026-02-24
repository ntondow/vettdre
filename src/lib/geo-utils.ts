/**
 * Convert a center point + radius in miles to a bounding box.
 * Uses the approximation: 1 degree latitude ≈ 69 miles,
 * 1 degree longitude ≈ 69 * cos(latitude) miles.
 */
export function radiusToBoundingBox(
  centerLat: number,
  centerLng: number,
  radiusMiles: number,
): { swLat: number; swLng: number; neLat: number; neLng: number } {
  const latDelta = radiusMiles / 69;
  const lngDelta =
    radiusMiles / (69 * Math.cos((centerLat * Math.PI) / 180));
  return {
    swLat: centerLat - latDelta,
    swLng: centerLng - lngDelta,
    neLat: centerLat + latDelta,
    neLng: centerLng + lngDelta,
  };
}
