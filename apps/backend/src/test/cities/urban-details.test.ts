import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateCityScenario } from '../../modules/cities/city-scenario-generator';
import {
  parseCityScenario,
  regenerateCityScenario,
  serializeCityScenario,
} from '../../modules/cities/city-json';

const input = {
  config: {
    widthInMeters: 500,
    heightInMeters: 500,
    streetSpacingInMeters: 50,
    seed: 42,
  },
  terrain: { kind: 'flat' as const, elevationInMeters: 0 },
  layout: 'district' as const,
  minBuildingHeightInMeters: 4,
  maxBuildingHeightInMeters: 40,
};

describe('opt-in urban details', () => {
  it('ships a fixture matching the versioned urban export', () => {
    const json = readFileSync(
      new URL('../../../../../scenarios/urban-district.json', import.meta.url),
      'utf8',
    );
    expect(parseCityScenario(json)).toEqual(
      generateCityScenario({ ...input, detailLevel: 'urban' }),
    );
  });
  it('records three building styles with bounded roofs, floors and entrances', () => {
    const city = generateCityScenario({ ...input, detailLevel: 'urban' });
    expect(city.generatorVersion).toBe('1.2.0');
    expect(city.config.detailLevel).toBe('urban');
    expect(
      new Set(city.buildings.map((building) => building.architecture?.style)),
    ).toEqual(new Set(['house', 'apartment', 'shop']));
    for (const building of city.buildings) {
      expect(building.architecture!.floors).toBeGreaterThanOrEqual(1);
      expect(building.architecture!.roofRiseInMeters).toBeLessThan(
        building.heightInMeters,
      );
      expect(building.heightInMeters).toBeGreaterThanOrEqual(4);
      expect(building.heightInMeters).toBeLessThanOrEqual(40);
      expect(building.architecture!.roof).toBe(
        building.architecture!.style === 'house' ? 'gable' : 'flat',
      );
    }
  });
  it('stores park paths, furnishings and street details with stable IDs', () => {
    const city = generateCityScenario({ ...input, detailLevel: 'urban' });
    const urban = city.district!.urban!;
    expect(urban.yards).toHaveLength(
      city.buildings.filter(
        (building) => building.architecture?.style === 'house',
      ).length,
    );
    expect(new Set(urban.amenities.map(({ kind }) => kind))).toEqual(
      new Set(['tree', 'bench', 'lamp', 'fountain']),
    );
    expect(new Set(urban.streetDetails.map(({ kind }) => kind))).toEqual(
      new Set(['curb', 'crosswalk', 'lane-marking', 'building-access']),
    );
    expect(urban.parkPaths.length).toBeGreaterThan(
      city.district!.parks.length * 4,
    );
    for (const collection of [
      urban.amenities,
      urban.parkPaths,
      urban.streetDetails,
    ])
      expect(new Set(collection.map(({ id }) => id)).size).toBe(
        collection.length,
      );
    expect(
      urban.streetDetails.filter(({ kind }) => kind === 'building-access'),
    ).toHaveLength(city.buildings.length);
  });
  it('rejects false references, off-road markings and inconsistent architecture', () => {
    const mutations = [
      (s: ReturnType<typeof generateCityScenario>) => {
        s.buildings[0]!.architecture!.floors = 30;
      },
      (s: ReturnType<typeof generateCityScenario>) => {
        s.district!.urban!.amenities[0]!.parkId = 'missing';
      },
      (s: ReturnType<typeof generateCityScenario>) => {
        const mark = s.district!.urban!.streetDetails.find(
          ({ kind }) => kind === 'lane-marking',
        )!;
        mark.minCorner = { x: 1, y: 1 };
        mark.maxCorner = { x: 2, y: 2 };
      },
      (s: ReturnType<typeof generateCityScenario>) => {
        s.district!.urban!.yards[0]!.buildingId = 'missing';
      },
    ];
    for (const mutate of mutations) {
      const city = generateCityScenario({ ...input, detailLevel: 'urban' });
      mutate(city);
      expect(() => parseCityScenario(JSON.stringify(city))).toThrow();
    }
  });
  it('keeps old modes unchanged and reproduces enriched JSON exactly', () => {
    const old = generateCityScenario(input);
    expect(old.generatorVersion).toBe('1.1.0');
    expect(old.district!.urban).toBeUndefined();
    expect(
      old.buildings.every((building) => building.architecture === undefined),
    ).toBe(true);
    const city = generateCityScenario({ ...input, detailLevel: 'urban' });
    expect(
      regenerateCityScenario(parseCityScenario(serializeCityScenario(city))),
    ).toEqual(city);
    expect(generateCityScenario({ ...input, detailLevel: 'urban' })).toEqual(
      city,
    );
    expect(city.roads).toEqual(old.roads);
    expect(
      city.buildings.map(({ minCorner, maxCorner }) => ({
        minCorner,
        maxCorner,
      })),
    ).toEqual(
      old.buildings.map(({ minCorner, maxCorner }) => ({
        minCorner,
        maxCorner,
      })),
    );
  });
  it('rejects invalid detail profiles, references and trees placed on paths without mutation', () => {
    expect(() =>
      generateCityScenario({ ...input, layout: 'grid', detailLevel: 'urban' }),
    ).toThrow();
    const bad = generateCityScenario({ ...input, detailLevel: 'urban' });
    const tree = bad.district!.urban!.amenities.find(
      ({ kind }) => kind === 'tree',
    )!;
    const path = bad.district!.urban!.parkPaths.find(
      (item) => item.parkId === tree.parkId && item.kind === 'path',
    )!;
    tree.position = {
      x: (path.minCorner.x + path.maxCorner.x) / 2,
      y: (path.minCorner.y + path.maxCorner.y) / 2,
    };
    const before = JSON.stringify(bad);
    expect(() => parseCityScenario(before)).toThrow();
    expect(JSON.stringify(bad)).toBe(before);
  });
});
