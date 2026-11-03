import { createCityRandom } from './random-city-profile';
import type {
  Block,
  Building,
  CityResponse,
  Point,
  RealCityMetadata,
  Road,
  RoadProfile,
} from './city-types';
import type { RoadEdge } from '@simulicity/hazards';

/**
 * Pure converter from real geographic data (OpenStreetMap ways with geometry
 * plus a sampled DEM grid) into the existing CityResponse contract consumed by
 * the renderer, flood solver and evacuation engine. No network access here:
 * scripts/import-real-city.mjs downloads and samples the sources, this module
 * only validates, projects and converts. External data is never mutated.
 */

export interface OsmGeometryPoint {
  lat: number;
  lon: number;
}

export interface OsmWayInput {
  type: 'way';
  id: number;
  tags?: Record<string, string>;
  geometry?: OsmGeometryPoint[];
}

export interface OsmRelationInput {
  type: 'relation';
  id: number;
  tags?: Record<string, string>;
  members?: {
    type: string;
    role?: string;
    geometry?: OsmGeometryPoint[];
  }[];
}

export type OsmElementInput = OsmWayInput | OsmRelationInput;

export interface RealCitySource {
  name: string;
  bbox: { south: number; west: number; north: number; east: number };
  osmTimestamp?: string;
  elements: OsmElementInput[];
  dem: {
    source: string;
    xCoordinates: number[];
    yCoordinates: number[];
    /** Rows follow yCoordinates ascending (south to north). */
    elevationsInMeters: number[][];
  };
}

export interface RealCityOptions {
  seed?: number;
  citizenCount?: number;
}

const EARTH_METERS_PER_DEGREE_LAT = (phi: number) =>
  111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
const EARTH_METERS_PER_DEGREE_LON = (phi: number) =>
  111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);

/** Maximum imported extent per side; keeps the flood grid and graph bounded. */
export const MAX_REAL_CITY_SIZE_IN_METERS = 3000;

/** Projected local extent of a bbox under the same approximation as the converter. */
export function projectedExtentInMeters(bbox: RealCitySource['bbox']): {
  widthInMeters: number;
  heightInMeters: number;
} {
  const centerLat = ((bbox.south + bbox.north) / 2) * (Math.PI / 180);
  return {
    widthInMeters:
      (bbox.east - bbox.west) * EARTH_METERS_PER_DEGREE_LON(centerLat),
    heightInMeters:
      (bbox.north - bbox.south) * EARTH_METERS_PER_DEGREE_LAT(centerLat),
  };
}

const MOTOR_ROAD_WIDTHS: Record<string, { width: number; sidewalk: number }> =
  {};
for (const kind of ['motorway', 'trunk', 'primary', 'secondary'])
  MOTOR_ROAD_WIDTHS[kind] = { width: 12, sidewalk: 3 };

function roadProfileFor(highway: string): RoadProfile | null {
  const base = highway.replace(/_link$/, '');
  if (MOTOR_ROAD_WIDTHS[base])
    return {
      kind: 'avenue',
      widthInMeters: MOTOR_ROAD_WIDTHS[base]!.width,
      sidewalkWidthInMeters: MOTOR_ROAD_WIDTHS[base]!.sidewalk,
      motorVehiclesAllowed: true,
    };
  if (
    ['tertiary', 'unclassified', 'residential', 'living_street'].includes(base)
  )
    return {
      kind: 'local',
      widthInMeters: 8,
      sidewalkWidthInMeters: 2,
      motorVehiclesAllowed: true,
    };
  if (base === 'service')
    return {
      kind: 'local',
      widthInMeters: 6,
      sidewalkWidthInMeters: 1,
      motorVehiclesAllowed: true,
    };
  if (
    ['footway', 'path', 'pedestrian', 'cycleway', 'steps', 'track'].includes(
      base,
    )
  )
    return {
      kind: 'alley',
      widthInMeters: 4,
      sidewalkWidthInMeters: 1,
      motorVehiclesAllowed: false,
    };
  return null;
}

const COMMERCIAL_BUILDINGS = new Set([
  'retail',
  'commercial',
  'office',
  'supermarket',
  'kiosk',
  'hotel',
]);

