/**
 * Haversine formula — calculates the great-circle distance between
 * two points on Earth given their latitude/longitude.
 *
 * This is the same formula used by Google Maps under the hood.
 * We use it to calculate how far a team traveled between games.
 *
 * Why not just use straight-line distance? Because Earth is a sphere.
 * The shortest path between LA and NYC isn't a flat line — it's an
 * arc. Haversine accounts for that curvature.
 */

const EARTH_RADIUS_MILES = 3958.8;

/**
 * Convert degrees to radians.
 * Math.sin/cos work in radians, not degrees.
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate distance in miles between two lat/lng coordinates.
 *
 * @example
 * // LA Lakers arena to Boston Celtics arena
 * haversineDistance(34.043, -118.267, 42.366, -71.062)
 * // → ~2,611 miles
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_MILES * c;
}
