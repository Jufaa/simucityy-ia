import { describe, expect, it } from 'vitest';
import { generateCityScenario } from '../../modules/cities/city-scenario-generator';
import { cityScenarioSchema } from '../../modules/cities/city.schema';

describe('generateCityScenario', () => {
  it('combina calles, manzanas y edificios', () => {
    const scenario = generateCityScenario({
      config: {
        widthInMeters: 100,
        heightInMeters: 100,
        streetSpacingInMeters: 50,
        seed: 42,
      },
      terrain: {
        kind: 'flat',
        elevationInMeters: 0,
      },
    });

    expect(scenario.roads).toHaveLength(6);
    expect(scenario.blocks).toHaveLength(4);
    expect(scenario.buildings).toHaveLength(4);
  });
});

it('genera edificios reproducibles dentro del rango esperado', () => {
  const options = {
    config: {
      widthInMeters: 100,
      heightInMeters: 100,
      streetSpacingInMeters: 50,
      seed: 42,
    },
    terrain: {
      kind: 'flat' as const,
      elevationInMeters: 0,
    },
  };

  const first = generateCityScenario(options);
  const second = generateCityScenario(options);

  expect(first).toEqual(second);
  expect(first.buildings[0]?.heightInMeters).toBeGreaterThanOrEqual(5);
  expect(first.buildings[0]?.heightInMeters).toBeLessThanOrEqual(15);
});

it('stores the effective generation settings and metadata', () => {
  const scenario = generateCityScenario({
    config: {
      widthInMeters: 100,
      heightInMeters: 100,
      streetSpacingInMeters: 50,
    },
    terrain: {
      kind: 'flat',
      elevationInMeters: 0,
    },
  });

  expect(scenario).toMatchObject({
    schemaVersion: 1,
    generatorVersion: '1.0.0',
    source: 'procedural',
    config: {
      widthInMeters: 100,
      heightInMeters: 100,
      streetSpacingInMeters: 50,
      seed: 1,
      buildingMarginInMeters: 5,
      minBuildingHeightInMeters: 5,
      maxBuildingHeightInMeters: 15,
    },
  });
});

it('recreates the scenario from its saved settings', () => {
  const original = generateCityScenario({
    config: {
      widthInMeters: 150,
      heightInMeters: 100,
      streetSpacingInMeters: 50,
      seed: 123,
    },
    terrain: {
      kind: 'flat',
      elevationInMeters: 12,
    },
    buildingMarginInMeters: 3,
    minBuildingHeightInMeters: 8,
    maxBuildingHeightInMeters: 20,
  });

  expect(original.config).toMatchObject({
    seed: 123,
    buildingMarginInMeters: 3,
    minBuildingHeightInMeters: 8,
    maxBuildingHeightInMeters: 20,
  });

  const restored = generateCityScenario({
    config: original.config,
    terrain: original.terrain,
    buildingMarginInMeters: original.config.buildingMarginInMeters,
    minBuildingHeightInMeters: original.config.minBuildingHeightInMeters,
    maxBuildingHeightInMeters: original.config.maxBuildingHeightInMeters,
  });

  expect(restored).toEqual(original);
});

it('validates a generated scenario', () => {
  const scenario = generateCityScenario({
    config: {
      widthInMeters: 100,
      heightInMeters: 100,
      streetSpacingInMeters: 50,
      seed: 42,
    },
    terrain: {
      kind: 'flat',
      elevationInMeters: 0,
    },
  });

  const result = cityScenarioSchema.safeParse(scenario);

  expect(result.success).toBe(true);
});

it('rejects a maximum building height below the minimum', () => {
  const scenario = generateCityScenario({
    config: {
      widthInMeters: 100,
      heightInMeters: 100,
      streetSpacingInMeters: 50,
      seed: 42,
    },
    terrain: {
      kind: 'flat',
      elevationInMeters: 0,
    },
  });

  const invalidScenario = {
    ...scenario,
    config: {
      ...scenario.config,
      minBuildingHeightInMeters: 20,
      maxBuildingHeightInMeters: 10,
    },
  };

  const result = cityScenarioSchema.safeParse(invalidScenario);

  expect(result.success).toBe(false);
});

it.each(['blocks', 'buildings'] as const)(
  'rejects zero-width geometry in %s',
  (collection) => {
    const scenario = generateCityScenario({
      config: {
        widthInMeters: 100,
        heightInMeters: 100,
        streetSpacingInMeters: 50,
        seed: 42,
      },
      terrain: {
        kind: 'flat',
        elevationInMeters: 0,
      },
    });

    const invalidScenario = {
      ...scenario,
      [collection]: scenario[collection].map((item) => ({
        ...item,
        maxCorner: {
          ...item.maxCorner,
          x: item.minCorner.x,
        },
      })),
    };

    expect(cityScenarioSchema.safeParse(invalidScenario).success).toBe(false);
  },
);
