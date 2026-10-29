import type { TerrainGrid } from '@simulicity/hazards';
import type { Block, CityResponse, Point } from './city-types';
import { sampleTerrainHeight } from './terrain-view';

export interface WorldArea extends Block {
  kind: 'crop' | 'pasture' | 'expansion';
}
export interface WorldModel {
  seed: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  cityBounds: { width: number; height: number };
  seaLevel: number;
  lake: { center: Point; radiusX: number; radiusZ: number; level: number };
  terrainGrid: TerrainGrid;
  fields: WorldArea[];
  buildableAreas: WorldArea[];
}

/** Offline view model: neither the original city nor its simulation grid is modified. */
export function generateWorld(city: CityResponse, seed: number): WorldModel {
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295)
    throw new RangeError('World seed must be an unsigned 32-bit integer.');
  const w = city.config.widthInMeters,
    h = city.config.heightInMeters;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0)
    throw new RangeError('City extent must be finite and positive.');
  const bounds = { minX: -650, maxX: w + 700, minZ: -450, maxZ: h + 500 };
  const axis = (
    end: number,
    original: readonly number[] | undefined,
    lo: number,
    hi: number,
  ) => {
    const values = new Set<number>([0, end, ...(original ?? [])]);
    for (let n = lo; n < 0; n += 25) values.add(n);
    for (let n = end + 25; n < hi; n += 25) values.add(n);
    values.add(lo);
    values.add(hi);
    return [...values].sort((a, b) => a - b);
  };
  const xs = axis(w, city.terrainGrid?.xCoordinates, bounds.minX, bounds.maxX);
  const zs = axis(h, city.terrainGrid?.yCoordinates, bounds.minZ, bounds.maxZ);
  if (xs.length * zs.length > 60000)
    throw new RangeError('World grid exceeds the 60000 sample budget.');
  let hash = seed ^ 0x9e3779b9;
  hash = Math.imul(hash ^ (hash >>> 16), 0x21f0aaad);
  hash = Math.imul(hash ^ (hash >>> 15), 0x735a2d97);
  const phase = (((hash ^ (hash >>> 15)) >>> 0) / 4294967296) * Math.PI * 2;
  const seaLevel = city.terrain.elevationInMeters - 3;
  const lake = {
    center: {
      x: w + 275 + 20 * Math.sin(phase),
      y: h * 0.38 + 20 * Math.cos(phase),
    },
    radiusX: 105 + 8 * Math.cos(phase),
    radiusZ: 130 + 10 * Math.sin(phase),
    level: city.terrain.elevationInMeters + 1.5,
  };
  const smooth = (t: number) => {
    const v = Math.max(0, Math.min(1, t));
    return v * v * (3 - 2 * v);
  };
  const height = (x: number, z: number) => {
    const cx = Math.max(0, Math.min(w, x)),
      cz = Math.max(0, Math.min(h, z));
    const edge = sampleTerrainHeight(city, cx, cz);
    if (x === cx && z === cz) return edge;
    const distance = Math.hypot(x - cx, z - cz);
    let y =
      edge +
      2.5 *
        Math.sin(x / 170 + phase) *
        Math.sin(z / 210 + phase * 0.7) *
        smooth(distance / 180);
    if (x < 0) {
      const shore = -170 + 35 * Math.sin(z / 190 + phase);
      y =
        x <= shore
          ? seaLevel - Math.min(12, (shore - x) * 0.045)
          : seaLevel + (y - seaLevel) * smooth((x - shore) / -shore);
    }
    const q =
      ((x - lake.center.x) / lake.radiusX) ** 2 +
      ((z - lake.center.y) / lake.radiusZ) ** 2;
    if (q < 1.7) {
      const bowl = lake.level - 4 + 4 * q;
      const rim = Math.max(y, lake.level + 1);
      const blend = smooth((q - 1) / 0.7);
      y = bowl * (1 - blend) + rim * blend;
    }
    return y;
  };
  const fields: WorldArea[] = [];
  for (let row = 0; row < 2; row++)
    for (let column = 0; column < 3; column++) {
      const x = 50 + column * 170,
        z = h + 120 + row * 135;
      fields.push({
        id: `field-${row}-${column}`,
        kind: (seed + row + column) % 3 === 0 ? 'pasture' : 'crop',
        minCorner: { x, y: z },
        maxCorner: { x: x + 145, y: z + 105 },
      });
    }
  return {
    seed,
    bounds,
    cityBounds: { width: w, height: h },
    seaLevel,
    lake,
    terrainGrid: {
      source: 'procedural-world',
      xCoordinates: xs,
      yCoordinates: zs,
      elevationsInMeters: zs.map((z) => xs.map((x) => height(x, z))),
    },
    fields,
    buildableAreas: [
      {
        id: 'expansion-north-east',
        kind: 'expansion',
        minCorner: { x: w + 60, y: -230 },
        maxCorner: { x: w + 420, y: -80 },
      },
    ],
  };
}

/** The same triangle interpolation as the city, including negative world coordinates. */
export function sampleWorldHeight(
  world: WorldModel,
  x: number,
  z: number,
): number {
  return sampleTerrainHeight(
    {
      terrain: { elevationInMeters: world.seaLevel },
      terrainGrid: world.terrainGrid,
    },
    x,
    z,
  );
}
