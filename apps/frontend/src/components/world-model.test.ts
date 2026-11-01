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
  expect(world.fields.length).toBeGreaterThanOrEqual(10);
  expect(
    world.fields.filter((field) => field.kind === 'woodland').length,
  ).toBeGreaterThan(0);
  expect(world.trees.length).toBeGreaterThan(50);
  expect(generateWorld(source, 123).trees).toEqual(world.trees);
  expect(generateWorld(source, 124).trees).not.toEqual(world.trees);
  const mappedArea = world.fields.reduce(
    (total, field) =>
      total +
      (field.maxCorner.x - field.minCorner.x) *
        (field.maxCorner.y - field.minCorner.y),
    0,
  );
  expect(mappedArea).toBeGreaterThan(500_000);
  const landUses = [...world.fields, ...world.buildableAreas];
  for (let first = 0; first < landUses.length; first++)
    for (let second = first + 1; second < landUses.length; second++) {
      const a = landUses[first]!,
        b = landUses[second]!;
      expect(
        a.minCorner.x < b.maxCorner.x &&
          a.maxCorner.x > b.minCorner.x &&
          a.minCorner.y < b.maxCorner.y &&
          a.maxCorner.y > b.minCorner.y,
      ).toBe(false);
    }
  expect(new Set(world.fields.map((field) => field.kind)).size).toBeGreaterThan(
    1,
  );
  expect(world.port.berthCount).toBeGreaterThanOrEqual(2);
  expect(world.rail.points.length).toBeGreaterThanOrEqual(3);
  expect(generateWorld(source, 123).port).toEqual(world.port);
  expect(generateWorld(source, 123).rail).toEqual(world.rail);
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
  for (const area of world.fields) {
    expect(
      area.maxCorner.x <= 0 ||
        area.minCorner.x >= 500 ||
        area.maxCorner.y <= 0 ||
        area.minCorner.y >= 500,
    ).toBe(true);
  }
  for (const tree of world.trees) {
    expect(tree.position.x).toBeGreaterThanOrEqual(world.bounds.minX);
    expect(tree.position.x).toBeLessThanOrEqual(world.bounds.maxX);
    expect(tree.position.y).toBeGreaterThanOrEqual(world.bounds.minZ);
    expect(tree.position.y).toBeLessThanOrEqual(world.bounds.maxZ);
    expect(tree.scale).toBeGreaterThan(1);
    const lakeDistance =
      ((tree.position.x - world.lake.center.x) / world.lake.radiusX) ** 2 +
      ((tree.position.y - world.lake.center.y) / world.lake.radiusZ) ** 2;
    expect(lakeDistance).toBeGreaterThan(1.6);
  }
  for (const x of [0, 100, 250, 500])
    for (const z of [0, 100, 250, 500])
      expect(sampleWorldHeight(world, x, z)).toBeCloseTo(
        sampleTerrainHeight(source, x, z),
      );
  expect(JSON.stringify(source)).toBe(before);
  expect(() => generateWorld(source, NaN)).toThrow(RangeError);
});

it('covers the larger metropolitan outskirts with broad non-overlapping belts and mature tree sites', () => {
  const metropolis = city();
  metropolis.config.widthInMeters = 1800;
  metropolis.config.heightInMeters = 1500;
  const world = generateWorld(metropolis, 9876),
    repeated = generateWorld(metropolis, 9876);
  expect(world.fields).toEqual(repeated.fields);
  expect(world.trees).toEqual(repeated.trees);
  expect(world.fields.some((field) => field.maxCorner.x > 1800)).toBe(true);
  expect(
    Math.min(...world.fields.map((field) => field.minCorner.y)),
  ).toBeLessThan(-300);
  expect(
    Math.max(...world.fields.map((field) => field.maxCorner.y)),
  ).toBeGreaterThan(1800);
  expect(world.trees.length).toBeGreaterThan(100);
  expect(world.fields.some((field) => field.kind === 'woodland')).toBe(true);
});
