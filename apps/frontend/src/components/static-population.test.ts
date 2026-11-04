import { expect, it } from 'vitest';
import { generateCityScenario } from '@simulicity/cities';
import type { CityResponse } from './city-types';
import { createStaticPopulation } from './static-population';

it('places idle people on the actual avenue sidewalk rather than inside its wider carriageway', () => {
  const city: CityResponse = {
    config: {
      widthInMeters: 200,
      heightInMeters: 200,
      streetSpacingInMeters: 50,
    },
    terrain: { kind: 'flat', elevationInMeters: 0 },
    roads: [
      {
        id: 'avenue',
        start: { x: 0, y: 100 },
        end: { x: 200, y: 100 },
        profile: {
          kind: 'avenue',
          widthInMeters: 12,
          sidewalkWidthInMeters: 3,
          motorVehiclesAllowed: true,
        },
      },
    ],
    buildings: [],
    blocks: [],
    roadGraph: {
      nodes: [
        { id: 'a', x: 0, y: 100 },
        { id: 'b', x: 200, y: 100 },
      ],
      edges: [
        {
          id: 'ab',
          roadId: 'avenue',
          from: 'a',
          to: 'b',
          lengthInMeters: 200,
          bidirectional: true,
        },
      ],
    },
    citizens: Array.from({ length: 2 }, (_, i) => ({
      id: `citizen-${i}`,
      homeBuildingId: 'home',
      nodeId: 'a',
      position: { x: 0, y: 100 },
      mobilityFactor: 1,
      reactionDelayInSeconds: 0,
    })),
  };
  const before = JSON.stringify(city);
  for (const person of createStaticPopulation(city))
    expect(Math.abs(person.position.y - 100)).toBe(7.5);
  expect(JSON.stringify(city)).toBe(before);
});

it('places all generated people visibly outside buildings with stable IDs and no source mutation', () => {
  const city: CityResponse = JSON.parse(
    JSON.stringify(
      generateCityScenario({
        layout: 'district',
        detailLevel: 'urban',
        config: {
          widthInMeters: 500,
          heightInMeters: 500,
          streetSpacingInMeters: 50,
          seed: 123,
        },
        terrain: { kind: 'flat', elevationInMeters: 25 },
        populationCount: 200,
      }),
    ),
  );
  const before = JSON.stringify(city),
    people = createStaticPopulation(city);
  expect(people.length).toBe(200);
  expect(createStaticPopulation(city)).toEqual(people);
  expect(people.map((p) => p.id).sort()).toEqual(
    city.citizens!.map((p) => p.id).sort(),
  );
  for (const person of people) {
    expect(person.position.x).toBeGreaterThanOrEqual(0);
    expect(person.position.x).toBeLessThanOrEqual(500);
    expect(person.position.y).toBeGreaterThanOrEqual(0);
    expect(person.position.y).toBeLessThanOrEqual(500);
    expect(
      city.buildings.some(
        (b) =>
          person.position.x > b.minCorner.x - 1 &&
          person.position.x < b.maxCorner.x + 1 &&
          person.position.y > b.minCorner.y - 1 &&
          person.position.y < b.maxCorner.y + 1,
      ),
    ).toBe(false);
  }
  expect(
    new Set(people.map((p) => `${p.position.x},${p.position.y}`)).size,
  ).toBe(200);
  expect(JSON.stringify(city)).toBe(before);
});
