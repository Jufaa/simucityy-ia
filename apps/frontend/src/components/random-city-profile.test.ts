import { describe, expect, it } from 'vitest';
import { createRandomCityProfile } from './random-city-profile';

describe('random city profiles', () => {
  it('reproduces bounded city characteristics from an unsigned seed', () => {
    const profiles = [0, 1, 42, 123, 2026, 0xffffffff].map((seed) => {
      const profile = createRandomCityProfile(seed);
      expect(createRandomCityProfile(seed)).toEqual(profile);
      expect(profile.buildingTarget).toBeGreaterThanOrEqual(110);
      expect(profile.buildingTarget).toBeLessThanOrEqual(190);
      expect(profile.parkTarget).toBeGreaterThanOrEqual(2);
      expect(profile.parkTarget).toBeLessThanOrEqual(7);
      expect(profile.heightScale).toBeGreaterThanOrEqual(0.65);
      expect(profile.heightScale).toBeLessThanOrEqual(1.4);
      expect(profile.lakeScale).toBeGreaterThanOrEqual(0.8);
      expect(profile.lakeScale).toBeLessThanOrEqual(1.1);
      expect(profile.riverWidthScale).toBeGreaterThanOrEqual(0.8);
      expect(profile.riverWidthScale).toBeLessThanOrEqual(1.15);
      return profile;
    });
    for (const key of Object.keys(
      profiles[0]!,
    ) as (keyof (typeof profiles)[0])[])
      expect(new Set(profiles.map((p) => p[key])).size).toBeGreaterThan(1);
  });

  it.each([-1, 1.5, NaN, Infinity, 4294967296])(
    'rejects invalid seed %s',
    (seed) => {
      expect(() => createRandomCityProfile(seed)).toThrow(RangeError);
    },
  );
});
