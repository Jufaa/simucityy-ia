import type { FloodEnvironment } from '@simulicity/hazards';
import type { CityResponse } from './city-types';
import { waterSurfaceAt } from './organic-city-model';

/** Static geographic levels inform exposure only; they are not extra rainfall or solver volume. */
export function organicFloodEnvironment(city: CityResponse): FloodEnvironment {
  const geography = city.organic;
  const grid = city.terrainGrid;
  if (!geography || !grid) return {};
  const roadDeckElevationsInMeters: Record<string, number> = {};
  for (const bridge of geography.bridges)
    for (const id of bridge.edgeIds)
      roadDeckElevationsInMeters[id] = bridge.deckElevationInMeters;
  const permanentWaterSurfaceElevationsInMeters: Record<number, number> = {};
  const xs = grid.xCoordinates,
    zs = grid.yCoordinates;
  for (let r = 0; r < zs.length - 1; r++)
    for (let c = 0; c < xs.length - 1; c++) {
      const samples = [
        { x: xs[c]!, y: zs[r]! },
        { x: xs[c + 1]!, y: zs[r]! },
        { x: xs[c]!, y: zs[r + 1]! },
        { x: xs[c + 1]!, y: zs[r + 1]! },
        { x: (xs[c]! + xs[c + 1]!) / 2, y: (zs[r]! + zs[r + 1]!) / 2 },
      ];
      const levels = samples
        .map((p) => waterSurfaceAt(geography, p))
        .filter((v): v is number => v !== undefined);
      if (levels.length)
        permanentWaterSurfaceElevationsInMeters[r * (xs.length - 1) + c] =
          Math.max(...levels);
    }
  return {
    roadDeckElevationsInMeters,
    permanentWaterSurfaceElevationsInMeters,
  };
}
