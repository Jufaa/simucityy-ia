import { expect, it } from 'vitest';
import { generateCityScenario } from '../../../backend/src/modules/cities/city-scenario-generator';
import type { CityResponse } from './city-types';
import { createStaticPopulation } from './static-population';

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
