import { createParkLayout } from './park-layout';
import type { RoadEdge } from '@simulicity/hazards';
import { getRoadProfile } from './road-profile';
import { sampleBuildingArchetype } from './building-archetypes';
import {
  getCityGenerationPreset,
  type CityGenerationMode,
} from './city-generation-preset';
import {
  createCityRandom,
  type RandomCityProfile,
} from './random-city-profile';
import type {
  Block,
  Building,
  CityResponse,
  OrganicGeography,
  Point,
  Road,
  RoadProfile,
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
    mode?: CityGenerationMode;
  } = {},
): { city: CityResponse; geography: OrganicGeography } {
  const random = createCityRandom(seed);
  // Layout variation must not consume the geography/placement random stream.
  const layoutRandom = createCityRandom((seed ^ 0x6d2b79f5) >>> 0);
  const profile = options.profile;
  const preset = getCityGenerationPreset(options.mode, profile);
  const sourceWidth = source.config.widthInMeters;
  const sourceHeight = source.config.heightInMeters;
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    (Math.ceil(sourceWidth / 10) + 1) * (Math.ceil(sourceHeight / 10) + 1) >
      1_000_000
  ) {
    throw new RangeError(
      'Organic city dimensions must be finite, positive and fit one million terrain samples.',
    );
  }
  const width = preset.widthInMeters ?? sourceWidth;
  const height = preset.heightInMeters ?? sourceHeight;
  const geographicScale = Math.min(width, height) / 500;
  const scale = preset.objectScale ?? geographicScale;
  const point = (x: number, y: number): Point => ({
    x: x * width,
    y: y * height,
  });
  const riverOffset = (random() - 0.5) * 0.035;
  const geography: OrganicGeography = {
    seed,
    lake: {
      center: point(0.52 + riverOffset, 0.48),
      radiusX: 52 * geographicScale * (profile?.lakeScale ?? 1),
      radiusZ: 60 * geographicScale * (profile?.lakeScale ?? 1),
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
      widthInMeters: 20 * geographicScale * (profile?.riverWidthScale ?? 1),
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
  if (preset.mode === 'city') {
    const kinds = [
      'residential',
      'center',
      'commercial',
      'residential',
    ] as const;
    const names = ['North Gardens', 'Center', 'Market', 'South Gardens'];
    geography.neighborhoods = [0, 1].flatMap((bank) =>
      kinds.map((kind, index) => ({
        id: `city-${bank === 0 ? 'west' : 'east'}-${index}`,
        name: `${bank === 0 ? 'West' : 'East'} ${names[index]}`,
        kind,
        center: point(
          bank === 0 ? 0.27 : 0.75,
          [0.18, 0.4, 0.62, 0.82][index]!,
        ),
        radiusX: width * 0.17,
        radiusZ: height * 0.13,
      })),
    );
  }
  for (const neighborhood of geography.neighborhoods) {
    neighborhood.center.x += (layoutRandom() - 0.5) * width * 0.05;
    neighborhood.center.y += (layoutRandom() - 0.5) * height * 0.07;
    neighborhood.radiusX *= 0.85 + layoutRandom() * 0.3;
    neighborhood.radiusZ *= 0.85 + layoutRandom() * 0.3;
  }
  const roads: Road[] = [];
  const nodes: (Point & { id: string })[] = [];
  const edges: RoadEdge[] = [];
  const node = (p: Point) => {
    const value = { ...p, id: `organic-node-${nodes.length}` };
    nodes.push(value);
    return value;
  };
  const connect = (
    a: (typeof nodes)[number],
    b: (typeof nodes)[number],
    kind: RoadProfile['kind'] = 'local',
  ) => {
    const [roadWidth, sidewalkWidth] =
      kind === 'avenue' ? [12, 3] : kind === 'alley' ? [4, 1] : [8, 2];
    const road: Road = {
      id: `organic-road-${roads.length}`,
      start: { x: a.x, y: a.y },
      end: { x: b.x, y: b.y },
      profile: {
        kind,
        widthInMeters: roadWidth * scale,
        sidewalkWidthInMeters: sidewalkWidth * scale,
        motorVehiclesAllowed: kind !== 'alley',
      },
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
  const outerBanks: (typeof nodes)[] = [];
  // Keep trunk order and bridge anchors stable; add local circuits afterwards.
  const banks = [0, 1].map((bank) => {
    const ys =
      preset.mode === 'city'
        ? Array.from({ length: preset.roadRows }, (_, i) => 0.1 + i * 0.085)
        : [0.13, 0.28, 0.43, 0.6, 0.83];
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
    for (let i = 1; i < trunk.length; i++)
      connect(trunk[i - 1]!, trunk[i]!, 'avenue');
    const outerBank = trunk.map((root, i) => {
      const outer = node(
        point(
          bank === 0 ? 0.1 + random() * 0.035 : 0.87 + random() * 0.035,
          ys[i]! + (random() - 0.5) * 0.055,
        ),
      );
      connect(root, outer);
      return outer;
    });
    outerBanks.push(outerBank);
    return trunk;
  });
  const bridgeRow =
    preset.mode === 'city' ? Math.floor((preset.roadRows - 1) / 2) : 2;
  const start = banks[0]![bridgeRow]!;
  const end = banks[1]![bridgeRow]!;
  const crossing = connect(start, end);
  crossing.road.profile = {
    kind: 'local',
    widthInMeters: 10 * scale,
    sidewalkWidthInMeters: 0,
    motorVehiclesAllowed: true,
  };
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
  // Two irregular outer links per bank give local detours while retaining dead
  // ends. Appending preserves existing road/node/bridge IDs and the sole crossing.
  outerBanks.forEach((outerBank, bank) => {
    const missingLink =
      preset.mode === 'city'
        ? Math.floor(layoutRandom() * (outerBank.length - 1))
        : -1;
    const links =
      preset.mode === 'city'
        ? Array.from({ length: outerBank.length - 1 }, (_, i) => i).filter(
            (i) => i !== missingLink,
          )
        : [Math.floor(layoutRandom() * 2), 2 + Math.floor(layoutRandom() * 2)];
    for (const index of links) {
      const a = outerBank[index]!;
      const b = outerBank[index + 1]!;
      const bend = node({
        x:
          (a.x + b.x) / 2 +
          (bank === 0 ? 1 : -1) * width * (0.015 + layoutRandom() * 0.02),
        y: a.y + (b.y - a.y) * (0.35 + layoutRandom() * 0.3),
      });
      connect(a, bend, 'alley');
      connect(bend, b, 'alley');
    }
  });
  const ordinaryRoads = roads.filter((r) => r !== crossing.road);
  const roadDistance = (p: Point) =>
    Math.min(...ordinaryRoads.map((r) => distanceToSegment(p, r.start, r.end)));
  const roadExtent = (road: Road) => {
    const profile = getRoadProfile(road);
    return profile.widthInMeters / 2 + profile.sidewalkWidthInMeters;
  };
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
  // Reserve civic land first; a dedicated stream leaves geography randomness intact.
  const parks: Block[] = [];
  const civicRandom = createCityRandom((seed ^ 0x3c6ef372) >>> 0);
  const civicHalfX = (preset.mode === 'city' ? 24 : 16) * scale;
  const civicHalfY = (preset.mode === 'city' ? 20 : 14) * scale;
  const civicRadius = Math.hypot(civicHalfX, civicHalfY);
  for (
    let attempt = 0;
    attempt < preset.parkAttemptLimit && parks.length === 0;
    attempt++
  ) {
    const p = point(0.08 + civicRandom() * 0.84, 0.09 + civicRandom() * 0.82);
    if (
      !waterClear(p, civicRadius + 3 * scale) ||
      roadDistance(p) > 65 * scale ||
      roads.some(
        (road) =>
          distanceToSegment(p, road.start, road.end) <
          civicRadius + roadExtent(road) + 2 * scale,
      )
    )
      continue;
    const minCorner = { x: p.x - civicHalfX, y: p.y - civicHalfY };
    const maxCorner = { x: p.x + civicHalfX, y: p.y + civicHalfY };
    if (
      minCorner.x < 0 ||
      minCorner.y < 0 ||
      maxCorner.x > width ||
      maxCorner.y > height
    )
      continue;
    parks.push({ id: 'organic-park-0', minCorner, maxCorner });
  }
  const civicParkId = parks[0]?.id;
  const buildings: Building[] = [];
  for (
    let attempt = 0;
    attempt < preset.buildingAttemptLimit &&
    buildings.length < preset.buildingTarget;
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
      ((p.x - urbanCenter.x) / (width * 0.235)) ** 2 +
        ((p.y - urbanCenter.y) / (height * 0.435)) ** 2 >
      1
    )
      continue;
    const center = district.kind === 'center';
    const commercial = district.kind === 'commercial';
    const archetype = sampleBuildingArchetype(district.kind, random);
    const sx = archetype.widthInMeters * scale;
    const sy = archetype.depthInMeters * scale;
    const setback = archetype.roadSetbackInMeters * scale;
    const gap = archetype.buildingGapInMeters * scale;
    const radius = Math.hypot(sx, sy) / 2;
    const distance = roadDistance(p);
    if (distance > 39 * scale || !waterClear(p, radius + 3 * scale)) continue;
    if (
      roads.some(
        (r) =>
          distanceToSegment(p, r.start, r.end) <
          radius + roadExtent(r) + setback,
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
      buildings.some((existing) => {
        const mutualGap = Math.max(
          gap,
          existing.layout?.buildingGapInMeters ?? 3 * scale,
        );
        return (
          a.x < existing.maxCorner.x + mutualGap &&
          b.x > existing.minCorner.x - mutualGap &&
          a.y < existing.maxCorner.y + mutualGap &&
          b.y > existing.minCorner.y - mutualGap
        );
      })
    )
      continue;
    if (
      parks.some(
        (park) =>
          a.x < park.maxCorner.x + Math.max(gap, 3 * scale) &&
          b.x > park.minCorner.x - Math.max(gap, 3 * scale) &&
          a.y < park.maxCorner.y + Math.max(gap, 3 * scale) &&
          b.y > park.minCorner.y - Math.max(gap, 3 * scale),
      )
    )
      continue;
    const floors = Math.max(
      1,
      Math.round(archetype.baseFloors * (profile?.heightScale ?? 1)),
    );
    buildings.push({
      id: `organic-building-${buildings.length}`,
      minCorner: a,
      maxCorner: b,
      heightInMeters: floors * 3,
      layout: {
        neighborhoodId: district.id,
        archetype: archetype.id,
        roadSetbackInMeters: setback,
        buildingGapInMeters: gap,
      },
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
  // Find remaining free land instead of replacing occupied blocks with decoration.
  for (
    let attempt = 0;
    attempt < preset.parkAttemptLimit && parks.length < preset.parkTarget;
    attempt++
  ) {
    const p = point(0.08 + random() * 0.84, 0.09 + random() * 0.82);
    const halfX = (10 + random() * 4) * scale;
    const halfY = (10 + random() * 4) * scale;
    const radius = Math.hypot(halfX, halfY);
    if (
      !waterClear(p, radius + 3 * scale) ||
      roadDistance(p) > 65 * scale ||
      roads.some(
        (road) =>
          distanceToSegment(p, road.start, road.end) <
          radius + roadExtent(road) + 2 * scale,
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
        (existing: Block & Pick<Building, 'layout'>) => {
          const gap = Math.max(
            3 * scale,
            existing.layout?.buildingGapInMeters ?? 0,
          );
          return (
            minCorner.x < existing.maxCorner.x + gap &&
            maxCorner.x > existing.minCorner.x - gap &&
            minCorner.y < existing.maxCorner.y + gap &&
            maxCorner.y > existing.minCorner.y - gap
          );
        },
      )
    )
      continue;
    const park = { id: `organic-park-${parks.length}`, minCorner, maxCorner };
    parks.push(park);
  }
  const layouts = parks.map((park) =>
    createParkLayout(park, park.id === civicParkId),
  );
  const amenities = layouts.flatMap((layout) => layout.amenities);
  const parkPaths = layouts.flatMap((layout) => layout.parkPaths);
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
    Array.from(
      { length: Math.ceil(length / preset.cellSizeInMeters) + 1 },
      (_, i) => Math.min(i * preset.cellSizeInMeters, length),
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
  const city: CityResponse = {
    config: {
      ...source.config,
      widthInMeters: width,
      heightInMeters: height,
      seed,
    },
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
      urban: { yards: [], parkPaths, amenities, streetDetails: [] },
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
