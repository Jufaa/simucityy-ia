import { createCityRandom } from './random-city-profile';
import { getRoadProfile } from './road-profile';
import type {
  Block,
  Building,
  BuildingPart,
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
  /**
   * Opt-in visual filler: deterministic synthetic houses along streets where
   * the source has no buildings. Counted separately in metadata and flagged
   * per building; never presented as real data.
   */
  infillSyntheticHouses?: boolean;
}

const RELIGIOUS_BUILDINGS = new Set([
  'church',
  'cathedral',
  'chapel',
  'basilica',
  'temple',
  'mosque',
  'synagogue',
  'monastery',
]);

export type LandmarkKind = 'religious' | 'health' | 'stadium' | 'civic';

/** Standout buildings (landmarks) render exact and 1:1 where data allows. */
export function landmarkKindFor(
  tags: Record<string, string>,
): LandmarkKind | undefined {
  if (
    RELIGIOUS_BUILDINGS.has(tags.building ?? '') ||
    tags.amenity === 'place_of_worship'
  )
    return 'religious';
  if (
    ['hospital', 'clinic', 'doctors', 'dentists'].includes(
      tags.amenity ?? '',
    ) ||
    tags.building === 'hospital'
  )
    return 'health';
  if (tags.leisure === 'stadium' || tags.building === 'stadium')
    return 'stadium';
  if (
    ['townhall', 'theatre', 'arts_centre', 'courthouse', 'library'].includes(
      tags.amenity ?? '',
    ) ||
    ['townhall', 'civic', 'theatre', 'museum', 'train_station'].includes(
      tags.building ?? '',
    ) ||
    ['museum', 'gallery', 'attraction'].includes(tags.tourism ?? '') ||
    ['castle', 'monument', 'ruins', 'fort'].includes(tags.historic ?? '')
  )
    return 'civic';
  return undefined;
}

function pointInPolygon(point: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
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

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t =
    length === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length),
        );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

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

