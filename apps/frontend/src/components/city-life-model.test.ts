import { describe, expect, it } from 'vitest';
import type { CityResponse } from './city-types';
import { generateCityLife } from './city-life-model';

function streetCity(): CityResponse {
  return {
    config: {
      widthInMeters: 160,
      heightInMeters: 130,
      streetSpacingInMeters: 73,
      seed: 42,
    },
    terrain: { kind: 'flat', elevationInMeters: 12 },
    roads: [
      { id: 'h', start: { x: 0, y: 65 }, end: { x: 160, y: 65 } },
      { id: 'v', start: { x: 80, y: 0 }, end: { x: 80, y: 130 } },
    ],
    blocks: [],
    buildings: [],
    district: {
      roadWidthInMeters: 6,
      sidewalkWidthInMeters: 2,
      parks: [],
      sidewalks: [],
    },
    roadGraph: {
      nodes: [
        { id: 'center', x: 80, y: 65 },
        { id: 'end', x: 0, y: 65 },
      ],
    },
  };
}

describe('street-life placement', () => {
  it('is seeded, bounded, immutable and uses actual road coordinates', () => {
    const city = streetCity();
    const before = structuredClone(city);
    const model = generateCityLife(city);
    expect(model).toEqual(generateCityLife(city));
    expect(city).toEqual(before);
    expect(model.items.length).toBeGreaterThan(25);
    expect(model.items.length).toBeLessThanOrEqual(600);
    expect(model.items.some((p) => p.kind === 'traffic-light')).toBe(true);
    expect(model.items.some((p) => p.kind === 'bus-stop')).toBe(true);
    for (const p of model.items) {
      expect(p.bounds.minCorner.x).toBeGreaterThanOrEqual(0);
      expect(p.bounds.maxCorner.x).toBeLessThanOrEqual(160);
      expect(p.bounds.minCorner.y).toBeGreaterThanOrEqual(0);
      expect(p.bounds.maxCorner.y).toBeLessThanOrEqual(130);
      expect(p.ground).toBe(12);
    }
    city.config.seed = 43;
    expect(generateCityLife(city)).not.toEqual(model);
  });

  it('keeps building access, crossings, parks and buildings clear', () => {
    const city = streetCity();
    const blocked = {
      id: 'blocked',
      minCorner: { x: 20, y: 56 },
      maxCorner: { x: 58, y: 74 },
    };
    city.buildings.push({ ...blocked, heightInMeters: 6 });
    city.district!.parks.push({
      ...blocked,
      minCorner: { x: 100, y: 56 },
      maxCorner: { x: 125, y: 74 },
    });
    city.district!.urban = {
      yards: [],
      parkPaths: [],
      amenities: [],
      streetDetails: [
        {
          ...blocked,
          minCorner: { x: 130, y: 56 },
          maxCorner: { x: 142, y: 74 },
          sourceId: 'access',
          kind: 'building-access',
        },
      ],
    };
    const obstacles = [
      ...city.buildings,
      ...city.district!.parks,
      ...city.district!.urban.streetDetails,
    ];
    for (const { bounds: a } of generateCityLife(city).items) {
      for (const b of obstacles)
        expect(
          a.minCorner.x < b.maxCorner.x &&
            a.maxCorner.x > b.minCorner.x &&
            a.minCorner.y < b.maxCorner.y &&
            a.maxCorner.y > b.minCorner.y,
        ).toBe(false);
    }
  });

  it('reserves a continuous sidewalk corridor and skips sparse or narrow districts', () => {
    const city = streetCity();
    const items = generateCityLife(city).items;
    for (const p of items.filter(
      (p) => !['car', 'taxi', 'van', 'bus'].includes(p.kind),
    )) {
      expect(p.width).toBeLessThanOrEqual(0.6);
      // Curb furniture stays inside the first 0.65m of the 2m sidewalk.
      expect(
        Math.min(
          Math.abs(Math.abs(p.x - 80) - 3.35),
          Math.abs(Math.abs(p.z - 65) - 3.35),
        ),
      ).toBeLessThan(0.001);
    }
    city.district!.sidewalkWidthInMeters = 1;
    expect(
      generateCityLife(city).items.every((p) =>
        ['car', 'taxi', 'van', 'bus'].includes(p.kind),
      ),
    ).toBe(true);
    delete city.district;
    expect(generateCityLife(city).items).toEqual([]);
    city.roads = [];
    expect(generateCityLife(city).items).toEqual([]);
  });
});

it('uses no fake signals without graph intersections and bounds dense-city costs', () => {
  const city = streetCity();
  delete city.roadGraph;
  expect(
    generateCityLife(city).items.some((p) => p.kind === 'traffic-light'),
  ).toBe(false);
  city.config.widthInMeters = 100000;
  city.roads = [
    { id: 'long', start: { x: 0, y: 65 }, end: { x: 100000, y: 65 } },
  ];
  expect(generateCityLife(city).items.length).toBeLessThanOrEqual(600);
  city.roads = [{ id: 'short', start: { x: 5, y: 5 }, end: { x: 8, y: 5 } }];
  expect(generateCityLife(city).items).toEqual([]);
});
