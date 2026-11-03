import { describe, expect, it } from 'vitest';
import { EvacuationEngine } from '@simulicity/hazards';
import { createOrganicCity, waterSurfaceAt } from './organic-city-model';
import type { CityResponse, Point } from './city-types';
import { createRandomCityProfile } from './random-city-profile';

const source: CityResponse = {
  config: {
    widthInMeters: 500,
    heightInMeters: 500,
    streetSpacingInMeters: 50,
  },
  terrain: { kind: 'flat', elevationInMeters: 0 },
  roads: [],
  blocks: [],
  buildings: [],
  citizens: Array.from({ length: 200 }, (_, i) => ({
    id: `source-citizen-${i}`,
    homeBuildingId: 'old-home',
    nodeId: 'old-node',
    position: { x: 0, y: 0 },
    mobilityFactor: 1,
    reactionDelayInSeconds: 2,
  })),
};

function reachable(city: CityResponse, start: string, bridge = true) {
  const visited = new Set([start]);
  const queue = [start];
  for (const id of queue)
    for (const edge of city.roadGraph!.edges!) {
      if (!bridge && city.organic!.bridges[0]!.edgeIds.includes(edge.id))
        continue;
      const next =
        edge.from === id ? edge.to : edge.to === id ? edge.from : undefined;
      if (next && !visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  return visited;
}

function samples(a: Point, b: Point) {
  return Array.from({ length: 101 }, (_, i) => ({
    x: a.x + ((b.x - a.x) * i) / 100,
    y: a.y + ((b.y - a.y) * i) / 100,
  }));
}

describe('geography-first organic city', () => {
  it.each(
    (['district', 'city'] as const).flatMap((mode) =>
      [0, 42, 2026].flatMap((seed) =>
        [false, true].map((relief) => ({ mode, seed, relief })),
      ),
    ),
  )(
    'reserves a dry civic site before buildings ($mode/$seed/relief=$relief)',
    ({ mode, seed, relief }) => {
      const before = structuredClone(source);
      const { city, geography } = createOrganicCity(source, seed, {
        mode,
        relief,
      });
      const park = city.district!.parks[0]!;
      expect(park.maxCorner.x - park.minCorner.x).toBeCloseTo(
        mode === 'city' ? 48 : 32,
      );
      expect(park.maxCorner.y - park.minCorner.y).toBeCloseTo(
        mode === 'city' ? 40 : 28,
      );
      expect(
        city.district!.urban!.parkPaths.filter(
          (path) => path.parkId === park.id,
        ).length,
      ).toBeGreaterThanOrEqual(4);
      expect(city.district!.parks).toHaveLength(mode === 'city' ? 12 : 4);
      expect(city.buildings.length).toBeGreaterThanOrEqual(
        mode === 'city' ? 600 : 180,
      );
      for (let x = park.minCorner.x; x <= park.maxCorner.x; x += 2)
        for (let y = park.minCorner.y; y <= park.maxCorner.y; y += 2)
          expect(waterSurfaceAt(geography, { x, y })).toBeUndefined();
      expect(source).toEqual(before);
      for (const park of city.district!.parks) {
        for (const building of city.buildings) {
          const gap = Math.max(3, building.layout!.buildingGapInMeters);
          expect(
            building.maxCorner.x <= park.minCorner.x - gap ||
              building.minCorner.x >= park.maxCorner.x + gap ||
              building.maxCorner.y <= park.minCorner.y - gap ||
              building.minCorner.y >= park.maxCorner.y + gap,
          ).toBe(true);
        }
      }
    },
  );
  it.each([0, 42, 123])(
    'grows a bounded multi-neighborhood city without scaling up buildings for seed %s',
    (seed) => {
      const before = JSON.stringify(source);
      const result = createOrganicCity(source, seed, { mode: 'city' });
      const { city, geography } = result;
      expect(city.config.widthInMeters).toBe(1200);
      expect(city.config.heightInMeters).toBe(1200);
      expect(geography.neighborhoods).toHaveLength(8);
      expect(city.roads.length).toBeGreaterThan(27);
      expect(city.buildings.length).toBeGreaterThanOrEqual(600);
      expect(city.buildings.length).toBeLessThanOrEqual(800);
      expect(city.district!.parks.length).toBeGreaterThanOrEqual(8);
      expect(city.terrainGrid!.xCoordinates).toHaveLength(61);
      expect(city.terrainGrid!.yCoordinates).toHaveLength(61);
      expect(city.citizens?.map((person) => person.id)).toEqual(
        source.citizens?.map((person) => person.id),
      );
      const bands = new Set<string>();
      for (const building of city.buildings) {
        expect(building.presentation!.widthInMeters).toBeLessThanOrEqual(19);
        expect(building.presentation!.depthInMeters).toBeLessThanOrEqual(17);
        const x = (building.minCorner.x + building.maxCorner.x) / 2;
        const y = (building.minCorner.y + building.maxCorner.y) / 2;
        bands.add(
          `${x < 600 ? 'west' : 'east'}:${Math.min(3, Math.floor(y / 300))}`,
        );
      }
      expect(bands.size).toBe(8);
      for (const road of city.roads) {
        const bridge = geography.bridges.find((item) =>
          item.roadIds.includes(road.id),
        );
        expect(road.profile!.widthInMeters).toBe(
          bridge
            ? 10
            : road.profile!.kind === 'avenue'
              ? 12
              : road.profile!.kind === 'local'
                ? 8
                : 4,
        );
      }
      expect(reachable(city, city.roadGraph!.nodes[0]!.id).size).toBe(
        city.roadGraph!.nodes.length,
      );
      expect(createOrganicCity(source, seed, { mode: 'city' })).toEqual(result);
      expect(JSON.stringify(source)).toBe(before);
    },
  );
  it.each([0, 42, 123])(
    'builds six inspectable neighborhood archetypes with mutual setbacks for seed %s',
    (seed) => {
      const { city, geography } = createOrganicCity(source, seed);
      expect(
        new Set(city.buildings.map((building) => building.layout?.archetype))
          .size,
      ).toBe(6);
      for (const building of city.buildings) {
        expect(building.layout).toBeDefined();
        const layout = building.layout!;
        expect(
          geography.neighborhoods.some(
            (district) => district.id === layout.neighborhoodId,
          ),
        ).toBe(true);
        expect(layout.roadSetbackInMeters).toBeGreaterThan(0);
        const center = {
          x: (building.minCorner.x + building.maxCorner.x) / 2,
          y: (building.minCorner.y + building.maxCorner.y) / 2,
        };
        const radius =
          Math.hypot(
            building.presentation!.widthInMeters,
            building.presentation!.depthInMeters,
          ) / 2;
        for (const road of city.roads) {
          const dx = road.end.x - road.start.x,
            dy = road.end.y - road.start.y;
          const t = Math.max(
            0,
            Math.min(
              1,
              ((center.x - road.start.x) * dx +
                (center.y - road.start.y) * dy) /
                (dx * dx + dy * dy),
            ),
          );
          const distance = Math.hypot(
            center.x - road.start.x - t * dx,
            center.y - road.start.y - t * dy,
          );
          expect(distance + 1e-8).toBeGreaterThanOrEqual(
            radius +
              road.profile!.widthInMeters / 2 +
              road.profile!.sidewalkWidthInMeters +
              layout.roadSetbackInMeters,
          );
        }
        for (const other of city.buildings) {
          if (other.id === building.id) continue;
          const gap = Math.max(
            layout.buildingGapInMeters,
            other.layout!.buildingGapInMeters,
          );
          const separated =
            building.maxCorner.x + gap <= other.minCorner.x ||
            other.maxCorner.x + gap <= building.minCorner.x ||
            building.maxCorner.y + gap <= other.minCorner.y ||
            other.maxCorner.y + gap <= building.minCorner.y;
          expect(separated).toBe(true);
        }
      }
    },
  );
  it('generates wider avenues, secondary streets and pedestrian circuits without widening the bridge', () => {
    const { city, geography } = createOrganicCity(source, 42);
    expect(new Set(city.roads.map((road) => road.profile?.kind))).toEqual(
      new Set(['avenue', 'local', 'alley']),
    );
    for (const road of city.roads) {
      const bridge = geography.bridges.find((item) =>
        item.roadIds.includes(road.id),
      );
      expect(road.profile?.widthInMeters).toBe(
        bridge
          ? bridge.widthInMeters
          : road.profile?.kind === 'avenue'
            ? 12
            : road.profile?.kind === 'local'
              ? 8
              : 4,
      );
      expect(road.profile?.motorVehiclesAllowed).toBe(
        road.profile?.kind !== 'alley',
      );
    }
  });
  it('varies neighborhood centers and dimensions reproducibly within each riverbank', () => {
    const first = createOrganicCity(source, 42).geography.neighborhoods;
    expect(createOrganicCity(source, 42).geography.neighborhoods).toEqual(
      first,
    );
    const second = createOrganicCity(source, 123).geography.neighborhoods;
    first.forEach((district, i) => {
      expect(second[i]!.center).not.toEqual(district.center);
      expect(second[i]!.radiusX).not.toBe(district.radiusX);
      expect(second[i]!.radiusZ).not.toBe(district.radiusZ);
      for (const candidate of [district, second[i]!]) {
        expect(candidate.center.x).toBeGreaterThan(0);
        expect(candidate.center.x).toBeLessThan(source.config.widthInMeters);
        expect(candidate.center.y).toBeGreaterThan(0);
        expect(candidate.center.y).toBeLessThan(source.config.heightInMeters);
        expect(candidate.center.x < source.config.widthInMeters / 2).toBe(
          candidate.kind !== 'commercial',
        );
        expect(candidate.radiusX).toBeGreaterThan(0);
        expect(candidate.radiusZ).toBeGreaterThan(0);
      }
    });
  });

  it.each([0, 1, 42, 123, 2026, 0xffffffff])(
    'provides local detours on both riverbanks without another river crossing for seed %s',
    (seed) => {
      const { city, geography } = createOrganicCity(source, seed);
      const bridgeIds = new Set(geography.bridges.flatMap((b) => b.edgeIds));
      const graph = city.roadGraph!;
      const localEdges = graph.edges!.filter((edge) => !bridgeIds.has(edge.id));
      const components = city.shelters!.map((shelter) =>
        reachable(city, shelter.nodeId, false),
      );
      expect(components[0]!.size + components[1]!.size).toBe(
        graph.nodes.length,
      );
      expect([...components[0]!].some((id) => components[1]!.has(id))).toBe(
        false,
      );
      for (const component of components) {
        const edges = localEdges.filter((edge) => component.has(edge.from));
        expect(edges.length).toBeGreaterThanOrEqual(component.size);
        const hasDetour = edges.some((closed) => {
          const visited = new Set([closed.from]);
          const queue = [closed.from];
          for (const id of queue)
            for (const edge of edges) {
              if (edge.id === closed.id) continue;
              const next =
                edge.from === id
                  ? edge.to
                  : edge.to === id
                    ? edge.from
                    : undefined;
              if (next && !visited.has(next)) {
                visited.add(next);
                queue.push(next);
              }
            }
          return visited.has(closed.to);
        });
        expect(hasDetour).toBe(true);
      }
    },
  );

  it.each([0, 1, 42, 123, 2026, 0xffffffff])(
    'keeps random profile seed %s dry, connected and reproducible',
    (seed) => {
      const profile = createRandomCityProfile(seed);
      for (const relief of [false, true]) {
        const result = createOrganicCity(source, seed, { relief, profile });
        expect(createOrganicCity(source, seed, { relief, profile })).toEqual(
          result,
        );
        const { city, geography } = result;
        expect(city.config.seed).toBe(seed);
        expect(city.buildings.length).toBeGreaterThan(0);
        expect(city.buildings.length).toBeLessThanOrEqual(
          profile.buildingTarget,
        );
        expect(city.district!.parks.length).toBeLessThanOrEqual(
          profile.parkTarget,
        );
        expect(city.citizens).toHaveLength(source.citizens!.length);
        expect(reachable(city, city.roadGraph!.nodes[0]!.id).size).toBe(
          city.roadGraph!.nodes.length,
        );
        for (const building of city.buildings)
          for (const x of [building.minCorner.x, building.maxCorner.x])
            for (const y of [building.minCorner.y, building.maxCorner.y])
              expect(waterSurfaceAt(geography, { x, y })).toBeUndefined();
        for (const road of city.roads) {
          if (
            geography.bridges.some((bridge) => bridge.roadIds.includes(road.id))
          )
            continue;
          for (const p of samples(road.start, road.end))
            expect(waterSurfaceAt(geography, p)).toBeUndefined();
        }
      }
    },
  );

  it('rejects out-of-budget generation controls instead of silently ignoring them', () => {
    const profile = createRandomCityProfile(123);
    for (const key of Object.keys(profile) as (keyof typeof profile)[])
      for (const value of [NaN, Infinity, -1, 10000])
        expect(() =>
          createOrganicCity(source, 123, {
            profile: { ...profile, [key]: value },
          }),
        ).toThrow(RangeError);
    expect(() =>
      createOrganicCity(source, 123, {
        profile: { ...profile, buildingTarget: 110.5 },
      }),
    ).toThrow(RangeError);
  });

  it('applies explicit density, parks, height and water profiles without mutating the source', () => {
    const before = JSON.stringify(source);
    const profile = {
      buildingTarget: 110,
      parkTarget: 7,
      heightScale: 0.75,
      lakeScale: 0.85,
      riverWidthScale: 0.85,
    };
    const { city, geography } = createOrganicCity(source, 42, { profile });
    const standard = createOrganicCity(source, 42);
    expect(city.buildings).toHaveLength(110);
    expect(city.district!.parks).toHaveLength(7);
    expect(geography.lake.radiusX).toBeCloseTo(52 * profile.lakeScale);
    expect(geography.river.widthInMeters).toBeCloseTo(
      20 * profile.riverWidthScale,
    );
    expect(
      Math.max(...city.buildings.map((b) => b.heightInMeters)),
    ).toBeLessThan(
      Math.max(...standard.city.buildings.map((b) => b.heightInMeters)),
    );
    expect(createOrganicCity(source, 42, { profile })).toEqual({
      city,
      geography,
    });
    expect(city.citizens?.map((c) => c.id)).toEqual(
      source.citizens?.map((c) => c.id),
    );
    expect(reachable(city, city.roadGraph!.nodes[0]!.id).size).toBe(
      city.roadGraph!.nodes.length,
    );
    expect(JSON.stringify(source)).toBe(before);
  });
  it('generates a fallback population accepted by the evacuation engine', () => {
    const fallbackSource = structuredClone(source);
    delete fallbackSource.citizens;
    const { city } = createOrganicCity(fallbackSource, 42);
    expect(
      () =>
        new EvacuationEngine({
          roadGraph: {
            nodes: city.roadGraph!.nodes,
            edges: city.roadGraph!.edges!,
          },
          citizens: city.citizens!,
          shelters: city.shelters!.map((s) => ({
            ...s,
            capacity: s.capacity!,
          })),
        }),
    ).not.toThrow();
    expect(
      createOrganicCity(source, 42).city.citizens!.map((c) => c.mobilityFactor),
    ).toEqual(source.citizens!.map((c) => c.mobilityFactor));
  });
  it.each([1, 42, 2026])(
    'is deterministic, immutable and coherent for seed %s',
    (seed) => {
      const before = JSON.stringify(source);
      const { city, geography } = createOrganicCity(source, seed);
      expect(createOrganicCity(source, seed)).toEqual({ city, geography });
      expect(createOrganicCity(source, seed + 1)).not.toEqual({
        city,
        geography,
      });
      expect(JSON.stringify(source)).toBe(before);
      expect(city.organic).toBe(geography);
      expect(city.buildings.length).toBeGreaterThan(100);
      expect(city.citizens?.map((c) => c.id)).toEqual(
        source.citizens?.map((c) => c.id),
      );
      const graph = city.roadGraph!;
      for (const p of graph.nodes) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        expect(p.x >= 0 && p.x <= 500 && p.y >= 0 && p.y <= 500).toBe(true);
      }
      expect(reachable(city, graph.nodes[0]!.id).size).toBe(graph.nodes.length);
      const bridge = geography.bridges[0]!;
      expect(
        samples(bridge.start, bridge.end).some(
          (p) =>
            ((p.x - geography.lake.center.x) / geography.lake.radiusX) ** 2 +
              ((p.y - geography.lake.center.y) / geography.lake.radiusZ) ** 2 <=
            1,
        ),
      ).toBe(true);
      const edge = graph.edges!.find((e) => bridge.edgeIds.includes(e.id))!;
      expect(reachable(city, edge.from, false).has(edge.to)).toBe(false);
      expect(waterSurfaceAt(geography, bridge.start)).toBeUndefined();
      expect(waterSurfaceAt(geography, bridge.end)).toBeUndefined();
      for (const e of graph.edges!) {
        expect(e.lengthInMeters).toBeGreaterThan(0);
        expect(graph.nodes.some((n) => n.id === e.from)).toBe(true);
        expect(graph.nodes.some((n) => n.id === e.to)).toBe(true);
      }
      for (const road of city.roads) {
        if (bridge.roadIds.includes(road.id)) continue;
        for (const p of samples(road.start, road.end)) {
          const dx = road.end.x - road.start.x,
            dy = road.end.y - road.start.y;
          const length = Math.hypot(dx, dy);
          const extent = road.profile
            ? road.profile.widthInMeters / 2 +
              road.profile.sidewalkWidthInMeters
            : 4;
          for (const offset of [-extent, 0, extent])
            expect(
              waterSurfaceAt(geography, {
                x: p.x - (dy / length) * offset,
                y: p.y + (dx / length) * offset,
              }),
            ).toBeUndefined();
        }
      }
      for (const building of city.buildings) {
        const { minCorner: a, maxCorner: b } = building;
        for (let x = a.x; x <= b.x; x += 2)
          for (let y = a.y; y <= b.y; y += 2)
            expect(waterSurfaceAt(geography, { x, y })).toBeUndefined();
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.y).toBeGreaterThanOrEqual(0);
        expect(b.x).toBeLessThanOrEqual(500);
        expect(b.y).toBeLessThanOrEqual(500);
      }
      expect(
        city.roads.some((r) => r.start.x !== r.end.x && r.start.y !== r.end.y),
      ).toBe(true);
      expect(
        city.buildings.filter(
          (b) => b.use === 'commercial' && b.architecture?.roof === 'flat',
        ).length,
      ).toBeGreaterThanOrEqual(6);
      expect(
        Math.max(...city.buildings.map((b) => b.heightInMeters)),
      ).toBeGreaterThan(25);
      expect(
        Math.min(...city.buildings.map((b) => b.heightInMeters)),
      ).toBeLessThan(10);
      for (const citizen of city.citizens!) {
        expect(
          city.buildings.some((b) => b.id === citizen.homeBuildingId),
        ).toBe(true);
        expect(graph.nodes.some((n) => n.id === citizen.nodeId)).toBe(true);
        expect(waterSurfaceAt(geography, citizen.position)).toBeUndefined();
      }
      for (const shelter of city.shelters!)
        expect(graph.nodes.some((n) => n.id === shelter.nodeId)).toBe(true);
    },
  );

  it.each([1, 42, 2026])(
    'places dry, unobstructed parks for seed %s',
    (seed) => {
      const { city, geography } = createOrganicCity(source, seed);
      expect(city.district!.parks.length).toBeGreaterThanOrEqual(1);
      for (const park of city.district!.parks) {
        const a = park.minCorner,
          b = park.maxCorner;
        expect(a.x >= 0 && a.y >= 0 && b.x <= 500 && b.y <= 500).toBe(true);
        for (let x = a.x; x <= b.x; x += 2)
          for (let y = a.y; y <= b.y; y += 2)
            expect(waterSurfaceAt(geography, { x, y })).toBeUndefined();
        expect(
          city.buildings.some(
            (building) =>
              a.x < building.maxCorner.x &&
              b.x > building.minCorner.x &&
              a.y < building.maxCorner.y &&
              b.y > building.minCorner.y,
          ),
        ).toBe(false);
        for (const road of city.roads)
          for (const p of samples(road.start, road.end)) {
            expect(
              p.x > a.x - 5 && p.x < b.x + 5 && p.y > a.y - 5 && p.y < b.y + 5,
            ).toBe(false);
          }
      }
    },
  );

  it.each([-1, 1.5, NaN, Infinity, 4294967296])(
    'rejects invalid seed %s',
    (seed) => {
      expect(() => createOrganicCity(source, seed)).toThrow(RangeError);
    },
  );
  it.each([0, -1, NaN, Infinity, Number.MAX_VALUE])(
    'rejects invalid dimensions %s',
    (dimension) => {
      for (const key of ['widthInMeters', 'heightInMeters'] as const)
        expect(() =>
          createOrganicCity(
            { ...source, config: { ...source.config, [key]: dimension } },
            42,
          ),
        ).toThrow(RangeError);
    },
  );

  it('keeps flat land flat but carves permanent basins in both terrain modes', () => {
    for (const relief of [false, true]) {
      const { city, geography } = createOrganicCity(source, 42, { relief });
      const grid = city.terrainGrid!;
      const land: number[] = [];
      const water: number[] = [];
      grid.yCoordinates.forEach((y, row) =>
        grid.xCoordinates.forEach((x, col) => {
          const value = grid.elevationsInMeters[row]![col]!;
          expect(Number.isFinite(value)).toBe(true);
          (waterSurfaceAt(geography, { x, y }) === undefined
            ? land
            : water
          ).push(value);
        }),
      );
      expect(Math.max(...water)).toBeLessThanOrEqual(0);
      expect(Math.min(...land)).toBeGreaterThan(0);
      // Flat plains retain gently graded shore banks rather than vertical walls.
      if (!relief)
        expect(
          land.filter((y) => y === city.terrain.elevationInMeters).length,
        ).toBeGreaterThan(land.length * 0.7);
      if (relief) expect(new Set(land).size).toBeGreaterThan(5);
    }
  });
});
