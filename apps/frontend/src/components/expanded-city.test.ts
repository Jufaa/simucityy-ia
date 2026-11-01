import { describe, expect, it } from 'vitest';
import { createOrganicCity, waterSurfaceAt } from './organic-city-model';
import { createRandomCityProfile } from './random-city-profile';
import { sampleRoadSurfaceHeight } from './road-surface';
import { sampleTerrainHeight } from './terrain-view';
import { generateWorld } from './world-model';
import type { CityResponse, Point } from './city-types';

const source: CityResponse = {
  config: {
    widthInMeters: 1200,
    heightInMeters: 1000,
    streetSpacingInMeters: 80,
  },
  terrain: { kind: 'flat', elevationInMeters: 0 },
  roads: [],
  blocks: [],
  buildings: [],
  citizens: Array.from({ length: 300 }, (_, i) => ({
    id: `person-${i}`,
    homeBuildingId: 'old',
    nodeId: 'old',
    position: { x: 0, y: 0 },
    mobilityFactor: 0.8 + (i % 3) / 10,
    reactionDelayInSeconds: i % 10,
  })),
};
const metropolitanSource: CityResponse = {
  ...source,
  config: { ...source.config, widthInMeters: 1800, heightInMeters: 1500 },
};

function reachable(city: CityResponse) {
  const graph = city.roadGraph!;
  const visited = new Set([graph.nodes[0]!.id]);
  for (const id of visited)
    for (const edge of graph.edges!) {
      const next =
        edge.from === id ? edge.to : edge.to === id ? edge.from : undefined;
      if (next) visited.add(next);
    }
  return visited.size;
}

function points(a: Point, b: Point) {
  const count = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8);
  return Array.from({ length: count + 1 }, (_, i) => ({
    x: a.x + ((b.x - a.x) * i) / count,
    y: a.y + ((b.y - a.y) * i) / count,
  }));
}