function hashId(value: number): number {
  let state = 2166136261;
  const text = String(value);
  for (let i = 0; i < text.length; i++)
    state = Math.imul(state ^ text.charCodeAt(i), 16777619);
  return state >>> 0;
}

function polygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const unique = sorted.filter(
    (p, i) => i === 0 || p.x !== sorted[i - 1]!.x || p.y !== sorted[i - 1]!.y,
  );
  if (unique.length <= 2) return unique;
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of unique) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i]!;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

interface OrientedRect {
  center: Point;
  widthInMeters: number;
  depthInMeters: number;
  /** Long-axis angle in local x/y coordinates. */
  angleInRadians: number;
}

/** Minimum-area oriented rectangle containing the polygon (rotating calipers). */
function orientedBoundingRect(polygon: Point[]): OrientedRect | null {
  const hull = convexHull(polygon);
  if (hull.length < 2) return null;
  if (hull.length === 2) {
    const [a, b] = hull as [Point, Point];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) return null;
    return {
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      widthInMeters: length,
      depthInMeters: 0.1,
      angleInRadians: Math.atan2(b.y - a.y, b.x - a.x),
    };
  }
  let best: OrientedRect | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let minU = Infinity,
      maxU = -Infinity,
      minV = Infinity,
      maxV = -Infinity;
    for (const p of hull) {
      const u = p.x * cos + p.y * sin;
      const v = -p.x * sin + p.y * cos;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const width = maxU - minU;
    const depth = maxV - minV;
    const area = width * depth;
    if (area >= bestArea) continue;
    bestArea = area;
    const cu = (minU + maxU) / 2;
    const cv = (minV + maxV) / 2;
    best = {
      center: { x: cu * cos - cv * sin, y: cu * sin + cv * cos },
      widthInMeters: Math.max(width, depth),
      depthInMeters: Math.min(width, depth),
      // Width is the long axis; flip the frame when depth was the long side.
      angleInRadians: width >= depth ? angle : angle + Math.PI / 2,
    };
  }
  return best;
}

/**
 * Stitches relation member fragments into closed rings by matching endpoints
 * (members may arrive reversed or unordered). Open chains are dropped.
 */
export function joinSegments(segments: Point[][]): Point[][] {
  const same = (a: Point, b: Point) =>
    Math.abs(a.x - b.x) < 1e-4 && Math.abs(a.y - b.y) < 1e-4;
  const pending = segments
    .filter((segment) => segment.length >= 2)
    .map((segment) => [...segment]);
  const rings: Point[][] = [];
  while (pending.length) {
    const chain = pending.shift()!;
    let extended = true;
    while (!same(chain[0]!, chain[chain.length - 1]!) && extended) {
      extended = false;
      for (let i = 0; i < pending.length; i++) {
        const segment = pending[i]!;
        const head = chain[0]!;
        const tail = chain[chain.length - 1]!;
        if (same(tail, segment[0]!)) {
          chain.push(...segment.slice(1));
        } else if (same(tail, segment[segment.length - 1]!)) {
          chain.push(...[...segment].reverse().slice(1));
        } else if (same(head, segment[segment.length - 1]!)) {
          chain.unshift(...segment.slice(0, -1));
        } else if (same(head, segment[0]!)) {
          chain.unshift(...[...segment].reverse().slice(0, -1));
        } else {
          continue;
        }
        pending.splice(i, 1);
        extended = true;
        break;
      }
    }
    if (chain.length >= 4 && same(chain[0]!, chain[chain.length - 1]!))
      rings.push(chain);
  }
  return rings;
}

