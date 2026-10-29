import { expect, it } from 'vitest';
import { createDemoCompatibleScenario } from '@simulicity/hazards';
import type { CityResponse } from './city-types';
import { createReliefCity, sampleTerrainHeight } from './terrain-view';
import { generateWorld, sampleWorldHeight } from './world-model';

const city = (): CityResponse =>
  JSON.parse(
    JSON.stringify({
      ...createDemoCompatibleScenario(),
      terrain: { kind: 'flat', elevationInMeters: 25 },
      config: {
        widthInMeters: 500,
        heightInMeters: 500,
        streetSpacingInMeters: 50,
      },
      roads: [],
      blocks: [],
    }),
  );

it('generates deterministic varied surroundings without changing the city or flooding buildable land', () => {
  const source = createReliefCity(city()),
    before = JSON.stringify(source);
  const world = generateWorld(source, 123);
  expect(generateWorld(source, 123)).toEqual(world);
  expect(generateWorld(source, 124).terrainGrid.elevationsInMeters).not.toEqual(
    world.terrainGrid.elevationsInMeters,
  );
  expect(world.fields.length).toBeGreaterThan(0);
  expect(world.buildableAreas.length).toBeGreaterThan(0);
  expect(world.lake.center.x - world.lake.radiusX).toBeGreaterThan(500);
  expect(sampleWorldHeight(world, world.bounds.minX, 0)).toBeLessThan(
    world.seaLevel,
  );
  expect(
    sampleWorldHeight(world, world.lake.center.x, world.lake.center.y),
  ).toBeLessThan(world.lake.level);
  for (const area of [...world.fields, ...world.buildableAreas]) {
    expect(
      area.minCorner.y >= 500 ||
        area.maxCorner.y <= 0 ||
        area.minCorner.x >= 500 ||
        area.maxCorner.x <= 0,
    ).toBe(true);
    for (let row = 0; row <= 4; row++)
      for (let col = 0; col <= 4; col++) {
        const x =
            area.minCorner.x +
            ((area.maxCorner.x - area.minCorner.x) * col) / 4,
          z =
            area.minCorner.y +
            ((area.maxCorner.y - area.minCorner.y) * row) / 4;
        expect(sampleWorldHeight(world, x, z)).toBeGreaterThan(world.seaLevel);
        const lakeDistance =
          ((x - world.lake.center.x) / world.lake.radiusX) ** 2 +
          ((z - world.lake.center.y) / world.lake.radiusZ) ** 2;
        expect(lakeDistance).toBeGreaterThan(1.6);
      }
  }
  for (const x of [0, 100, 250, 500])
    for (const z of [0, 100, 250, 500])
      expect(sampleWorldHeight(world, x, z)).toBeCloseTo(
        sampleTerrainHeight(source, x, z),
      );
  expect(JSON.stringify(source)).toBe(before);
  expect(() => generateWorld(source, NaN)).toThrow(RangeError);
});
