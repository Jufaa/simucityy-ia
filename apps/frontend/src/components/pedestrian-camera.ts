import type { CityResponse, Point } from './city-types';
import { sampleRoadSurfaceHeight } from './road-surface';

/** Inspection pose only: never changes citizen, terrain or simulation positions. */
export function pedestrianCameraPose(
  city: CityResponse,
  citizens: readonly { position: Point }[] = [],
): {
  position: [number, number, number];
  target: [number, number, number];
} {
  const center = {
    x: city.config.widthInMeters * 0.3,
    y: city.config.heightInMeters * 0.5,
  };
  const positions = citizens.length
    ? citizens.map((person) => person.position)
    : (city.roadGraph?.nodes ?? []);
  const point = positions.reduce<Point>(
    (best, candidate) =>
      Math.hypot(candidate.x - center.x, candidate.y - center.y) <
      Math.hypot(best.x - center.x, best.y - center.y)
        ? candidate
        : best,
    positions[0] ?? center,
  );
  const ground = sampleRoadSurfaceHeight(city, point.x, point.y);
  return {
    position: [point.x + 12, ground + 8, point.y + 18],
    target: [point.x, ground + 1.35, point.y],
  };
}
