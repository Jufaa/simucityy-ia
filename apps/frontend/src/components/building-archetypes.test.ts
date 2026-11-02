import { expect, it } from 'vitest';
import { sampleBuildingArchetype } from './building-archetypes';
import { createCityRandom } from './random-city-profile';

it.each(['center', 'residential', 'commercial'] as const)(
  'samples two distinct reproducible rectangular archetypes for %s',
  (kind) => {
    const variants = [0, 0.75].map((value) =>
      sampleBuildingArchetype(kind, () => value),
    );
    expect(new Set(variants.map((variant) => variant.id)).size).toBe(2);
    expect(variants[0]).not.toEqual(variants[1]);
    const first = sampleBuildingArchetype(kind, createCityRandom(42));
    expect(sampleBuildingArchetype(kind, createCityRandom(42))).toEqual(first);
    for (const variant of variants) {
      const ratio = variant.widthInMeters / variant.depthInMeters;
      expect(ratio).toBeGreaterThanOrEqual(0.4);
      expect(ratio).toBeLessThanOrEqual(2.4);
      expect(variant.baseFloors).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(variant.baseFloors)).toBe(true);
      expect(variant.roadSetbackInMeters).toBeGreaterThan(0);
      expect(variant.buildingGapInMeters).toBeGreaterThan(0);
    }
  },
);

it('produces genuinely compact, slender and wide silhouettes, not only random square sizes', () => {
  const compact = sampleBuildingArchetype('residential', () => 0);
  const row = sampleBuildingArchetype('residential', () => 0.75);
  const tower = sampleBuildingArchetype('center', () => 0);
  const shop = sampleBuildingArchetype('commercial', () => 0);
  expect(compact.widthInMeters / compact.depthInMeters).toBeCloseTo(1);
  expect(row.depthInMeters / row.widthInMeters).toBeGreaterThan(1.5);
  expect(tower.depthInMeters / tower.widthInMeters).toBeGreaterThan(1.5);
  expect(shop.widthInMeters / shop.depthInMeters).toBeGreaterThan(1.5);
  expect(tower.baseFloors).toBeGreaterThan(shop.baseFloors);
  expect(row.roadSetbackInMeters).toBeGreaterThan(tower.roadSetbackInMeters);
});

it('rejects invalid random samples rather than producing invalid building dimensions', () => {
  for (const value of [-1, 1, NaN, Infinity])
    expect(() => sampleBuildingArchetype('center', () => value)).toThrow(
      RangeError,
    );
});
