// Projection pure lat/lon -> coordonnees SVG (plan des stations, viewBox 400x400).
const KM_PER_DEG_LON = 111.32;
const KM_PER_DEG_LAT = 110.57;
const DEFAULT_SIZE = 400;
const HALF_SCALE = 180; // marge : le rayon occupe 180 px autour du centre (200,200).

/** Projette un point geographique dans le repere SVG centre sur (centerLat, centerLon). */
export function projectToSvg(lat, lon, centerLat, centerLon, radiusKm, size = DEFAULT_SIZE) {
  const scale = HALF_SCALE / radiusKm;
  const dx = (lon - centerLon) * Math.cos((centerLat * Math.PI) / 180) * KM_PER_DEG_LON;
  const dy = (lat - centerLat) * KM_PER_DEG_LAT;
  return {
    x: size / 2 + dx * scale,
    y: size / 2 - dy * scale,
  };
}

/** Teinte HSL : 140 (le moins cher) -> 0 (le plus cher). */
export function priceHue(value, min, max) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return 140;
  }
  const ratio = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return Math.round(140 * (1 - ratio));
}
