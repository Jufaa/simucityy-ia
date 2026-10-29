import type { Block, CityResponse } from './city-types';
import { sampleTerrainHeight } from './terrain-view';
import { bridgeAtPoint } from './road-surface';
import { waterSurfaceAt } from './organic-city-model';

export type CityLifeKind =
  | 'car'
  | 'taxi'
  | 'van'
  | 'bus'
  | 'bus-stop'
  | 'traffic-light'
  | 'tree'
  | 'bin'
  | 'hydrant'
  | 'bollard'
  | 'utility-cabinet';
export interface CityLifeItem {
  kind: CityLifeKind;
  x: number;
  z: number;
  ground: number;
  rotation: number;
  length: number;
  width: number;
  bounds: Block;
  color: number;
}
export interface CityLifeModel {
  items: CityLifeItem[];
}

const overlaps = (a: Block, b: Block, gap = 0) =>
  a.minCorner.x < b.maxCorner.x + gap &&
  a.maxCorner.x > b.minCorner.x - gap &&
  a.minCorner.y < b.maxCorner.y + gap &&
  a.maxCorner.y > b.minCorner.y - gap;

/** Static view-only dressing. No road graph, citizen or persisted scenario changes. */
export function generateCityLife(city: CityResponse): CityLifeModel {
  const items: CityLifeItem[] = [];
  const district = city.district;
  if (!district) return { items };
  const bridgeRoadIds = new Set(
    city.organic?.bridges.flatMap((bridge) => bridge.roadIds),
  );
  const roads = city.roads.filter((road) => !bridgeRoadIds.has(road.id));
  let state = (city.config.seed ?? 1) >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const blocked = [
    ...city.buildings,
    ...district.parks,
    ...(district.urban?.parkPaths ?? []),
    ...(district.urban?.yards ?? []),
    ...(district.urban?.streetDetails.filter(
      (p) => p.kind === 'crosswalk' || p.kind === 'building-access',
    ) ?? []),
  ];
  const roadHalf = district.roadWidthInMeters / 2;
  const nodes = city.roadGraph?.nodes ?? [];
  const add = (
    kind: CityLifeKind,
    x: number,
    z: number,
    rotation: number,
    length: number,
    width: number,
    color = 0x4d687b,
  ) => {
    const hx =
      (Math.abs(Math.cos(rotation)) * length +
        Math.abs(Math.sin(rotation)) * width) /
      2;
    const hz =
      (Math.abs(Math.sin(rotation)) * length +
        Math.abs(Math.cos(rotation)) * width) /
      2;
    const bounds: Block = {
      id: `city-life-${items.length}`,
      minCorner: { x: x - hx, y: z - hz },
      maxCorner: { x: x + hx, y: z + hz },
    };
    if (
      (city.organic !== undefined &&
        (bridgeAtPoint(city, x, z) !== undefined ||
          waterSurfaceAt(city.organic, { x, y: z }) !== undefined ||
          sampleTerrainHeight(city, x, z) <= city.organic.lake.level)) ||
      items.length >= 600 ||
      bounds.minCorner.x < 0 ||
      bounds.minCorner.y < 0 ||
      bounds.maxCorner.x > city.config.widthInMeters ||
      bounds.maxCorner.y > city.config.heightInMeters ||
      blocked.some((b) => overlaps(bounds, b, kind === 'tree' ? 1 : 0.7)) ||
      items.some((p) => overlaps(bounds, p.bounds, 0.15))
    )
      return;
    if (
      district.urban?.amenities.some(
        (p) =>
          Math.hypot(x - p.position.x, z - p.position.y) <
          p.radiusInMeters + Math.max(length, width) / 2 + 1,
      )
    )
      return;
    items.push({
      kind,
      x,
      z,
      ground: sampleTerrainHeight(city, x, z),
      rotation,
      length,
      width,
      bounds,
      color,
    });
  };
  for (const road of roads) {
    if (items.length >= 600) break;
    const dx = road.end.x - road.start.x,
      dz = road.end.y - road.start.y;
    const distance = Math.hypot(dx, dz);
    if (distance < 20 || !Number.isFinite(distance)) continue;
    const ux = dx / distance,
      uz = dz / distance,
      rotation = -Math.atan2(dz, dx);
    const position = (t: number, offset: number) => ({
      x: road.start.x + ux * t - uz * offset,
      z: road.start.y + uz * t + ux * offset,
    });
    // Perpendicular road approaches reserve intersections even without graph metadata.
    const nearJunction = (x: number, z: number, radius: number) =>
      nodes.some((n) => Math.hypot(x - n.x, z - n.y) < radius) ||
      city.roads.some((other) => {
        if (other === road) return false;
        const ox = other.end.x - other.start.x,
          oz = other.end.y - other.start.y,
          len2 = ox * ox + oz * oz;
        if (!len2 || Math.abs(ux * oz - uz * ox) / Math.sqrt(len2) < 0.3)
          return false;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((x - other.start.x) * ox + (z - other.start.y) * oz) / len2,
          ),
        );
        return (
          Math.hypot(x - other.start.x - t * ox, z - other.start.y - t * oz) <
          radius
        );
      });
    for (const side of [-1, 1]) {
      for (
        let t = 12 + random() * 4;
        t < distance - 10 && items.length < 600;
        t += 15 + random() * 6
      ) {
        const p = position(t, side * (roadHalf - 1.05));
        if (roadHalf < 2.75 || nearJunction(p.x, p.z, 12)) continue;
        const choice = random();
        const kind =
          choice < 0.05
            ? 'bus'
            : choice < 0.22
              ? 'van'
              : choice < 0.42
                ? 'taxi'
                : 'car';
        const length = kind === 'bus' ? 9 : kind === 'van' ? 5.2 : 4.2;
        if (t < length / 2 + 8 || t > distance - length / 2 - 8) continue;
        add(
          kind,
          p.x,
          p.z,
          rotation + (side < 0 ? Math.PI : 0),
          length,
          kind === 'bus' ? 1.95 : 1.75,
          kind === 'taxi'
            ? 0xe5b83b
            : kind === 'bus'
              ? 0x297c92
              : kind === 'van'
                ? 0xe5dfcb
                : [0x7d4142, 0x567386, 0xc5c7bd, 0x46635c][
                    Math.floor(random() * 4)
                  ]!,
        );
      }
      if (district.sidewalkWidthInMeters < 2) continue;
      let slot = 0;
      for (let t = 14; t < distance - 12 && items.length < 600; t += 17) {
        const p = position(t, side * (roadHalf + 0.35));
        if (nearJunction(p.x, p.z, 9)) continue;
        const kinds = [
          'bus-stop',
          'tree',
          'bin',
          'hydrant',
          'tree',
          'bollard',
          'utility-cabinet',
        ] as const;
        const kind = kinds[slot++ % kinds.length]!;
        add(kind, p.x, p.z, rotation, kind === 'bus-stop' ? 0.5 : 0.55, 0.6);
      }
    }
  }
  if (district.sidewalkWidthInMeters >= 2)
    for (const node of nodes) {
      if (
        node.x < 10 ||
        node.y < 10 ||
        node.x > city.config.widthInMeters - 10 ||
        node.y > city.config.heightInMeters - 10
      )
        continue;
      const directions = new Set<string>();
      for (const road of roads) {
        const dx = road.end.x - road.start.x,
          dz = road.end.y - road.start.y,
          l2 = dx * dx + dz * dz;
        if (!l2) continue;
        const t =
          ((node.x - road.start.x) * dx + (node.y - road.start.y) * dz) / l2;
        if (
          t < 0 ||
          t > 1 ||
          Math.hypot(
            node.x - road.start.x - t * dx,
            node.y - road.start.y - t * dz,
          ) > 0.1
        )
          continue;
        if (t > 0.001)
          directions.add(`${Math.round(Math.atan2(-dz, -dx) * 100)}`);
        if (t < 0.999)
          directions.add(`${Math.round(Math.atan2(dz, dx) * 100)}`);
      }
      if (directions.size >= 3)
        for (const side of [-1, 1])
          add(
            'traffic-light',
            node.x + side * (roadHalf + 0.35),
            node.y + (roadHalf + 0.35),
            0,
            0.55,
            0.6,
          );
    }
  return { items };
}
