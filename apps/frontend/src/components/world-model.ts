import type { TerrainGrid } from '@simulicity/hazards';
import type { Block, CityResponse, Point } from './city-types';
import { sampleTerrainHeight } from './terrain-view';

export interface WorldArea extends Block {
  kind: 'crop' | 'pasture' | 'orchard' | 'woodland' | 'expansion';
}
export interface WorldTree {
  position: Point;
  scale: number;
  variant: number;
}
export interface WorldPort {
  center: Point;
  berthCount: number;
  quayLength: number;
}
export interface WorldModel {
  seed: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  cityBounds: { width: number; height: number };
  seaLevel: number;
  lake: { center: Point; radiusX: number; radiusZ: number; level: number };
  terrainGrid: TerrainGrid;
  fields: WorldArea[];
  trees: WorldTree[];
  buildableAreas: WorldArea[];
  port: WorldPort;
  rail: { points: Point[] };
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
  const fieldDepth = 150,
    firstFieldX = 40,
    lastFieldX = bounds.maxX - 360 - 30,
    availableFieldSpan = lastFieldX - firstFieldX,
    columns = Math.max(2, Math.floor(availableFieldSpan / 360) + 1),
    columnStep = availableFieldSpan / (columns - 1),
    fieldWidth = Math.min(360, columnStep - 24);
  for (const [region, baseZ] of [
    ['north', bounds.minZ + 30],
    ['south', h + 40],
  ] as const)
    for (let row = 0; row < 2; row++)
      for (let column = 0; column < columns; column++) {
        const x = firstFieldX + column * columnStep,
          z = baseZ + row * (fieldDepth + 20),
          kind =
            (column + row * 2) % 4 === 1
              ? 'woodland'
              : (seed + row + column) % 4 === 0
                ? 'pasture'
                : (seed + column) % 5 === 0
                  ? 'orchard'
                  : 'crop';
        fields.push({
          id: `field-${region}-${row}-${column}`,
          kind,
          minCorner: { x, y: z },
          maxCorner: { x: x + fieldWidth, y: z + fieldDepth },
        });
      }
  const buildableAreas: WorldArea[] = [
    {
      id: 'expansion-north-east',
      kind: 'expansion',
      minCorner: { x: w + 60, y: -230 },
      maxCorner: { x: w + 420, y: -80 },
    },
  ];
  const fieldsWithoutConflicts = fields.filter(
    (field) =>
      !buildableAreas.some(
        (area) =>
          field.minCorner.x < area.maxCorner.x &&
          field.maxCorner.x > area.minCorner.x &&
          field.minCorner.y < area.maxCorner.y &&
          field.maxCorner.y > area.minCorner.y,
      ),
  );
  let treeState = (seed ^ 0xa511e9b3) >>> 0;
  const nextTreeRandom = () => {
    treeState = (Math.imul(treeState, 1664525) + 1013904223) >>> 0;
    return treeState / 4294967296;
  };
  const trees: WorldTree[] = [];
  for (const area of fieldsWithoutConflicts.filter(
    (field) => field.kind === 'woodland',
  ))
    for (let row = 0; row < 4; row++)
      for (let column = 0; column < 7; column++) {
        trees.push({
          position: {
            x:
              area.minCorner.x +
              18 +
              column * 45 +
              (nextTreeRandom() - 0.5) * 16,
            y: area.minCorner.y + 18 + row * 34 + (nextTreeRandom() - 0.5) * 14,
          },
          scale: 1.35 + nextTreeRandom() * 0.85,
          variant: Math.floor(nextTreeRandom() * 3),
        });
      }
  const port: WorldPort = {
    center: { x: -150, y: h * 0.5 },
    berthCount: 3 + (seed % 2),
    quayLength: 185 + (seed % 4) * 12,
  };
  const rail = {
    points: [
      { x: -270, y: port.center.y + 18 },
      { x: -190, y: port.center.y - 12 },
      { x: -90, y: port.center.y + 12 },
      { x: 0, y: port.center.y },
      { x: Math.min(180, w), y: port.center.y + 22 },
    ],
  };
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
    fields: fieldsWithoutConflicts,
    trees,
    port,
    rail,
    buildableAreas,
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
