import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateCityScenario } from '../../modules/cities/city-scenario-generator';
import { cityScenarioSchema } from '../../modules/cities/city.schema';
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
};

describe('small synthetic district', () => {
  it('ships a validated fixture matching the documented district export', () => {
    const json = readFileSync(
      new URL('../../../../../scenarios/small-district.json', import.meta.url),
      'utf8',
    );
    expect(parseCityScenario(json)).toEqual(
      generateCityScenario({
        ...input,
        layout: 'district',
        minBuildingHeightInMeters: 4,
        maxBuildingHeightInMeters: 40,
      }),
    );
  });
  it('rejects district-specific infeasible settings and park-sidewalk intersections without mutation', () => {
    const margin = generateCityScenario({ ...input, layout: 'district' });
    margin.config.buildingMarginInMeters = 21;
    const overlap = generateCityScenario({ ...input, layout: 'district' });
    const park = overlap.district!.parks[0]!;
    const block = overlap.blocks.find(({ id }) => id === park.blockId)!;
    park.minCorner.x = block.minCorner.x + 3;
    overlap.district!.parcels.find(
      (parcel) => parcel.kind === 'park' && parcel.blockId === block.id,
    )!.minCorner.x = park.minCorner.x;
    for (const invalid of [margin, overlap]) {
      const before = JSON.stringify(invalid);
      expect(() => parseCityScenario(before)).toThrow();
      expect(JSON.stringify(invalid)).toBe(before);
    }
  });
  it('subdivides developed blocks into parcels and reserves parks with no buildings', () => {
    const city = generateCityScenario({ ...input, layout: 'district' });
    expect(city.config.layout).toBe('district');
    expect(city.generatorVersion).toBe('1.1.0');
    expect(city.district).toBeDefined();
    const district = city.district!;
    expect(district.parks.length).toBeGreaterThan(0);
    expect(city.buildings.length).toBeGreaterThan(city.blocks.length);
    expect(
      district.parcels.filter((parcel) => parcel.kind !== 'park'),
    ).toHaveLength(city.buildings.length);
    for (const building of city.buildings) {
      const parcel = district.parcels.find(
        ({ id }) => id === building.parcelId,
      )!;
      expect(parcel).toBeDefined();
      expect(parcel.kind).not.toBe('park');
      expect(building.minCorner.x).toBeGreaterThan(parcel.minCorner.x);
      expect(building.maxCorner.x).toBeLessThan(parcel.maxCorner.x);
    }
    expect(
      new Set(
        city.buildings.map(
          (building) => building.maxCorner.x - building.minCorner.x,
        ),
      ).size,
    ).toBeGreaterThan(1);
    expect(
      new Set(city.buildings.map(({ heightInMeters }) => heightInMeters)).size,
    ).toBeGreaterThan(1);
    expect(new Set(city.buildings.map(({ use }) => use))).toEqual(
      new Set(['residential', 'commercial']),
    );
    expect(district.sidewalks).toHaveLength(city.blocks.length * 4);
    for (const citizen of city.citizens)
      expect(
        city.buildings.find(({ id }) => id === citizen.homeBuildingId)?.use,
      ).toBe('residential');
  });
  it('keeps the previous grid mode unchanged and reproduces both versions', () => {
    const old = generateCityScenario(input);
    expect(old.buildings).toHaveLength(100);
    expect(old.district).toBeUndefined();
    expect(old.generatorVersion).toBe('1.0.0');
    expect(regenerateCityScenario(old)).toEqual(old);
    const district = generateCityScenario({ ...input, layout: 'district' });
    expect(
      regenerateCityScenario(
        parseCityScenario(serializeCityScenario(district)),
      ),
    ).toEqual(district);
    expect(generateCityScenario({ ...input, layout: 'district' })).toEqual(
      district,
    );
  });
  it('rejects detached parcel references and buildings moved into park parcels', () => {
    const city = generateCityScenario({ ...input, layout: 'district' });
    city.buildings[0]!.parcelId = 'missing';
    expect(cityScenarioSchema.safeParse(city).success).toBe(false);
    const park = generateCityScenario({ ...input, layout: 'district' });
    park.buildings[0]!.parcelId = park.district!.parcels.find(
      ({ kind }) => kind === 'park',
    )!.id;
    expect(cityScenarioSchema.safeParse(park).success).toBe(false);
  });
  it('rejects mismatched district metadata and impossible layout sizes', () => {
    const city = generateCityScenario({ ...input, layout: 'district' });
    city.district!.roadWidthInMeters = 1000;
    expect(cityScenarioSchema.safeParse(city).success).toBe(false);
    expect(() =>
      generateCityScenario({
        config: { ...input.config, streetSpacingInMeters: 10 },
        terrain: input.terrain,
        layout: 'district',
      }),
    ).toThrow();
  });
});