/** Sutherland-Hodgman clip of a polygon to the city rectangle. */
function clipPolygonToExtent(
  polygon: Point[],
  extentX: number,
  extentY: number,
): Point[] {
  const edges: {
    inside: (p: Point) => boolean;
    intersect: (a: Point, b: Point) => Point;
  }[] = [
    {
      inside: (p) => p.x >= 0,
      intersect: (a, b) => ({
        x: 0,
        y: a.y + ((b.y - a.y) * (0 - a.x)) / (b.x - a.x),
      }),
    },
    {
      inside: (p) => p.x <= extentX,
      intersect: (a, b) => ({
        x: extentX,
        y: a.y + ((b.y - a.y) * (extentX - a.x)) / (b.x - a.x),
      }),
    },
    {
      inside: (p) => p.y >= 0,
      intersect: (a, b) => ({
        x: a.x + ((b.x - a.x) * (0 - a.y)) / (b.y - a.y),
        y: 0,
      }),
    },
    {
      inside: (p) => p.y <= extentY,
      intersect: (a, b) => ({
        x: a.x + ((b.x - a.x) * (extentY - a.y)) / (b.y - a.y),
        y: extentY,
      }),
    },
  ];
  let output = polygon;
  for (const edge of edges) {
    const input = output;
    output = [];
    for (let k = 0; k < input.length; k++) {
      const current = input[k]!;
      const previous = input[(k + input.length - 1) % input.length]!;
      if (edge.inside(current)) {
        if (!edge.inside(previous))
          output.push(edge.intersect(previous, current));
        output.push(current);
      } else if (edge.inside(previous)) {
        output.push(edge.intersect(previous, current));
      }
    }
    if (output.length === 0) break;
  }
  return output;
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
    // building:part elements are 3D detail of a parent building, never
    // standalone buildings; they are collected separately below.
    if (tags['building:part'] !== undefined) continue;
    const isLandmarkShape = landmarkKindFor(tags) !== undefined;
    if (!isBuilding && !isPark && !isLandmarkShape) continue;
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
    // Nothing may render outside the selected square: footprints that
    // cross its border are clipped to it instead of sticking out.
    const polygon = clipPolygonToExtent(
      shape.ring.slice(0, -1),
      extentX,
      extentY,
    );
    if (isPark) {
      if (polygon.length < 3) continue;
      const parkXs = polygon.map((p) => p.x);
      const parkYs = polygon.map((p) => p.y);
      parks.push({
        id: `real-park-${parks.length}`,
        minCorner: { x: Math.min(...parkXs), y: Math.min(...parkYs) },
        maxCorner: { x: Math.max(...parkXs), y: Math.max(...parkYs) },
      });
      continue;
    }
    if (polygon.length < 3 || Math.abs(polygonArea(polygon)) < 10) continue;
    let rect = orientedBoundingRect(polygon);
    if (!rect || rect.widthInMeters < 2 || rect.depthInMeters < 1) continue;
    // A rotated containing rectangle can still poke past the square near
    // its edges; fall back to the axis-aligned bounds of the clipped
    // footprint so the rendered box stays inside too.
    {
      const cos0 = Math.cos(rect.angleInRadians);
      const sin0 = Math.sin(rect.angleInRadians);
      const hx0 =
        (Math.abs(cos0) * rect.widthInMeters +
          Math.abs(sin0) * rect.depthInMeters) /
        2;
      const hz0 =
        (Math.abs(sin0) * rect.widthInMeters +
          Math.abs(cos0) * rect.depthInMeters) /
        2;
      if (
        rect.center.x - hx0 < -0.01 ||
        rect.center.y - hz0 < -0.01 ||
        rect.center.x + hx0 > extentX + 0.01 ||
        rect.center.y + hz0 > extentY + 0.01
      ) {
        const xs = polygon.map((point) => point.x);
        const ys = polygon.map((point) => point.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        rect = {
          center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
          widthInMeters: maxX - minX,
          depthInMeters: maxY - minY,
          angleInRadians: 0,
        };
        if (rect.widthInMeters < 2 || rect.depthInMeters < 1) continue;
      }
    }
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
    let heightMeasured = false;
    const taggedHeight = Number.parseFloat(tags.height ?? '');
    const taggedLevels = Number.parseFloat(tags['building:levels'] ?? '');
    if (
      Number.isFinite(taggedHeight) &&
      taggedHeight >= 2 &&
      taggedHeight <= 200
    ) {
      heightInMeters = taggedHeight;
      heightMeasured = true;
    } else if (
      Number.isFinite(taggedLevels) &&
      taggedLevels >= 1 &&
      taggedLevels <= 60
    ) {
      heightInMeters = taggedLevels * 3;
      heightMeasured = true;
    } else {
      // Deterministic estimate by OSM id; metadata counts these as inferred.
      const floors =
        tags.building === 'house' || tags.building === 'detached'
          ? 2
          : 2 + (hashId(shape.osmId) % 5);
      heightInMeters = floors * 3;
    }
    const landmark = landmarkKindFor(tags);
    const religious = landmark === 'religious';
    if (landmark === 'stadium' && !heightMeasured) {
      // No surveyed height in OSM for most stadiums: representative bowl
      // height scaled by footprint, counted as estimated.
      heightInMeters = Math.round(
        Math.max(
          12,
          Math.min(40, Math.sqrt(Math.abs(polygonArea(polygon))) * 0.32),
        ),
      );
    }
    if (religious && heightInMeters < 18) {
      // A nave is not two storeys: OSM often tags churches with the base
      // building's levels (the Sagrada Familia reads 6 m). Give landmarks a
      // representative, explicitly-estimated height scaled by footprint.
      heightInMeters = Math.round(
        18 + Math.min(22, Math.abs(polygonArea(polygon)) / 350),
      );
      heightMeasured = false;
    }
    if (heightMeasured) measuredBuildingHeights++;
    else estimatedBuildingHeights++;
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
      ...(landmark ? { landmark } : {}),
      footprint: polygon.map((point) => ({ ...point })),
      ...(shape.holes.length
        ? {
            footprintHoles: shape.holes
              .map((hole) =>
                clipPolygonToExtent(hole.slice(0, -1), extentX, extentY).map(
                  (point) => ({ ...point }),
                ),
              )
              .filter((hole) => hole.length >= 3),
          }
        : {}),
      architecture: {
        style: commercial ? 'shop' : floors >= 4 ? 'apartment' : 'house',
        floors,
        roof: commercial || (floors >= 4 && !religious) ? 'flat' : 'gable',
        roofRiseInMeters:
          commercial || (floors >= 4 && !religious) ? 0 : religious ? 3 : 2,
        facade: commercial ? 'brick' : floors >= 4 ? 'stone' : 'sand',
        entranceSide: 'south',
        balconyDepthInMeters: floors >= 4 ? 0.6 : 0,
      },
    });
  }
  // Attach OSM 3D parts (building:part with real heights, e.g. the Sagrada
  // Familia towers at ~170 m) to the building whose footprint contains
  // them. Rendering-only: hazards keep the parent building as before.
  const partCandidates: {
    ring: Point[];
    heightInMeters: number;
    minHeightInMeters: number;
  }[] = [];
  for (const element of elements) {
    if (element.type !== 'way' || !element.geometry) continue;
    const tags = element.tags ?? {};
    if (tags['building:part'] === undefined) continue;
    const taggedHeight = Number.parseFloat(tags.height ?? '');
    const taggedLevels = Number.parseFloat(tags['building:levels'] ?? '');
    const heightInMeters = Number.isFinite(taggedHeight)
      ? taggedHeight
      : Number.isFinite(taggedLevels)
        ? taggedLevels * 3
        : Number.NaN;
    if (
      !Number.isFinite(heightInMeters) ||
      heightInMeters <= 0 ||
      heightInMeters > 260
    )
      continue;
    const taggedMin = Number.parseFloat(tags.min_height ?? '');
    const minHeightInMeters = Number.isFinite(taggedMin)
      ? Math.max(0, Math.min(taggedMin, heightInMeters))
      : 0;
    const ring = element.geometry.map(project);
    if (
      ring.length > 1 &&
      (Math.abs(ring[0]!.x - ring.at(-1)!.x) > 1e-6 ||
        Math.abs(ring[0]!.y - ring.at(-1)!.y) > 1e-6)
    )
      ring.push({ ...ring[0]! });
    if (ring.length < 4) continue;
    const polygon = clipPolygonToExtent(ring.slice(0, -1), extentX, extentY);
    if (polygon.length < 3 || Math.abs(polygonArea(polygon)) < 1) continue;
    partCandidates.push({ ring: polygon, heightInMeters, minHeightInMeters });
  }
  for (const part of partCandidates) {
    const centroid = {
      x: part.ring.reduce((sum, p) => sum + p.x, 0) / part.ring.length,
      y: part.ring.reduce((sum, p) => sum + p.y, 0) / part.ring.length,
    };
    const parent = buildings.find(
      (building) =>
        building.footprint &&
        centroid.x >= building.minCorner.x - 2 &&
        centroid.x <= building.maxCorner.x + 2 &&
        centroid.y >= building.minCorner.y - 2 &&
        centroid.y <= building.maxCorner.y + 2 &&
        pointInPolygon(centroid, building.footprint),
    );
    if (!parent) continue;
    const buildingPart: BuildingPart = {
      footprint: part.ring,
      heightInMeters: part.heightInMeters,
      minHeightInMeters: part.minHeightInMeters,
    };
    (parent.parts ??= []).push(buildingPart);
  }
  for (const building of buildings)
    if (building.parts && building.parts.length > 120)
      building.parts = building.parts
        .sort((a, b) => b.heightInMeters - a.heightInMeters)
        .slice(0, 120);
  const landmarkBuildings = buildings.filter(
    (building) => building.landmark,
  ).length;

  // Opt-in synthetic infill: deterministic houses along motor streets where
  // the source has no buildings. Clearly flagged per building and counted in
  // metadata; off by default and never mixed into measured data.
  let syntheticBuildings = 0;
  if (options.infillSyntheticHouses) {
    const infillRandom = createCityRandom(
      ((options.seed ?? 42) ^ 0x51ab27) >>> 0,
    );
    const cellSize = 25;
    const register = (
      map: Map<string, number[]>,
      index: number,
      minX: number,
      minY: number,
      maxX: number,
      maxY: number,
    ) => {
      for (
        let cx = Math.floor(minX / cellSize);
        cx <= Math.floor(maxX / cellSize);
        cx++
      )
        for (
          let cy = Math.floor(minY / cellSize);
          cy <= Math.floor(maxY / cellSize);
          cy++
        ) {
          const key = `${cx},${cy}`;
          const list = map.get(key) ?? [];
          list.push(index);
          map.set(key, list);
        }
    };
    const segmentCells = new Map<string, number[]>();
    roads.forEach((road, index) =>
      register(
        segmentCells,
        index,
        Math.min(road.start.x, road.end.x) - 14,
        Math.min(road.start.y, road.end.y) - 14,
        Math.max(road.start.x, road.end.x) + 14,
        Math.max(road.start.y, road.end.y) + 14,
      ),
    );
    const occupied: { minCorner: Point; maxCorner: Point }[] = buildings.map(
      (building) => ({
        minCorner: building.minCorner,
        maxCorner: building.maxCorner,
      }),
    );
    const occupiedCells = new Map<string, number[]>();
    occupied.forEach((rect, index) =>
      register(
        occupiedCells,
        index,
        rect.minCorner.x - 3,
        rect.minCorner.y - 3,
        rect.maxCorner.x + 3,
        rect.maxCorner.y + 3,
      ),
    );
    const nearby = (
      map: Map<string, number[]>,
      x: number,
      y: number,
    ): number[] => {
      const found = new Set<number>();
      for (
        let cx = Math.floor(x / cellSize) - 1;
        cx <= Math.floor(x / cellSize) + 1;
        cx++
      )
        for (
          let cy = Math.floor(y / cellSize) - 1;
          cy <= Math.floor(y / cellSize) + 1;
          cy++
        )
          for (const index of map.get(`${cx},${cy}`) ?? []) found.add(index);
      return [...found];
    };
    for (const road of roads) {
      if (syntheticBuildings >= 1500) break;
      const profile = getRoadProfile(road);
      if (!profile.motorVehiclesAllowed) continue;
      const dx = road.end.x - road.start.x;
      const dy = road.end.y - road.start.y;
      const length = Math.hypot(dx, dy);
      if (length < 20) continue;
      const ux = dx / length;
      const uy = dy / length;
      const angle = Math.atan2(dy, dx);
      for (const side of [-1, 1]) {
        for (let t = 9; t < length - 6 && syntheticBuildings < 1500; t += 15) {
          if (infillRandom() < 0.18) continue;
          const houseWidth = 9;
          const houseDepth = 8;
          const offset =
            profile.widthInMeters / 2 +
            profile.sidewalkWidthInMeters +
            houseDepth / 2 +
            1.5;
          const center = {
            x: road.start.x + ux * t - uy * offset * side,
            y: road.start.y + uy * t + ux * offset * side,
          };
          const hx =
            (Math.abs(Math.cos(angle)) * houseWidth +
              Math.abs(Math.sin(angle)) * houseDepth) /
            2;
          const hz =
            (Math.abs(Math.sin(angle)) * houseWidth +
              Math.abs(Math.cos(angle)) * houseDepth) /
            2;
          const rect = {
            minCorner: { x: center.x - hx, y: center.y - hz },
            maxCorner: { x: center.x + hx, y: center.y + hz },
          };
          if (
            rect.minCorner.x < 3 ||
            rect.minCorner.y < 3 ||
            rect.maxCorner.x > extentX - 3 ||
            rect.maxCorner.y > extentY - 3
          )
            continue;
          if (
            parks.some(
              (park) =>
                rect.minCorner.x < park.maxCorner.x + 2 &&
                rect.maxCorner.x > park.minCorner.x - 2 &&
                rect.minCorner.y < park.maxCorner.y + 2 &&
                rect.maxCorner.y > park.minCorner.y - 2,
            )
          )
            continue;
          if (
            nearby(occupiedCells, center.x, center.y).some((index) => {
              const other = occupied[index]!;
              return (
                rect.minCorner.x < other.maxCorner.x + 2.5 &&
                rect.maxCorner.x > other.minCorner.x - 2.5 &&
                rect.minCorner.y < other.maxCorner.y + 2.5 &&
                rect.maxCorner.y > other.minCorner.y - 2.5
              );
            })
          )
            continue;
          if (
            nearby(segmentCells, center.x, center.y).some((index) => {
              const other = roads[index]!;
              if (other.id === road.id) return false;
              return (
                distanceToSegment(center, other.start, other.end) <
                houseDepth / 2 + getRoadProfile(other).widthInMeters / 2 + 1.5
              );
            })
          )
            continue;
          const floors = 1 + Math.floor(infillRandom() * 2);
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const footprint = [
            { x: -houseWidth / 2, y: -houseDepth / 2 },
            { x: houseWidth / 2, y: -houseDepth / 2 },
            { x: houseWidth / 2, y: houseDepth / 2 },
            { x: -houseWidth / 2, y: houseDepth / 2 },
          ].map((local) => ({
            x: center.x + local.x * cos - local.y * sin,
            y: center.y + local.x * sin + local.y * cos,
          }));
          const building: Building = {
            id: `real-infill-${syntheticBuildings}`,
            minCorner: rect.minCorner,
            maxCorner: rect.maxCorner,
            heightInMeters: floors * 3,
            presentation: {
              widthInMeters: houseWidth,
              depthInMeters: houseDepth,
              yawInRadians: -angle,
            },
            use: 'residential',
            synthetic: true,
            footprint,
            architecture: {
              style: 'house',
              floors,
              roof: 'gable',
              roofRiseInMeters: 2,
              facade: 'sand',
              entranceSide: 'south',
              balconyDepthInMeters: 0,
            },
          };
          buildings.push(building);
          occupied.push(rect);
          register(
            occupiedCells,
            occupied.length - 1,
            rect.minCorner.x - 3,
            rect.minCorner.y - 3,
            rect.maxCorner.x + 3,
            rect.maxCorner.y + 3,
          );
          syntheticBuildings++;
        }
      }
    }
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
    syntheticBuildings,
    landmarkBuildings,
  };

  // Deterministic park trees: placement lives in the converted data (a
  // separate random stream, so citizen assignment is unchanged), and the
  // existing urban detail layer renders them as instanced trunks/crowns.
  const parkRandom = createCityRandom((seed ^ 0x51ab3c9d) >>> 0);
  const parkAmenities: NonNullable<
    NonNullable<CityResponse['district']>['urban']
  >['amenities'] = [];
  for (const park of parks) {
    const width = park.maxCorner.x - park.minCorner.x;
    const depth = park.maxCorner.y - park.minCorner.y;
    if (width < 12 || depth < 12) continue;
    const count = Math.max(2, Math.min(24, Math.floor((width * depth) / 900)));
    for (let i = 0; i < count; i++) {
      parkAmenities.push({
        id: `real-park-tree-${parkAmenities.length}`,
        parkId: park.id,
        kind: 'tree',
        position: {
          x: park.minCorner.x + 3 + parkRandom() * (width - 6),
          y: park.minCorner.y + 3 + parkRandom() * (depth - 6),
        },
        rotation: parkRandom() * Math.PI,
        radiusInMeters: 2.2 + parkRandom() * 1.2,
      });
    }
  }

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
      urban: {
        yards: [],
        parkPaths: [],
        amenities: parkAmenities,
        streetDetails: [],
      },
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
