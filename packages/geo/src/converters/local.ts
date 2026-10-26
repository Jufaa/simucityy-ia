import {
  geographicSchema,
  localCoordinateSchema,
  type GeographicCoordinate,
  type LocalCoordinate,
} from '@simulicity/shared';
const RADIUS = 6371008.8;
const RAD = Math.PI / 180;
function scale(origin: GeographicCoordinate) {
  geographicSchema.parse(origin);
  if (Math.abs(origin.latitude) > 85)
    throw new RangeError(
      'Local projection supports origins within 85 degrees latitude',
    );
  return RADIUS * Math.cos(origin.latitude * RAD);
}
/** Equirectangular tangent approximation for small urban areas, not survey-grade. z is relative metres. */
export function toLocal(
  point: GeographicCoordinate,
  origin: GeographicCoordinate,
): LocalCoordinate {
  geographicSchema.parse(point);
  const xScale = scale(origin);
  const deltaLongitude =
    ((point.longitude - origin.longitude + 540) % 360) - 180;
  const result = {
    crs: 'local-meters' as const,
    x: deltaLongitude * RAD * xScale,
    y: (point.latitude - origin.latitude) * RAD * RADIUS,
    z: 0,
  };
  if (Math.hypot(result.x, result.y) > 50000)
    throw new RangeError('Local projection limited to 50 km from origin');
  return result;
}
export function toGeographic(
  point: LocalCoordinate,
  origin: GeographicCoordinate,
): GeographicCoordinate {
  localCoordinateSchema.parse(point);
  const xScale = scale(origin);
  if (Math.hypot(point.x, point.y) > 50000)
    throw new RangeError('Local projection limited to 50 km from origin');
  return geographicSchema.parse({
    crs: 'EPSG:4326',
    longitude: ((origin.longitude + point.x / xScale / RAD + 540) % 360) - 180,
    latitude: origin.latitude + point.y / RADIUS / RAD,
  });
}
