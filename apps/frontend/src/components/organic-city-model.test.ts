import { describe, expect, it } from 'vitest';
import { EvacuationEngine } from '@simulicity/hazards';
import { createOrganicCity, waterSurfaceAt } from './organic-city-model';
import type { CityResponse, Point } from './city-types';

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
          for (const offset of [-4, 0, 4])
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
