import type { RoadEdge } from '@simulicity/hazards';
import type {
  Block,
  Building,
  CityResponse,
  OrganicGeography,
  Point,
  Road,
} from './city-types';

function randomFrom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

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

/** Static water surface only, including the finite caps of channel segments. */
export function waterSurfaceAt(
  geography: OrganicGeography,
  point: Point,
): number | undefined {
  const { lake, river } = geography;
  if (
    ((point.x - lake.center.x) / lake.radiusX) ** 2 +
      ((point.y - lake.center.y) / lake.radiusZ) ** 2 <=
    1
  )
    return lake.level;
  for (let i = 1; i < river.points.length; i++) {
    if (
      distanceToSegment(point, river.points[i - 1]!, river.points[i]!) <=
      river.widthInMeters / 2
    )
      return river.level;
  }
  return undefined;
}

/** Builds a new view model; the backend response and saved scenario stay untouched. */
export function createOrganicCity(
  source: CityResponse,
  seed: number,
  options: { relief?: boolean } = {},
): { city: CityResponse; geography: OrganicGeography } {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError(
      'Organic city seed must be an unsigned 32-bit integer.',
    );
  }
  const width = source.config.widthInMeters;
  const height = source.config.heightInMeters;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    (Math.ceil(width / 10) + 1) * (Math.ceil(height / 10) + 1) > 1_000_000
  ) {
    throw new RangeError(
      'Organic city dimensions must be finite, positive and fit one million terrain samples.',
    );
  }
  const random = randomFrom(seed);
  const scale = Math.min(width, height) / 500;
  const point = (x: number, y: number): Point => ({
    x: x * width,
    y: y * height,
  });
  const riverOffset = (random() - 0.5) * 0.035;
  const geography: OrganicGeography = {
    seed,
    lake: {
      center: point(0.52 + riverOffset, 0.48),
      radiusX: 52 * scale,
      radiusZ: 60 * scale,
      level: 0,
    },
    river: {
      points: [
        point(0.49 + riverOffset, 0),
        point(0.53 + riverOffset, 0.24),
        point(0.49 + riverOffset, 0.43),
        point(0.52 + riverOffset, 0.75),
        point(0.48 + riverOffset, 1),
      ],
      widthInMeters: 20 * scale,
      level: 0,
    },
    bridges: [],
    neighborhoods: [
      {
        id: 'center',
        name: 'Old Town',
        kind: 'center',
        center: point(0.31, 0.4),
        radiusX: 90 * scale,
        radiusZ: 95 * scale,
      },
      {
        id: 'homes',
        name: 'Garden Quarter',
        kind: 'residential',
        center: point(0.27, 0.77),
        radiusX: 100 * scale,
        radiusZ: 90 * scale,
      },
      {
        id: 'commerce',
        name: 'East Market',
        kind: 'commercial',
        center: point(0.73, 0.44),
        radiusX: 100 * scale,
        radiusZ: 160 * scale,
      },
    ],
  };
  const roads: Road[] = [];
  const nodes: (Point & { id: string })[] = [];
  const edges: RoadEdge[] = [];
  const node = (p: Point) => {
    const value = { ...p, id: `organic-node-${nodes.length}` };
    nodes.push(value);
    return value;
  };
  const connect = (a: (typeof nodes)[number], b: (typeof nodes)[number]) => {
    const road: Road = {
      id: `organic-road-${roads.length}`,
      start: { x: a.x, y: a.y },
      end: { x: b.x, y: b.y },
    };
    roads.push(road);
    const edge: RoadEdge = {
      id: `organic-edge-${edges.length}`,
      roadId: road.id,
      from: a.id,
      to: b.id,
      lengthInMeters: Math.hypot(a.x - b.x, a.y - b.y),
      bidirectional: true,
    };
    edges.push(edge);
    return { road, edge };
  };
  // Each bank is a winding tree. The bridge is their sole topological connection.
  const banks = [0, 1].map((bank) => {
    const ys = [0.13, 0.28, 0.43, 0.6, 0.83];
    const trunk = ys.map((y, i) =>
      node(
        point(
          (bank === 0 ? 0.33 : 0.7) +
            (random() - 0.5) * 0.035 +
            (i === 3 ? 0.015 : 0),
          y,
        ),
      ),
    );
    for (let i = 1; i < trunk.length; i++) connect(trunk[i - 1]!, trunk[i]!);
    trunk.forEach((root, i) => {
      const outer = node(
        point(
          bank === 0 ? 0.1 + random() * 0.035 : 0.87 + random() * 0.035,
          ys[i]! + (random() - 0.5) * 0.055,
        ),
      );
      connect(root, outer);
    });
    return trunk;
  });
  const start = banks[0]![2]!;
  const end = banks[1]![2]!;
  const crossing = connect(start, end);
  const deck = 2.2;
  geography.bridges.push({
    id: 'organic-bridge',
    roadIds: [crossing.road.id],
    edgeIds: [crossing.edge.id],
    start: { x: start.x, y: start.y },
    end: { x: end.x, y: end.y },
    deckElevationInMeters: deck,
    widthInMeters: 10 * scale,
  });
  const ordinaryRoads = roads.filter((r) => r !== crossing.road);
  const roadDistance = (p: Point) =>
    Math.min(...ordinaryRoads.map((r) => distanceToSegment(p, r.start, r.end)));
  // Conservative disk clearance protects the entire rectangle and road shoulders.
  const waterClear = (p: Point, radius: number) => {
    const lake = geography.lake;
    if (
      ((p.x - lake.center.x) / (lake.radiusX + radius)) ** 2 +
        ((p.y - lake.center.y) / (lake.radiusZ + radius)) ** 2 <=
      1
    )
      return false;
    const river = geography.river;
    return river.points
      .slice(1)
      .every(
        (b, i) =>
          distanceToSegment(p, river.points[i]!, b) >
          river.widthInMeters / 2 + radius,
      );
  };
  const buildings: Building[] = [];
  for (let attempt = 0; attempt < 24000 && buildings.length < 190; attempt++) {
    const p = point(0.07 + random() * 0.86, 0.09 + random() * 0.83);
    const district = geography.neighborhoods.reduce((best, n) =>
      Math.hypot(
        (p.x - n.center.x) / n.radiusX,
        (p.y - n.center.y) / n.radiusZ,
      ) <
      Math.hypot(
        (p.x - best.center.x) / best.radiusX,
        (p.y - best.center.y) / best.radiusZ,
      )
        ? n
        : best,
    );
    const urbanCenter = point(p.x < width * 0.5 ? 0.27 : 0.75, 0.48);
    if (
      ((p.x - urbanCenter.x) / (width * 0.235)) ** 2 +
        ((p.y - urbanCenter.y) / (height * 0.435)) ** 2 >
      1
    )
      continue;
    const center = district.kind === 'center';
    const commercial = district.kind === 'commercial';
    const sx =
      (center
        ? 8 + random() * 5
        : commercial
          ? 12 + random() * 7
          : 10 + random() * 5) * scale;
    const sy =
      (center
        ? 8 + random() * 5
        : commercial
          ? 11 + random() * 7
          : 10 + random() * 6) * scale;
    const radius = Math.hypot(sx, sy) / 2;
    const distance = roadDistance(p);
    if (
      distance < radius + 6 * scale ||
      distance > 39 * scale ||
      !waterClear(p, radius + 3 * scale)
    )
      continue;
    if (
      roads.some(
        (r) => distanceToSegment(p, r.start, r.end) < radius + 6 * scale,
      )
    )
      continue;
    const frontage = roads
      .map((road) => {
        const dx = road.end.x - road.start.x,
          dy = road.end.y - road.start.y;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((p.x - road.start.x) * dx + (p.y - road.start.y) * dy) /
              (dx * dx + dy * dy),
          ),
        );
        const target = { x: road.start.x + t * dx, y: road.start.y + t * dy };
        return {
          road,
          target,
          t,
          distance: Math.hypot(target.x - p.x, target.y - p.y),
        };
      })
      .sort((a, b) => a.distance - b.distance)[0]!;
    if (frontage.t <= 0.02 || frontage.t >= 0.98) continue;
    const yaw = -Math.atan2(
      frontage.road.end.y - frontage.road.start.y,
      frontage.road.end.x - frontage.road.start.x,
    );
    const hx =
      (Math.abs(Math.cos(yaw)) * sx + Math.abs(Math.sin(yaw)) * sy) / 2;
    const hz =
      (Math.abs(Math.sin(yaw)) * sx + Math.abs(Math.cos(yaw)) * sy) / 2;
    const a = { x: p.x - hx, y: p.y - hz },
      b = { x: p.x + hx, y: p.y + hz };
    const facing =
      Math.sin(yaw) * (frontage.target.x - p.x) +
      Math.cos(yaw) * (frontage.target.y - p.y);
    if (
      buildings.some(
        (existing) =>
          a.x < existing.maxCorner.x + 3 * scale &&
          b.x > existing.minCorner.x - 3 * scale &&
          a.y < existing.maxCorner.y + 3 * scale &&
          b.y > existing.minCorner.y - 3 * scale,
      )
    )
      continue;
    const floors = center
      ? 6 + Math.floor(random() * 7)
      : commercial
        ? 3 + Math.floor(random() * 3)
        : 1 + Math.floor(random() * 2);
    buildings.push({
      id: `organic-building-${buildings.length}`,
      minCorner: a,
      maxCorner: b,
      heightInMeters: floors * 3,
      presentation: { widthInMeters: sx, depthInMeters: sy, yawInRadians: yaw },
      use: commercial ? 'commercial' : 'residential',
      architecture: {
        style: center ? 'apartment' : commercial ? 'shop' : 'house',
        floors,
        roof: commercial || center ? 'flat' : 'gable',
        roofRiseInMeters: commercial || center ? 0 : 2,
        facade: center ? 'stone' : commercial ? 'brick' : 'sand',
        entranceSide: facing > 0 ? 'north' : 'south',
        balconyDepthInMeters: center ? 0.6 : 0,
      },
    });
  }
  const parks: Block[] = [];
  const amenities: NonNullable<
    NonNullable<CityResponse['district']>['urban']
  >['amenities'] = [];
  // Find remaining free land instead of replacing occupied blocks with decoration.
  for (let attempt = 0; attempt < 5000 && parks.length < 4; attempt++) {
    const p = point(0.08 + random() * 0.84, 0.09 + random() * 0.82);
    const halfX = (10 + random() * 4) * scale;
    const halfY = (10 + random() * 4) * scale;
    const radius = Math.hypot(halfX, halfY);
    if (
      !waterClear(p, radius + 3 * scale) ||
      roadDistance(p) > 65 * scale ||
      roads.some(
        (road) =>
          distanceToSegment(p, road.start, road.end) < radius + 8 * scale,
      )
    )
      continue;
    const minCorner = { x: p.x - halfX, y: p.y - halfY };
    const maxCorner = { x: p.x + halfX, y: p.y + halfY };
    if (
      minCorner.x < 0 ||
      minCorner.y < 0 ||
      maxCorner.x > width ||
      maxCorner.y > height ||
      [...buildings, ...parks].some(
        (existing) =>
          minCorner.x < existing.maxCorner.x + 3 * scale &&
          maxCorner.x > existing.minCorner.x - 3 * scale &&
          minCorner.y < existing.maxCorner.y + 3 * scale &&
          maxCorner.y > existing.minCorner.y - 3 * scale,
      )
    )
      continue;
    const park = { id: `organic-park-${parks.length}`, minCorner, maxCorner };
    parks.push(park);
    for (const [index, offset] of [
      [-5, -5],
      [5, -5],
      [-5, 5],
      [5, 5],
    ].entries()) {
      amenities.push({
        id: `${park.id}-tree-${index}`,
        parkId: park.id,
        kind: 'tree',
        position: { x: p.x + offset[0]! * scale, y: p.y + offset[1]! * scale },
        rotation: random() * Math.PI * 2,
        radiusInMeters: 2 * scale,
      });
    }
    amenities.push({
      id: `${park.id}-bench`,
      parkId: park.id,
      kind: 'bench',
      position: { ...p },
      rotation: 0,
      radiusInMeters: 1.2 * scale,
    });
    amenities.push({
      id: `${park.id}-lamp`,
      parkId: park.id,
      kind: 'lamp',
      position: { x: p.x + 4 * scale, y: p.y },
      rotation: 0,
      radiusInMeters: 0.5 * scale,
    });
  }
  const nearestNode = (p: Point) =>
    nodes.reduce((best, n) =>
      Math.hypot(n.x - p.x, n.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y)
        ? n
        : best,
    );
  const residential = buildings.filter((b) => b.use === 'residential');
  const citizens = Array.from(
    { length: source.citizens?.length ?? 200 },
    (_, i) => {
      const home = residential[i % residential.length]!;
      const position = {
        x: (home.minCorner.x + home.maxCorner.x) / 2,
        y: (home.minCorner.y + home.maxCorner.y) / 2,
      };
      const original = source.citizens?.[i];
      return {
        id: original?.id ?? `organic-citizen-${i}`,
        homeBuildingId: home.id,
        nodeId: nearestNode(position).id,
        position,
        mobilityFactor: original?.mobilityFactor ?? 0.8 + random() * 0.2,
        reactionDelayInSeconds:
          original?.reactionDelayInSeconds ?? random() * 12,
      };
    },
  );
  const coordinates = (length: number) =>
    Array.from({ length: Math.ceil(length / 10) + 1 }, (_, i) =>
      Math.min(i * 10, length),
    );
  const xs = coordinates(width),
    ys = coordinates(height);
  const smooth = (value: number) => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  };
  const elevations = ys.map((y) =>
    xs.map((x) => {
      const p = { x, y };
      const lake = geography.lake;
      const lakeDistance =
        (Math.hypot(
          (x - lake.center.x) / lake.radiusX,
          (y - lake.center.y) / lake.radiusZ,
        ) -
          1) *
        Math.min(lake.radiusX, lake.radiusZ);
      const riverDistance =
        Math.min(
          ...geography.river.points
            .slice(1)
            .map((end, i) =>
              distanceToSegment(p, geography.river.points[i]!, end),
            ),
        ) -
        geography.river.widthInMeters / 2;
      const shoreDistance = Math.min(lakeDistance, riverDistance);
      if (shoreDistance < 0) return -3 * smooth(-shoreDistance / (18 * scale));
      const roadClearance = Math.min(
        roadDistance(p),
        distanceToSegment(p, start, end),
      );
      const grading = smooth((roadClearance - 15 * scale) / (30 * scale));
      const hill =
        options.relief === false
          ? 0
          : Math.max(
              0,
              Math.sin((x / width) * 7 + seed * 0.01) *
                Math.cos((y / height) * 5),
            ) *
            3.5 *
            grading;
      return (deck + hill) * smooth(shoreDistance / (28 * scale));
    }),
  );
  if (parks[0]) {
    const park = parks[0];
    const center = {
      x: (park.minCorner.x + park.maxCorner.x) / 2,
      y: (park.minCorner.y + park.maxCorner.y) / 2,
    };
    const bench = amenities.find(
      (item) => item.parkId === park.id && item.kind === 'bench',
    );
    if (bench) bench.position = { x: center.x, y: center.y + 5 * scale };
    amenities.push({
      id: `${park.id}-fountain`,
      parkId: park.id,
      kind: 'fountain',
      position: center,
      rotation: 0,
      radiusInMeters: 2 * scale,
    });
  }
  const city: CityResponse = {
    config: { ...source.config, seed },
    terrain: { kind: 'flat', elevationInMeters: deck },
    roads,
    blocks: buildings.map((b) => ({
      id: `lot-${b.id}`,
      minCorner: { ...b.minCorner },
      maxCorner: { ...b.maxCorner },
    })),
    buildings,
    district: {
      roadWidthInMeters: 8 * scale,
      sidewalkWidthInMeters: 2 * scale,
      parks,
      sidewalks: [],
      urban: { yards: [], parkPaths: [], amenities, streetDetails: [] },
    },
    terrainGrid: {
      xCoordinates: xs,
      yCoordinates: ys,
      elevationsInMeters: elevations,
      source: 'organic-geography',
    },
    roadGraph: { nodes, edges },
    citizens,
    shelters: banks.map((bank, i) => ({
      id: source.shelters?.[i]?.id ?? `organic-shelter-${i}`,
      nodeId: bank[0]!.id,
      active: true,
      capacity: Math.max(200, citizens.length),
    })),
    organic: geography,
  };
  return { city, geography };
}
