import { describe, expect, it } from 'vitest';
import { FloodEngine } from '../src/flood-engine';
import { createFloodEnvironment } from '../src/flood-environment';
import type { CityScenarioInput } from '../src/types';

const config = {
  timeStepInSeconds: 3600,
  rainIntensityMmPerHour: 100,
  drainRateMmPerHour: 0,
  flowTransferRatio: 0,
  syntheticRelief: 'none' as const,
};
function scenario(): CityScenarioInput {
  return {
    terrain: { kind: 'flat', elevationInMeters: 0 },
    terrainGrid: {
      xCoordinates: [0, 10, 20, 30],
      yCoordinates: [0, 10],
      elevationsInMeters: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
    },
    roadGraph: { nodes: [], edges: [] },
    buildings: [
      {
        id: 'house',
        minCorner: { x: 11, y: 1 },
        maxCorner: { x: 19, y: 9 },
        heightInMeters: 5,
      },
    ],
  };
}

describe('optional flood environment', () => {
  it('keeps omitted and empty environments exactly equivalent without changing inputs', () => {
    const city = scenario();
    const before = JSON.stringify(city);
    const plain = new FloodEngine(city, config);
    const empty = new FloodEngine(city, config, [], {});
    for (let i = 0; i < 4; i++) expect(empty.step()).toEqual(plain.step());
    expect(JSON.stringify(city)).toBe(before);
  });

  it('blocks centers inside buildings but preserves intersecting open road cells', () => {
    const city = scenario();
    const environment = createFloodEnvironment(city, { obstacles: true });
    expect(environment.blockedCellIndices).toEqual([1]);
    const wet = new FloodEngine(city, config, [], environment).step();
    expect(Array.from(wet.waterDepthInMeters)).toEqual([
      expect.closeTo(0.1),
      0,
      expect.closeTo(0.1),
    ]);
    expect(wet.balance.totalRainVolumeInCubicMeters).toBeCloseTo(20);
    expect(wet.balance.volumeBalanceErrorInCubicMeters).toBeLessThan(1e-10);
    const overlap = {
      ...city,
      buildings: [{ ...city.buildings[0]!, minCorner: { x: 9, y: 1 } }],
    };
    expect(
      createFloodEnvironment(overlap, { obstacles: true }).blockedCellIndices,
    ).toEqual([1]);
  });

  it('prevents transfer through barriers and rejects positive initial water inside them', () => {
    const city = scenario();
    const environment = { blockedCellIndices: [1] };
    const engine = new FloodEngine(
      city,
      { ...config, rainIntensityMmPerHour: 0, flowTransferRatio: 1 },
      [{ row: 0, column: 0, depthInMeters: 1 }],
      environment,
    );
    for (let i = 0; i < 10; i++)
      expect(Array.from(engine.step().waterDepthInMeters)).toEqual([1, 0, 0]);
    expect(
      () =>
        new FloodEngine(
          city,
          config,
          [{ row: 0, column: 1, depthInMeters: 1 }],
          environment,
        ),
    ).toThrow(/blocked/i);
  });

  it('detects building exposure in neighboring open cells, not dry interior cells', () => {
    const engine = new FloodEngine(
      scenario(),
      { ...config, buildingExposedThresholdInMeters: 0.05 },
      [],
      { blockedCellIndices: [1] },
    );
    const snapshot = engine.step();
    expect(snapshot.exposedBuildingIds).toEqual(['house']);
    expect(snapshot.buildings[0]?.meanWaterDepthInMeters).toBeCloseTo(0.1);
  });

  it('weights park infiltration by covered area and caps overlapping coverage', () => {
    const park = { minCorner: { x: 0, y: 0 }, maxCorner: { x: 5, y: 10 } };
    const environment = createFloodEnvironment(scenario(), {
      permeableAreas: [park],
      infiltrationRateMmPerHour: 40,
    });
    expect(environment.additionalDrainRatesMmPerHour).toEqual([20, 0, 0]);
    const repeated = createFloodEnvironment(scenario(), {
      permeableAreas: [park, park, park],
      infiltrationRateMmPerHour: 40,
    });
    expect(repeated.additionalDrainRatesMmPerHour?.[0]).toBeLessThanOrEqual(40);
    expect(
      new FloodEngine(scenario(), config, [], environment).step()
        .waterDepthInMeters[0],
    ).toBeCloseTo(0.08);
  });

  it('converts local drain capacity to cell rates and only removes available water', () => {
    const environment = createFloodEnvironment(scenario(), {
      drains: [
        {
          id: 'drain',
          position: { x: 25, y: 5 },
          capacityInCubicMetersPerSecond: 1,
        },
      ],
    });
    expect(environment.additionalDrainRatesMmPerHour).toEqual([0, 0, 36000]);
    const snapshot = new FloodEngine(
      scenario(),
      config,
      [],
      environment,
    ).step();
    expect(Array.from(snapshot.waterDepthInMeters)).toEqual([
      expect.closeTo(0.1),
      expect.closeTo(0.1),
      0,
    ]);
    expect(snapshot.balance.totalDrainedVolumeInCubicMeters).toBeCloseTo(10);
    expect(snapshot.balance.volumeBalanceErrorInCubicMeters).toBeLessThan(
      1e-10,
    );
    const blockedDrain = createFloodEnvironment(scenario(), {
      obstacles: true,
      drains: [
        {
          id: 'inside',
          position: { x: 15, y: 5 },
          capacityInCubicMetersPerSecond: 1,
        },
      ],
    });
    expect(blockedDrain.additionalDrainRatesMmPerHour?.[1]).toBe(0);
  });

  it('flows around blocked cells while conserving volume on unequal cells', () => {
    const city: CityScenarioInput = {
      ...scenario(),
      terrainGrid: {
        xCoordinates: [0, 10, 20, 25],
        yCoordinates: [0, 10, 20, 25],
        elevationsInMeters: Array.from({ length: 4 }, () => [0, 0, 0, 0]),
      },
      buildings: [],
    };
    const engine = new FloodEngine(
      city,
      { ...config, rainIntensityMmPerHour: 0, flowTransferRatio: 0.5 },
      [{ row: 1, column: 0, depthInMeters: 1 }],
      { blockedCellIndices: [4] },
    );
    let snapshot = engine.getSnapshot();
    for (let i = 0; i < 30; i++) snapshot = engine.step();
    expect(snapshot.waterDepthInMeters[4]).toBe(0);
    expect(snapshot.waterDepthInMeters[5]).toBeGreaterThan(0);
    expect(snapshot.balance.currentVolumeInCubicMeters).toBeCloseTo(100, 9);
    expect(snapshot.balance.volumeBalanceErrorInCubicMeters).toBeLessThan(1e-9);
  });

  it('does not retain mutable environment inputs', () => {
    const city = scenario();
    const environment = {
      blockedCellIndices: [1],
      additionalDrainRatesMmPerHour: [0, 0, 50],
    };
    const before = JSON.stringify({ city, environment });
    const engine = new FloodEngine(city, config, [], environment);
    expect(JSON.stringify({ city, environment })).toBe(before);
    environment.blockedCellIndices.length = 0;
    environment.additionalDrainRatesMmPerHour.fill(1000);
    expect(Array.from(engine.step().waterDepthInMeters)).toEqual([
      expect.closeTo(0.1),
      0,
      expect.closeTo(0.05),
    ]);
  });

  it('rejects invalid environment indices and nonfinite or incomplete rate arrays', () => {
    for (const blockedCellIndices of [[-1], [3], [0.5], [NaN]]) {
      expect(
        () => new FloodEngine(scenario(), config, [], { blockedCellIndices }),
      ).toThrow();
    }
    for (const additionalDrainRatesMmPerHour of [
      [0],
      [0, -1, 0],
      [0, Infinity, 0],
      [0, NaN, 0],
    ]) {
      expect(
        () =>
          new FloodEngine(scenario(), config, [], {
            additionalDrainRatesMmPerHour,
          }),
      ).toThrow();
    }
  });

  it('rejects invalid builder coordinates, rates, bounds and capacities', () => {
    for (const rate of [-1, NaN, Infinity])
      expect(() =>
        createFloodEnvironment(scenario(), { infiltrationRateMmPerHour: rate }),
      ).toThrow();
    for (const x of [NaN, Infinity, -1, 31])
      expect(() =>
        createFloodEnvironment(scenario(), {
          drains: [
            {
              id: 'bad',
              position: { x, y: 5 },
              capacityInCubicMetersPerSecond: 1,
            },
          ],
        }),
      ).toThrow();
    expect(() =>
      createFloodEnvironment(scenario(), {
        permeableAreas: [
          { minCorner: { x: 10, y: 0 }, maxCorner: { x: 0, y: 10 } },
        ],
      }),
    ).toThrow();
    expect(() =>
      createFloodEnvironment(scenario(), {
        drains: [
          {
            id: 'bad',
            position: { x: 5, y: 5 },
            capacityInCubicMetersPerSecond: Infinity,
          },
        ],
      }),
    ).toThrow();
  });
});