describe('expanded organic city', () => {
  it.each([0, 1, 42, 123, 2026, 0xffffffff])(
    'builds coherent full-size districts for seed %s',
    (seed) => {
      const before = JSON.stringify(source);
      for (const relief of [false, true]) {
        const { city, geography } = createOrganicCity(source, seed, {
          expanded: true,
          relief,
        });
        expect(
          createOrganicCity(source, seed, { expanded: true, relief }),
        ).toEqual({ city, geography });
        expect(geography.neighborhoods.length).toBeGreaterThanOrEqual(5);
        expect(geography.neighborhoods.length).toBeLessThanOrEqual(7);
        expect(city.buildings.length).toBeGreaterThanOrEqual(350);
        expect(city.buildings.length).toBeLessThanOrEqual(500);
        expect(city.district!.parks.length).toBeGreaterThanOrEqual(8);
        expect(city.district!.parks.length).toBeLessThanOrEqual(12);
        expect(city.district!.roadWidthInMeters).toBe(8);
        expect(city.district!.sidewalkWidthInMeters).toBe(2);
        const grid = city.terrainGrid!;
        expect(
          grid.xCoordinates.length * grid.yCoordinates.length,
        ).toBeLessThanOrEqual(6400);
        const world = generateWorld(city, seed);
        expect(
          world.terrainGrid.xCoordinates.length *
            world.terrainGrid.yCoordinates.length,
        ).toBeLessThanOrEqual(60000);
        expect(reachable(city)).toBe(city.roadGraph!.nodes.length);
        expect(city.roadGraph!.edges!.length).toBeGreaterThan(
          city.roadGraph!.nodes.length,
        );
        expect(geography.bridges.length).toBeGreaterThanOrEqual(2);
        expect(geography.bridges.length).toBeLessThanOrEqual(3);
        for (const bridge of geography.bridges) {
          expect(
            bridge.roadIds.every((id) => city.roads.some((r) => r.id === id)),
          ).toBe(true);
          expect(
            bridge.edgeIds.every((id) =>
              city.roadGraph!.edges!.some((e) => e.id === id),
            ),
          ).toBe(true);
          const wet = points(bridge.start, bridge.end).filter(
            (p) => waterSurfaceAt(geography, p) !== undefined,
          );
          expect(wet.length).toBeGreaterThan(0);
          const bed = wet[Math.floor(wet.length / 2)]!;
          expect(sampleTerrainHeight(city, bed.x, bed.y)).toBeLessThan(
            waterSurfaceAt(geography, bed)!,
          );
          for (const p of wet) {
            expect(sampleRoadSurfaceHeight(city, p.x, p.y)).toBeCloseTo(
              bridge.deckElevationInMeters,
            );
            expect(sampleTerrainHeight(city, p.x, p.y)).toBeLessThan(
              bridge.deckElevationInMeters,
            );
          }
          for (const p of [bridge.start, bridge.end]) {
            expect(waterSurfaceAt(geography, p)).toBeUndefined();
            expect(sampleTerrainHeight(city, p.x, p.y)).toBeCloseTo(
              bridge.deckElevationInMeters,
              1,
            );
          }
        }
        for (const road of city.roads) {
          if (geography.bridges.some((b) => b.roadIds.includes(road.id)))
            continue;
          const dx = road.end.x - road.start.x,
            dy = road.end.y - road.start.y,
            length = Math.hypot(dx, dy);
          for (const p of points(road.start, road.end))
            for (const offset of [-4, 0, 4])
              expect(
                waterSurfaceAt(geography, {
                  x: p.x - (dy / length) * offset,
                  y: p.y + (dx / length) * offset,
                }),
              ).toBeUndefined();
        }
        for (const [i, building] of city.buildings.entries()) {
          expect(building.presentation!.widthInMeters).toBeLessThanOrEqual(19);
          expect(building.presentation!.depthInMeters).toBeLessThanOrEqual(19);
          expect(building.minCorner.x).toBeGreaterThan(30);
          expect(building.maxCorner.x).toBeLessThan(1170);
          expect(building.minCorner.y).toBeGreaterThan(30);
          expect(building.maxCorner.y).toBeLessThan(970);
          const center = {
            x: (building.minCorner.x + building.maxCorner.x) / 2,
            y: (building.minCorner.y + building.maxCorner.y) / 2,
          };
          expect(
            geography.neighborhoods.some(
              (n) =>
                ((center.x - n.center.x) / n.radiusX) ** 2 +
                  ((center.y - n.center.y) / n.radiusZ) ** 2 <=
                1,
            ),
          ).toBe(true);
          for (const x of [building.minCorner.x, building.maxCorner.x])
            for (const y of [building.minCorner.y, building.maxCorner.y])
              expect(waterSurfaceAt(geography, { x, y })).toBeUndefined();
          expect(
            city.buildings
              .slice(i + 1)
              .some(
                (other) =>
                  building.minCorner.x < other.maxCorner.x &&
                  building.maxCorner.x > other.minCorner.x &&
                  building.minCorner.y < other.maxCorner.y &&
                  building.maxCorner.y > other.minCorner.y,
              ),
          ).toBe(false);
        }
        for (const park of city.district!.parks) {
          for (const x of [park.minCorner.x, park.maxCorner.x])
            for (const y of [park.minCorner.y, park.maxCorner.y])
              expect(waterSurfaceAt(geography, { x, y })).toBeUndefined();
          expect(
            [
              ...city.buildings,
              ...city.district!.parks.filter((other) => other.id !== park.id),
            ].some(
              (other) =>
                park.minCorner.x < other.maxCorner.x &&
                park.maxCorner.x > other.minCorner.x &&
                park.minCorner.y < other.maxCorner.y &&
                park.maxCorner.y > other.minCorner.y,
            ),
          ).toBe(false);
          for (const road of city.roads)
            for (const p of points(road.start, road.end))
              expect(
                p.x > park.minCorner.x - 4 &&
                  p.x < park.maxCorner.x + 4 &&
                  p.y > park.minCorner.y - 4 &&
                  p.y < park.maxCorner.y + 4,
              ).toBe(false);
        }
        expect(
          city.citizens?.map((c) => [
            c.id,
            c.mobilityFactor,
            c.reactionDelayInSeconds,
          ]),
        ).toEqual(
          source.citizens?.map((c) => [
            c.id,
            c.mobilityFactor,
            c.reactionDelayInSeconds,
          ]),
        );
        for (const c of city.citizens!) {
          expect(city.buildings.some((b) => b.id === c.homeBuildingId)).toBe(
            true,
          );
          expect(city.roadGraph!.nodes.some((n) => n.id === c.nodeId)).toBe(
            true,
          );
        }
      }
      expect(JSON.stringify(source)).toBe(before);
    },
  );

  it('keeps random profiles reproducible while mapping density to expanded budgets', () => {
    const profiles = [0, 123, 2026].map(createRandomCityProfile);
    const cities = profiles.map(
      (profile, i) =>
        createOrganicCity(source, i, { expanded: true, profile }).city,
    );
    for (const [i, city] of cities.entries()) {
      const profile = profiles[i];
      if (!profile) throw new Error('Missing generated city profile.');
      expect(
        createOrganicCity(source, i, { expanded: true, profile }).city,
      ).toEqual(city);
      expect(city.buildings.length).toBeGreaterThanOrEqual(350);
      expect(city.buildings.length).toBeLessThanOrEqual(500);
      expect(city.district!.parks.length).toBeGreaterThanOrEqual(8);
      expect(city.district!.parks.length).toBeLessThanOrEqual(12);
    }
    expect(new Set(cities.map((c) => c.buildings.length)).size).toBeGreaterThan(
      1,
    );
  });

  it('builds a deterministic metropolitan skyline with denser low-rise districts', () => {
    const first = createOrganicCity(metropolitanSource, 2026, {
      expanded: true,
      metropolitan: true,
    });
    const second = createOrganicCity(metropolitanSource, 2026, {
      expanded: true,
      metropolitan: true,
    });
    expect(second).toEqual(first);
    expect(first.city.buildings.length).toBeGreaterThan(650);
    const skyline = first.city.buildings.filter((building) =>
      first.city.organic!.neighborhoods.some(
        (neighborhood) =>
          neighborhood.id === 'downtown' &&
          (((building.minCorner.x + building.maxCorner.x) / 2 -
            neighborhood.center.x) /
            neighborhood.radiusX) **
            2 +
            (((building.minCorner.y + building.maxCorner.y) / 2 -
              neighborhood.center.y) /
              neighborhood.radiusZ) **
              2 <
            1 &&
          building.heightInMeters >= 90,
      ),
    );
    expect(skyline.length).toBeGreaterThan(20);
    expect(
      first.city.buildings.filter((building) => building.heightInMeters <= 12)
        .length,
    ).toBeGreaterThan(100);
    expect(reachable(first.city)).toBe(first.city.roadGraph!.nodes.length);
  });

  it('preserves seeded density variation in metropolitan mode', () => {
    const profiles = [
      {
        buildingTarget: 110,
        parkTarget: 2,
        heightScale: 0.65,
        lakeScale: 0.8,
        riverWidthScale: 0.8,
      },
      {
        buildingTarget: 190,
        parkTarget: 7,
        heightScale: 1.4,
        lakeScale: 1.1,
        riverWidthScale: 1.15,
      },
    ];
    const cities = profiles.map(
      (profile, seed) =>
        createOrganicCity(metropolitanSource, seed, {
          metropolitan: true,
          profile,
        }).city,
    );
    expect(cities[0]!.buildings.length).toBeLessThan(
      cities[1]!.buildings.length,
    );
    expect(cities[0]!.district!.parks.length).toBeLessThan(
      cities[1]!.district!.parks.length,
    );
  });

  it('fills both sides of the river with continuous neighborhoods and a smaller lake', () => {
    const defaultCity = createOrganicCity(metropolitanSource, 2026, {
      metropolitan: true,
    });
    const profiles = [
      {
        buildingTarget: 110,
        parkTarget: 2,
        heightScale: 0.65,
        lakeScale: 0.8,
        riverWidthScale: 0.8,
      },
      {
        buildingTarget: 190,
        parkTarget: 7,
        heightScale: 1.4,
        lakeScale: 1.1,
        riverWidthScale: 1.15,
      },
    ];
    const profiled = profiles.map((profile, seed) =>
      createOrganicCity(metropolitanSource, seed, {
        metropolitan: true,
        profile,
      }),
    );
    const buildings = defaultCity.city.buildings;
    const lowRise = buildings.filter(
      (building) => building.heightInMeters <= 30,
    );
    const occupiedCells = new Set(
      lowRise.map((building) => {
        const x = (building.minCorner.x + building.maxCorner.x) / 2;
        const y = (building.minCorner.y + building.maxCorner.y) / 2;
        return `${Math.floor(x / 100)}:${Math.floor(y / 100)}`;
      }),
    );
    const skyline = buildings.filter(
      (building) => building.heightInMeters >= 90,
    );
    expect(buildings).toHaveLength(1350);
    expect(profiled[0]!.city.buildings).toHaveLength(1000);
    expect(profiled[1]!.city.buildings).toHaveLength(1700);
    expect(occupiedCells.size).toBeGreaterThan(140);
    expect(defaultCity.geography.lake.radiusX).toBeLessThan(80);
    expect(skyline.length).toBeGreaterThan(100);
    expect(
      skyline.filter((building) => building.minCorner.x < 0.48 * 1800).length,
    ).toBeGreaterThan(10);
    expect(
      skyline.filter((building) => building.maxCorner.x > 0.52 * 1800).length,
    ).toBeGreaterThan(10);
    expect(
      Math.max(...skyline.map((building) => building.maxCorner.x)) -
        Math.min(...skyline.map((building) => building.minCorner.x)),
    ).toBeGreaterThan(0.35 * 1800);
    expect(reachable(defaultCity.city)).toBe(
      defaultCity.city.roadGraph!.nodes.length,
    );
  });

  it('keeps the largest supported lake and all bridge landings separated at maximum density', () => {
    const profile = {
      buildingTarget: 190,
      parkTarget: 7,
      heightScale: 1.4,
      lakeScale: 1.1,
      riverWidthScale: 1.15,
    };
    for (const seed of [0, 1, 42, 123, 2026, 0xffffffff]) {
      const { city, geography } = createOrganicCity(source, seed, {
        expanded: true,
        profile,
      });
      expect(city.buildings).toHaveLength(500);
      expect(city.district!.parks).toHaveLength(12);
      for (const bridge of geography.bridges)
        for (const p of [bridge.start, bridge.end]) {
          expect(waterSurfaceAt(geography, p)).toBeUndefined();
          expect(sampleTerrainHeight(city, p.x, p.y)).toBeCloseTo(
            bridge.deckElevationInMeters,
            1,
          );
        }
      for (const road of city.roads) {
        if (geography.bridges.some((b) => b.roadIds.includes(road.id)))
          continue;
        for (const p of points(road.start, road.end))
          expect(waterSurfaceAt(geography, p)).toBeUndefined();
      }
    }
  });
});
