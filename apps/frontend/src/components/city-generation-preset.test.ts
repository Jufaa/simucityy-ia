import { expect, it } from 'vitest';
import {
  getCityGenerationPreset,
  sameCityGeneration,
  type CityGenerationMode,
} from './city-generation-preset';
import { createRandomCityProfile } from './random-city-profile';

it('preserves district budgets and gives larger cities a separate bounded preset', () => {
  expect(getCityGenerationPreset()).toMatchObject({
    mode: 'district',
    buildingTarget: 190,
    parkTarget: 4,
    cellSizeInMeters: 10,
    roadRows: 5,
  });
  const city = getCityGenerationPreset('city');
  expect(city).toMatchObject({
    widthInMeters: 1200,
    heightInMeters: 1200,
    objectScale: 1,
    buildingTarget: 800,
    parkTarget: 12,
    cellSizeInMeters: 20,
    roadRows: 10,
  });
  expect(
    (city.widthInMeters! / city.cellSizeInMeters) *
      (city.heightInMeters! / city.cellSizeInMeters),
  ).toBe(3600);
});

it('maps existing random controls into bounded city targets without weakening their validation', () => {
  const profile = createRandomCityProfile(42);
  const lower = getCityGenerationPreset('city', {
    ...profile,
    buildingTarget: 110,
    parkTarget: 2,
  });
  const upper = getCityGenerationPreset('city', {
    ...profile,
    buildingTarget: 190,
    parkTarget: 7,
  });
  expect([lower.buildingTarget, upper.buildingTarget]).toEqual([600, 800]);
  expect([lower.parkTarget, upper.parkTarget]).toEqual([8, 16]);
  expect(() =>
    getCityGenerationPreset('city', { ...profile, buildingTarget: 800 }),
  ).toThrow(RangeError);
  expect(() =>
    getCityGenerationPreset('unknown' as CityGenerationMode),
  ).toThrow(RangeError);
});

it('includes size mode in generation identity so same-seed size changes cannot replay stale geometry', () => {
  const current = {
    seed: 123,
    randomized: false,
    layout: 'organic' as const,
    mode: 'district' as const,
  };
  expect(sameCityGeneration(current, { ...current })).toBe(true);
  for (const changed of [
    { ...current, mode: 'city' as const },
    { ...current, seed: 42 },
    { ...current, randomized: true },
    { ...current, layout: 'grid' as const },
  ])
    expect(sameCityGeneration(current, changed)).toBe(false);
});
