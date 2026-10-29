import type { CityResponse } from './city-types';
import { sampleTerrainHeight } from './terrain-view';

/** Bridge decks are transport surfaces, not raised channel terrain. */
export function bridgeAtPoint(city: CityResponse, x: number, z: number) {
  return city.organic?.bridges.find((bridge) => {
    const dx = bridge.end.x - bridge.start.x;
    const dz = bridge.end.y - bridge.start.y;
    const lengthSquared = dx * dx + dz * dz;
    if (lengthSquared === 0) return false;
    const t =
      ((x - bridge.start.x) * dx + (z - bridge.start.y) * dz) / lengthSquared;
    return (
      t >= 0 &&
      t <= 1 &&
      Math.hypot(x - bridge.start.x - t * dx, z - bridge.start.y - t * dz) <=
        bridge.widthInMeters / 2
    );
  });
}

export function sampleRoadSurfaceHeight(
  city: CityResponse,
  x: number,
  z: number,
): number {
  return (
    bridgeAtPoint(city, x, z)?.deckElevationInMeters ??
    sampleTerrainHeight(city, x, z)
  );
}
