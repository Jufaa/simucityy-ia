import { describe, expect, it } from 'vitest';
import { generateCity } from '../../modules/cities/city-generator';
import { generateBlocks } from '../../modules/cities/block-generator';
import { generateBuildings } from '../../modules/cities/building-generator';
import { generateCityScenario } from '../../modules/cities/city-scenario-generator';
import { getElevation } from '../../modules/cities/terrain';
import { createRandom } from '../../modules/cities/utils/prng';

const config = {
  widthInMeters: 100,
  heightInMeters: 100,
  streetSpacingInMeters: 50,
  seed: 42,
};
const terrain = { kind: 'flat' as const, elevationInMeters: 0 };
const blocks = generateBlocks(config);

describe('city input validation', () => {
  it('counts vertical streets using width before applying the limit', () => {
    expect(() => generateCity({ ...config, widthInMeters: 50000 })).toThrow(
      RangeError,
    );
    expect(
      generateCity({ ...config, widthInMeters: 50, heightInMeters: 49850 })
        .roads,
    ).toHaveLength(1000);
  });

  it.each([
    'widthInMeters',
    'heightInMeters',
    'streetSpacingInMeters',
  ] as const)('rejects non-positive and non-finite %s', (field) => {
    for (const value of [0, -1, NaN, Infinity, -Infinity]) {
      expect(() => generateCity({ ...config, [field]: value })).toThrow(
        RangeError,
      );
    }
  });

  it('validates block generation independently of the road generator', () => {
    expect(() => generateBlocks({ ...config, widthInMeters: -1 })).toThrow(
      RangeError,
    );
  });

  it('preserves positive finite building heights at small and large scales', () => {
    for (const [min, max] of [
      [0.01, 0.04],
      [1e307, 1e308],
    ]) {
      if (min === undefined || max === undefined)
        throw new Error('Missing height range');
      for (const building of generateBuildings(blocks, 5, min, max, 42)) {
        expect(Number.isFinite(building.heightInMeters)).toBe(true);
        expect(building.heightInMeters).toBeGreaterThanOrEqual(min);
        expect(building.heightInMeters).toBeLessThanOrEqual(max);
      }
    }
  });

  it.each([-1, 1.5, NaN, Infinity, 4294967296])(
    'rejects invalid seed %s',
    (seed) => {
      expect(() => generateCity({ ...config, seed })).toThrow(RangeError);
      expect(() => createRandom(seed)).toThrow(RangeError);
    },
  );

  it.each([-1, NaN, Infinity])(
    'rejects invalid building margin %s',
    (margin) => {
      expect(() => generateBuildings(blocks, margin, 10)).toThrow(RangeError);
    },
  );

  it.each([0, -1, NaN, Infinity])(
    'rejects invalid building height %s',
    (height) => {
      expect(() => generateBuildings(blocks, 5, height)).toThrow(RangeError);
      expect(() => generateBuildings(blocks, 5, 5, height, 42)).toThrow(
        RangeError,
      );
    },
  );

  it('rejects reversed height ranges and incomplete random parameters', () => {
    expect(() => generateBuildings(blocks, 5, 15, 5, 42)).toThrow(RangeError);
    expect(() => generateBuildings(blocks, 5, 5, 15)).toThrow(RangeError);
    expect(() => generateBuildings(blocks, 5, 5, undefined, 42)).toThrow(
      RangeError,
    );
  });

  it('rejects invalid blocks and duplicate identities', () => {
    const block = {
      id: 'block',
      minCorner: { x: 0, y: 0 },
      maxCorner: { x: 50, y: 50 },
    };
    for (const invalid of [
      { ...block, id: '' },
      { ...block, minCorner: { x: NaN, y: 0 } },
      { ...block, minCorner: { x: -1, y: 0 } },
      { ...block, maxCorner: { x: 0, y: 50 } },
    ]) {
      expect(() => generateBuildings([invalid])).toThrow(RangeError);
    }
    expect(() => generateBuildings([block, block])).toThrow(RangeError);
    expect(() => generateBuildings([block], 25)).toThrow(RangeError);
  });

  it('validates parameters even when there are no blocks', () => {
    expect(() => generateBuildings([], -1)).toThrow(RangeError);
  });

  it.each([NaN, Infinity, -Infinity])(
    'rejects non-finite point coordinates %s',
    (value) => {
      expect(() => getElevation(terrain, { x: value, y: 0 }, config)).toThrow(
        RangeError,
      );
      expect(() => getElevation(terrain, { x: 0, y: value }, config)).toThrow(
        RangeError,
      );
    },
  );

  it('validates city dimensions when querying terrain', () => {
    expect(() =>
      getElevation(terrain, { x: 0, y: 0 }, { ...config, widthInMeters: NaN }),
    ).toThrow(RangeError);
  });

  it('keeps rectangular scenario geometry inside the bounds without mutating inputs', () => {
    const options = {
      config: { ...config, widthInMeters: 150, heightInMeters: 120 },
      terrain: { ...terrain },
    };
    const original = structuredClone(options);
    const scenario = generateCityScenario(options);
    for (const collection of [
      scenario.roads,
      scenario.blocks,
      scenario.buildings,
    ]) {
      expect(new Set(collection.map(({ id }) => id)).size).toBe(
        collection.length,
      );
    }
    for (const road of scenario.roads) {
      for (const point of [road.start, road.end]) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(150);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(120);
      }
    }
    scenario.blocks.forEach((block, index) => {
      const building = scenario.buildings[index];
      expect(building).toBeDefined();
      if (!building) throw new Error('Missing building');
      expect(block.minCorner.x).toBeGreaterThanOrEqual(0);
      expect(block.minCorner.y).toBeGreaterThanOrEqual(0);
      expect(block.maxCorner.x).toBeLessThanOrEqual(150);
      expect(block.maxCorner.y).toBeLessThanOrEqual(120);
      expect(building.minCorner.x).toBeGreaterThan(block.minCorner.x);
      expect(building.minCorner.y).toBeGreaterThan(block.minCorner.y);
      expect(building.maxCorner.x).toBeLessThan(block.maxCorner.x);
      expect(building.maxCorner.y).toBeLessThan(block.maxCorner.y);
      expect(building.maxCorner.x).toBeGreaterThan(building.minCorner.x);
      expect(building.maxCorner.y).toBeGreaterThan(building.minCorner.y);
      expect(building.heightInMeters).toBeGreaterThanOrEqual(5);
      expect(building.heightInMeters).toBeLessThanOrEqual(15);
    });
    expect(options).toEqual(original);
  });
});
