/**
 * Web Mercator helpers for the zone picker map. Pure math, shared by the
 * picker rendering, the draggable selection square and DEM sampling.
 */
export interface LatLon {
  lat: number;
  lon: number;
}

export const MAX_MERCATOR_LAT = 85.05112878;

export function latLonToWorldPixels(
  point: LatLon,
  zoom: number,
): { x: number; y: number } {
  const scale = 256 * 2 ** zoom;
  const lat = Math.max(
    -MAX_MERCATOR_LAT,
    Math.min(MAX_MERCATOR_LAT, point.lat),
  );
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((point.lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

export function worldPixelsToLatLon(
  point: { x: number; y: number },
  zoom: number,
): LatLon {
  const scale = 256 * 2 ** zoom;
  const lon = (point.x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * point.y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lon };
}

/** Ground metres represented by one screen pixel at a latitude/zoom. */
export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/**
 * Bounding box of a square of `sideInMeters` centred on a point, using the
 * same local equirectangular approximation as the real-city converter.
 */
export function bboxAroundCenter(
  center: LatLon,
  sideInMeters: number,
): { south: number; west: number; north: number; east: number } {
  if (
    !Number.isFinite(center.lat) ||
    !Number.isFinite(center.lon) ||
    !Number.isFinite(sideInMeters) ||
    sideInMeters <= 0
  )
    throw new RangeError(
      'Selection centre and side must be finite and positive.',
    );
  const phi = (center.lat * Math.PI) / 180;
  const metersPerDegreeLat =
    111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
  const metersPerDegreeLon =
    111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
  const halfLat = sideInMeters / 2 / metersPerDegreeLat;
  const halfLon = sideInMeters / 2 / metersPerDegreeLon;
  return {
    south: center.lat - halfLat,
    west: center.lon - halfLon,
    north: center.lat + halfLat,
    east: center.lon + halfLon,
  };
}
