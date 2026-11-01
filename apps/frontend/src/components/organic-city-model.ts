import type { RoadEdge } from '@simulicity/hazards';
import {
  createCityRandom,
  validateCityProfile,
  type RandomCityProfile,
} from './random-city-profile';
import type {
  Block,
  Building,
  CityResponse,
  OrganicGeography,
  Point,
  Road,
} from './city-types';

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
  options: {
    relief?: boolean;
    profile?: RandomCityProfile;
    expanded?: boolean;
    metropolitan?: boolean;
  } = {},
): { city: CityResponse; geography: OrganicGeography } {
  const random = createCityRandom(seed);
  const profile = options.profile;
  if (profile) validateCityProfile(profile);
  const metropolitan = options.metropolitan === true;
  const expanded = options.expanded === true || metropolitan;
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
  const scale = Math.min(width, height) / 500;
  // Geographic extent can grow without inflating buildings, sidewalks or furniture.
  const localScale = expanded ? 1 : scale;
  const lakeScale = metropolitan ? localScale : scale;
  const buildingTarget = metropolitan
    ? profile
      ? Math.round(1000 + ((profile.buildingTarget - 110) * 700) / 80)
      : 1350
    : expanded
      ? profile
        ? Math.round(350 + ((profile.buildingTarget - 110) * 150) / 80)
        : 420
      : (profile?.buildingTarget ?? 190);
  const parkTarget = metropolitan
    ? profile
      ? Math.round(14 + ((profile.parkTarget - 2) * 8) / 5)
      : 18
    : expanded
      ? profile
        ? Math.round(8 + ((profile.parkTarget - 2) * 4) / 5)
        : 10
      : (profile?.parkTarget ?? 4);
  const point = (x: number, y: number): Point => ({
    x: x * width,
    y: y * height,
  });
  const riverOffset = (random() - 0.5) * 0.035;
  const geography: OrganicGeography = {
    seed,
    lake: {
      center: point(0.52 + riverOffset, 0.48),
      radiusX: 52 * lakeScale * (profile?.lakeScale ?? 1),
      radiusZ: 60 * lakeScale * (profile?.lakeScale ?? 1),
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
      widthInMeters: 20 * scale * (profile?.riverWidthScale ?? 1),
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
  if (metropolitan) {
    geography.neighborhoods = [
      {
        id: 'downtown',
        name: 'Central Business District',
        kind: 'center',
        center: point(0.43, 0.49),
        radiusX: width * 0.27,
        radiusZ: height * 0.3,
      },
      {
        id: 'north-quarter',
        name: 'North Quarter',
        kind: 'residential',
        center: point(0.28, 0.18),
        radiusX: width * 0.16,
        radiusZ: height * 0.17,
      },
      {
        id: 'west-gardens',
        name: 'West Gardens',
        kind: 'residential',
        center: point(0.15, 0.51),
        radiusX: width * 0.14,
        radiusZ: height * 0.25,
      },
      {
        id: 'south-homes',
        name: 'South Neighborhoods',
        kind: 'residential',
        center: point(0.35, 0.82),
        radiusX: width * 0.2,
        radiusZ: height * 0.17,
      },
      {
        id: 'river-quarter',
        name: 'River Quarter',
        kind: 'commercial',
        center: point(0.68, 0.2),
        radiusX: width * 0.2,
        radiusZ: height * 0.17,
      },
      {
        id: 'east-neighborhood',
        name: 'East Neighborhood',
        kind: 'residential',
        center: point(0.8, 0.51),
        radiusX: width * 0.16,
        radiusZ: height * 0.24,
      },
      {
        id: 'east-market',
        name: 'East Market',
        kind: 'commercial',
        center: point(0.69, 0.82),
        radiusX: width * 0.19,
        radiusZ: height * 0.16,
      },
    ];
  } else if (expanded) {
    const clusters = [
      ['north-center', 'North Old Town', 'center', 0.27, 0.22],
      ['west-gardens', 'West Gardens', 'residential', 0.25, 0.49],
      ['south-homes', 'South Village', 'residential', 0.24, 0.77],
      ['east-market', 'East Market', 'commercial', 0.76, 0.23],
      ['river-quarter', 'River Quarter', 'center', 0.77, 0.5],
      ['east-gardens', 'East Gardens', 'residential', 0.79, 0.77],
    ] as const;
    geography.neighborhoods = clusters.map(([id, name, kind, x, y]) => ({
      id,
      name,
      kind,
      center: point(x + (random() - 0.5) * 0.025, y + (random() - 0.5) * 0.035),
      radiusX: width * (0.14 + random() * 0.025),
      radiusZ: height * (0.16 + random() * 0.025),
    }));
  }
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
  // Legacy banks remain winding trees. Expanded banks add local street loops.
  const banks = [0, 1].map((bank) => {
    if (expanded) {
      const columns = metropolitan
        ? bank === 0
          ? [0.08, 0.18, 0.28, 0.38]
          : [0.64, 0.74, 0.84, 0.94]
        : bank === 0
          ? [0.12, 0.25, 0.37]
          : [0.67, 0.77, 0.89];
      const rows = metropolitan
        ? [0.08, 0.18, 0.28, 0.38, 0.49, 0.6, 0.72, 0.84, 0.92]
        : [0.16, 0.29, 0.43, 0.59, 0.74, 0.86];
      const streets = columns.map((x) =>
        rows.map((y) =>
          node(
            point(x + (random() - 0.5) * 0.018, y + (random() - 0.5) * 0.025),
          ),
        ),
      );
      streets.forEach((street, col) =>
        street.forEach((junction, row) => {
          if (row > 0) connect(street[row - 1]!, junction);
          if (col > 0) connect(streets[col - 1]![row]!, junction);
        }),
      );
      return streets[bank === 0 ? (metropolitan ? 3 : 2) : 0]!;
    }
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
    widthInMeters: 10 * localScale,
  });
  if (expanded) {
    for (const [index, row] of (metropolitan ? [0, 8] : [0, 5]).entries()) {
      const from = banks[0]![row]!,
        to = banks[1]![row]!;
      const extra = connect(from, to);
      geography.bridges.push({
        id: `organic-bridge-${index + 1}`,
        roadIds: [extra.road.id],
        edgeIds: [extra.edge.id],
        start: { x: from.x, y: from.y },
        end: { x: to.x, y: to.y },
        deckElevationInMeters: deck,
        widthInMeters: 10,
      });
    }
  }
  const bridgeRoadIds = new Set(
    geography.bridges.flatMap((bridge) => bridge.roadIds),
  );
  const ordinaryRoads = roads.filter((r) => !bridgeRoadIds.has(r.id));
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
  for (
    let attempt = 0;
    attempt < (metropolitan ? 100000 : 24000) &&
    buildings.length < buildingTarget;
    attempt++
  ) {
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
      expanded
        ? !geography.neighborhoods.some(
            (n) =>
              ((p.x - n.center.x) / n.radiusX) ** 2 +
                ((p.y - n.center.y) / n.radiusZ) ** 2 <=
              1,
          )
        : ((p.x - urbanCenter.x) / (width * 0.235)) ** 2 +
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
          : 10 + random() * 5) * localScale;
    const sy =
      (center
        ? 8 + random() * 5
        : commercial
          ? 11 + random() * 7
          : 10 + random() * 6) * localScale;
    const radius = Math.hypot(sx, sy) / 2;
    const distance = roadDistance(p);
    if (
      distance < radius + 6 * localScale ||
      distance > (metropolitan ? 76 : 39) * localScale ||
      !waterClear(p, radius + 3 * localScale)
    )
      continue;
    if (
      roads.some(
        (r) => distanceToSegment(p, r.start, r.end) < radius + 6 * localScale,
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
          a.x < existing.maxCorner.x + 3 * localScale &&
          b.x > existing.minCorner.x - 3 * localScale &&
          a.y < existing.maxCorner.y + 3 * localScale &&
          b.y > existing.minCorner.y - 3 * localScale,
      )
    )
      continue;
    const inDowntownCore =
      metropolitan &&
      ((p.x - width * 0.49) / (width * 0.2)) ** 2 +
        ((p.y - height * 0.49) / (height * 0.22)) ** 2 <=
        1;
    const baseFloors = inDowntownCore
      ? 24 + Math.floor(random() * 25)
      : center
        ? metropolitan
          ? 12 + Math.floor(random() * 14)
          : 6 + Math.floor(random() * 7)
        : commercial
          ? 3 + Math.floor(random() * 3)
          : 1 + Math.floor(random() * 2);
    const floors = Math.max(
      1,
      Math.round(baseFloors * (profile?.heightScale ?? 1)),
    );
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
  for (
    let attempt = 0;
    attempt < 5000 && parks.length < parkTarget;
    attempt++
  ) {
    const p = point(0.08 + random() * 0.84, 0.09 + random() * 0.82);
    const halfX = (10 + random() * 4) * localScale;
    const halfY = (10 + random() * 4) * localScale;
    const radius = Math.hypot(halfX, halfY);
    if (
      !waterClear(p, radius + 3 * localScale) ||
      roadDistance(p) > 65 * localScale ||
      roads.some(
        (road) =>
          distanceToSegment(p, road.start, road.end) < radius + 8 * localScale,
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
          minCorner.x < existing.maxCorner.x + 3 * localScale &&
          maxCorner.x > existing.minCorner.x - 3 * localScale &&
          minCorner.y < existing.maxCorner.y + 3 * localScale &&
          maxCorner.y > existing.minCorner.y - 3 * localScale,
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
        position: {
          x: p.x + offset[0]! * localScale,
          y: p.y + offset[1]! * localScale,
        },
        rotation: random() * Math.PI * 2,
        radiusInMeters: 2 * localScale,
      });
    }
    amenities.push({
      id: `${park.id}-bench`,
      parkId: park.id,
      kind: 'bench',
      position: { ...p },
      rotation: 0,
      radiusInMeters: 1.2 * localScale,
    });
    amenities.push({
      id: `${park.id}-lamp`,
      parkId: park.id,
      kind: 'lamp',
      position: { x: p.x + 4 * localScale, y: p.y },
      rotation: 0,
      radiusInMeters: 0.5 * localScale,
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
  const sampleSpacing = expanded
    ? Math.max(10, Math.ceil(Math.max(width, height) / 75))
    : 10;
  const coordinates = (length: number) =>
    Array.from({ length: Math.ceil(length / sampleSpacing) + 1 }, (_, i) =>
      Math.min(i * sampleSpacing, length),
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
        ...geography.bridges.map((bridge) =>
          distanceToSegment(p, bridge.start, bridge.end),
        ),
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
      const elevation = (deck + hill) * smooth(shoreDistance / (28 * scale));
      if (!expanded) return elevation;
      // Grade every landing on dry ground, never the channel bed under a deck.
      // The plateau covers the surrounding adaptive-grid triangle vertices too.
      const approachDistance = Math.min(
        ...geography.bridges.flatMap((bridge) =>
          [bridge.start, bridge.end].map((end) =>
            Math.hypot(x - end.x, y - end.y),
          ),
        ),
      );
      return deck + (elevation - deck) * smooth((approachDistance - 32) / 24);
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
    if (bench) bench.position = { x: center.x, y: center.y + 5 * localScale };
    amenities.push({
      id: `${park.id}-fountain`,
      parkId: park.id,
      kind: 'fountain',
      position: center,
      rotation: 0,
      radiusInMeters: 2 * localScale,
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
      roadWidthInMeters: 8 * localScale,
      sidewalkWidthInMeters: 2 * localScale,
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