/** Liang-Barsky clip of a segment to the city rectangle; null when outside. */
function clipSegment(
  a: Point,
  b: Point,
  width: number,
  height: number,
): [Point, Point] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x, width - a.x, a.y, height - a.y];
  for (let i = 0; i < 4; i++) {
    const pi = p[i]!;
    const qi = q[i]!;
    if (pi === 0) {
      if (qi < 0) return null;
      continue;
    }
    const r = qi / pi;
    if (pi < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [
    { x: a.x + t0 * dx, y: a.y + t0 * dy },
    { x: a.x + t1 * dx, y: a.y + t1 * dy },
  ];
}

export function createRealCity(
  source: RealCitySource,
  options: RealCityOptions = {},
): { city: CityResponse; metadata: RealCityMetadata } {
  const { bbox } = source;
  if (
    !Number.isFinite(bbox.south) ||
    !Number.isFinite(bbox.west) ||
    !Number.isFinite(bbox.north) ||
    !Number.isFinite(bbox.east) ||
    bbox.north <= bbox.south ||
    bbox.east <= bbox.west
  )
    throw new RangeError('Real city bbox must be finite and increasing.');
  const centerLat = ((bbox.south + bbox.north) / 2) * (Math.PI / 180);
  const metersPerDegreeLat = EARTH_METERS_PER_DEGREE_LAT(centerLat);
  const metersPerDegreeLon = EARTH_METERS_PER_DEGREE_LON(centerLat);
  const width = (bbox.east - bbox.west) * metersPerDegreeLon;
  const height = (bbox.north - bbox.south) * metersPerDegreeLat;
  if (
    width > MAX_REAL_CITY_SIZE_IN_METERS ||
    height > MAX_REAL_CITY_SIZE_IN_METERS
  )
    throw new RangeError(
      `Real city extent must fit ${MAX_REAL_CITY_SIZE_IN_METERS} m per side; got ${Math.round(width)} x ${Math.round(height)} m.`,
    );
  const project = (point: OsmGeometryPoint): Point => ({
    x: (point.lon - bbox.west) * metersPerDegreeLon,
    y: (point.lat - bbox.south) * metersPerDegreeLat,
  });

  // DEM axes must span the projected extent so solver and renderer agree.
  const { dem } = source;
  const xs = dem.xCoordinates;
  const ys = dem.yCoordinates;
  if (
    xs.length < 2 ||
    ys.length < 2 ||
    dem.elevationsInMeters.length !== ys.length ||
    dem.elevationsInMeters.some((row) => row.length !== xs.length) ||
    xs.some(
      (value, i) => !Number.isFinite(value) || (i > 0 && value <= xs[i - 1]!),
    ) ||
    ys.some(
      (value, i) => !Number.isFinite(value) || (i > 0 && value <= ys[i - 1]!),
    ) ||
    Math.abs(xs[0]!) > 1.5 ||
    Math.abs(ys[0]!) > 1.5 ||
    Math.abs(xs.at(-1)! - width) > 1.5 ||
    Math.abs(ys.at(-1)! - height) > 1.5
  )
    throw new RangeError(
      'DEM grid must be monotonic, match the bbox extent and provide one elevation per axis pair.',
    );
  const elevations = dem.elevationsInMeters;
  if (elevations.flat().some((value) => !Number.isFinite(value)))
    throw new RangeError('DEM elevations must be finite.');
  const sampleElevation = (x: number, y: number): number => {
    const locate = (axis: number[], value: number) => {
      const clamped = Math.max(axis[0]!, Math.min(axis.at(-1)!, value));
      let i = 0;
      while (i < axis.length - 2 && axis[i + 1]! < clamped) i++;
      return { i, t: (clamped - axis[i]!) / (axis[i + 1]! - axis[i]!) };
    };
    const { i: c, t: u } = locate(xs, x);
    const { i: r, t: v } = locate(ys, y);
    const a = elevations[r]![c]!;
    const b = elevations[r]![c + 1]!;
    const d = elevations[r + 1]![c]!;
    const e = elevations[r + 1]![c + 1]!;
    return a + (b - a) * u + (d - a) * v + (a - b - d + e) * u * v;
  };
  const minElevation = Math.min(...elevations.flat());
  // Nominal spacing: the first interval (the last one may be clipped short).
  const cellSizeInMeters = xs.length > 1 ? xs[1]! - xs[0]! : 0;
  // The simulation domain is the DEM grid itself: rounded grid axes can end
  // a few centimetres inside the projected bbox, and graph nodes clipped to
  // the projection would fall outside the grid the solver validates against.
  const extentX = xs[xs.length - 1]!;
  const extentY = ys[ys.length - 1]!;

  const elements = [...source.elements].sort((a, b) => a.id - b.id);

  // Roads and the routing graph share one segment per OSM way interval.
  const nodes: (Point & { id: string })[] = [];
  const nodeIdByKey = new Map<string, string>();
  const nodeFor = (point: Point): (typeof nodes)[number] => {
    const key = `${Math.round(point.x * 10)},${Math.round(point.y * 10)}`;
    const existing = nodeIdByKey.get(key);
    if (existing) return nodes.find((node) => node.id === existing)!;
    const node = { x: point.x, y: point.y, id: `real-node-${nodes.length}` };
    nodes.push(node);
    nodeIdByKey.set(key, node.id);
    return node;
  };
  const roads: Road[] = [];
  const edges: RoadEdge[] = [];
  const edgeKeys = new Set<string>();
  for (const element of elements) {
    if (element.type !== 'way') continue;
    const highway = element.tags?.highway;
    if (!highway || !element.geometry || element.geometry.length < 2) continue;
    const profile = roadProfileFor(highway);
    if (!profile) continue;
    const projected = element.geometry.map(project);
    for (let i = 1; i < projected.length; i++) {
      const clipped = clipSegment(
        projected[i - 1]!,
        projected[i]!,
        extentX,
        extentY,
      );
      if (!clipped) continue;
      const [start, end] = clipped;
      if (Math.hypot(end.x - start.x, end.y - start.y) < 0.5) continue;
      const from = nodeFor(start);
      const to = nodeFor(end);
      if (from.id === to.id) continue;
      const edgeKey = [from.id, to.id].sort().join('|');
      if (edgeKeys.has(edgeKey)) continue;
      edgeKeys.add(edgeKey);
      const road: Road = {
        id: `real-road-${roads.length}`,
        start: { x: from.x, y: from.y },
        end: { x: to.x, y: to.y },
        profile: { ...profile },
      };
      roads.push(road);
      edges.push({
        id: `real-edge-${edges.length}`,
        roadId: road.id,
        from: from.id,
        to: to.id,
        lengthInMeters: Math.hypot(to.x - from.x, to.y - from.y),
        bidirectional: true,
      });
    }
  }
  if (!edges.length)
    throw new RangeError('Real city source contains no usable road segments.');
  const usedNodeIds = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const graphNodes = nodes.filter((node) => usedNodeIds.has(node.id));

  // Footprint shapes come from building/park ways and from multipolygon
  // relations (churches, stations, perimeter blocks): relation members are
  // stitched into rings, inner members become courtyard holes. Hazard and
  // routing keep the conservative rotated rectangle; the exact ring is kept
  // as rendering metadata so complex buildings draw with their real shape.
  interface FootprintShape {
    ring: Point[];
    holes: Point[][];
    tags: Record<string, string>;
    osmId: number;
  }
  const shapes: FootprintShape[] = [];
  for (const element of elements) {
    const tags = element.tags ?? {};
    const isPark =
      tags.leisure === 'park' ||
      tags.leisure === 'garden' ||
      ['grass', 'meadow', 'recreation_ground', 'village_green'].includes(
        tags.landuse ?? '',
      );
    const isBuilding = tags.building !== undefined && tags.building !== 'no';
    if (!isBuilding && !isPark) continue;
    if (element.type === 'way') {
      if (!element.geometry) continue;
      const ring = element.geometry.map(project);
      if (
        ring.length > 1 &&
        (Math.abs(ring[0]!.x - ring.at(-1)!.x) > 1e-6 ||
          Math.abs(ring[0]!.y - ring.at(-1)!.y) > 1e-6)
      )
        ring.push({ ...ring[0]! });
      if (ring.length >= 4)
        shapes.push({ ring, holes: [], tags, osmId: element.id });
      continue;
    }
    const memberSegments = (role: 'outer' | 'inner') =>
      (element.members ?? [])
        .filter(
          (member) =>
            member.type === 'way' &&
            (role === 'outer'
              ? member.role === 'outer' || !member.role
              : member.role === 'inner') &&
            member.geometry,
        )
        .map((member) => member.geometry!.map(project));
    const holes = joinSegments(memberSegments('inner'));
    for (const ring of joinSegments(memberSegments('outer')))
      shapes.push({
        ring,
        // Inner rings usually belong to the single outer ring; assigning them
        // to every outer of a multi-outer relation is a documented approx.
        holes,
        tags,
        osmId: element.id + 1_000_000_000,
      });
  }
  shapes.sort((a, b) => a.osmId - b.osmId);
  const buildings: Building[] = [];
  let measuredBuildingHeights = 0;
  let estimatedBuildingHeights = 0;
  const parks: Block[] = [];
  for (const shape of shapes) {
    const tags = shape.tags;
    const isPark =
      tags.leisure === 'park' ||
      tags.leisure === 'garden' ||
      ['grass', 'meadow', 'recreation_ground', 'village_green'].includes(
        tags.landuse ?? '',
      );
    const polygon = shape.ring.slice(0, -1);
    if (isPark) {
      const parkXs = polygon.map((p) => p.x);
      const parkYs = polygon.map((p) => p.y);
      parks.push({
        id: `real-park-${parks.length}`,
        minCorner: { x: Math.min(...parkXs), y: Math.min(...parkYs) },
        maxCorner: { x: Math.max(...parkXs), y: Math.max(...parkYs) },
      });
      continue;
    }
    if (Math.abs(polygonArea(polygon)) < 10) continue;
    const rect = orientedBoundingRect(polygon);
    if (!rect || rect.widthInMeters < 2 || rect.depthInMeters < 1) continue;
    const cos = Math.cos(rect.angleInRadians);
    const sin = Math.sin(rect.angleInRadians);
    const hx =
      (Math.abs(cos) * rect.widthInMeters +
        Math.abs(sin) * rect.depthInMeters) /
      2;
    const hz =
      (Math.abs(sin) * rect.widthInMeters +
        Math.abs(cos) * rect.depthInMeters) /
      2;
    const minCorner = { x: rect.center.x - hx, y: rect.center.y - hz };
    const maxCorner = { x: rect.center.x + hx, y: rect.center.y + hz };
    if (
      maxCorner.x < 0 ||
      maxCorner.y < 0 ||
      minCorner.x > extentX ||
      minCorner.y > extentY
    )
      continue;
    let heightInMeters: number;
    const taggedHeight = Number.parseFloat(tags.height ?? '');
    const taggedLevels = Number.parseFloat(tags['building:levels'] ?? '');
    if (
      Number.isFinite(taggedHeight) &&
      taggedHeight >= 2 &&
      taggedHeight <= 200
    ) {
      heightInMeters = taggedHeight;
      measuredBuildingHeights++;
    } else if (
      Number.isFinite(taggedLevels) &&
      taggedLevels >= 1 &&
      taggedLevels <= 60
    ) {
      heightInMeters = taggedLevels * 3;
      measuredBuildingHeights++;
    } else {
      // Deterministic estimate by OSM id; metadata counts these as inferred.
      const floors =
        tags.building === 'house' || tags.building === 'detached'
          ? 2
          : 2 + (hashId(shape.osmId) % 5);
      heightInMeters = floors * 3;
      estimatedBuildingHeights++;
    }
    const floors = Math.max(1, Math.round(heightInMeters / 3));
    const commercial = COMMERCIAL_BUILDINGS.has(tags.building ?? '');
    buildings.push({
      id: `real-building-${buildings.length}`,
      minCorner,
      maxCorner,
      heightInMeters,
      presentation: {
        widthInMeters: rect.widthInMeters,
        depthInMeters: rect.depthInMeters,
        yawInRadians: -rect.angleInRadians,
      },
      use: commercial ? 'commercial' : 'residential',
      footprint: polygon.map((point) => ({ ...point })),
      ...(shape.holes.length
        ? {
            footprintHoles: shape.holes
              .map((hole) => hole.slice(0, -1).map((point) => ({ ...point })))
              .filter((hole) => hole.length >= 3),
          }
        : {}),
      architecture: {
        style: commercial ? 'shop' : floors >= 4 ? 'apartment' : 'house',
        floors,
        roof: commercial || floors >= 4 ? 'flat' : 'gable',
        roofRiseInMeters: commercial || floors >= 4 ? 0 : 2,
        facade: commercial ? 'brick' : floors >= 4 ? 'stone' : 'sand',
        entranceSide: 'south',
        balconyDepthInMeters: floors >= 4 ? 0.6 : 0,
      },
    });
  }
  if (!buildings.length)
    throw new RangeError('Real city source contains no usable buildings.');

  const seed = options.seed ?? 42;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new RangeError('Real city seed must be an unsigned 32-bit integer.');
  const citizenCount = Math.max(
    0,
    Math.min(2000, Math.floor(options.citizenCount ?? 200)),
  );
  const random = createCityRandom(seed);
  const residential = buildings.filter((b) => b.use === 'residential');
  const homes = residential.length ? residential : buildings;
  const citizens = Array.from({ length: citizenCount }, (_, i) => {
    const home = homes[i % homes.length]!;
    const position = {
      x: (home.minCorner.x + home.maxCorner.x) / 2,
      y: (home.minCorner.y + home.maxCorner.y) / 2,
    };
    let nearest = graphNodes[0]!;
    let nearestDistance = Infinity;
    for (const node of graphNodes) {
      const distance = Math.hypot(node.x - position.x, node.y - position.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = node;
      }
    }
    return {
      id: `real-citizen-${i}`,
      homeBuildingId: home.id,
      nodeId: nearest.id,
      position,
      mobilityFactor: 0.8 + random() * 0.2,
      reactionDelayInSeconds: random() * 12,
    };
  });

  // Shelters sit on the highest reachable nodes, spaced across the district.
  const shelters: CityResponse['shelters'] = [];
  const byElevation = [...graphNodes].sort(
    (a, b) =>
      sampleElevation(b.x, b.y) - sampleElevation(a.x, a.y) ||
      (a.id < b.id ? -1 : 1),
  );
  for (const node of byElevation) {
    if (shelters.length >= 3) break;
    if (
      shelters.some((shelter) => {
        const other = graphNodes.find((n) => n.id === shelter.nodeId)!;
        return Math.hypot(node.x - other.x, node.y - other.y) < 200;
      })
    )
      continue;
    shelters.push({
      id: `real-shelter-${shelters.length}`,
      nodeId: node.id,
      active: true,
      capacity: Math.max(200, citizenCount),
    });
  }

  const metadata: RealCityMetadata = {
    name: source.name,
    bbox: { ...bbox },
    attribution:
      '© OpenStreetMap contributors (ODbL) · Elevation: Terrarium tiles (Mapzen/AWS Terrain Tiles)',
    ...(source.osmTimestamp ? { osmTimestamp: source.osmTimestamp } : {}),
    demSource: dem.source,
    demCellSizeInMeters: Math.round(cellSizeInMeters * 10) / 10,
    measuredBuildingHeights,
    estimatedBuildingHeights,
  };

  const city: CityResponse = {
    config: {
      widthInMeters: Math.round(extentX * 10) / 10,
      heightInMeters: Math.round(extentY * 10) / 10,
      streetSpacingInMeters: 0,
      seed,
    },
    terrain: {
      kind: 'flat',
      elevationInMeters: Math.round(minElevation * 10) / 10,
    },
    roads,
    blocks: buildings.map((building) => ({
      id: `lot-${building.id}`,
      minCorner: { ...building.minCorner },
      maxCorner: { ...building.maxCorner },
    })),
    buildings,
    district: {
      roadWidthInMeters: 8,
      sidewalkWidthInMeters: 2,
      parks,
      sidewalks: [],
      urban: { yards: [], parkPaths: [], amenities: [], streetDetails: [] },
    },
    terrainGrid: {
      xCoordinates: [...xs],
      yCoordinates: [...ys],
      elevationsInMeters: elevations.map((row) => [...row]),
      source: dem.source,
    },
    roadGraph: { nodes: graphNodes, edges },
    citizens,
    shelters,
    real: metadata,
  };
  return { city, metadata };
}
