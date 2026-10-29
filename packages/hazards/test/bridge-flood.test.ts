import { describe, expect, it } from 'vitest';
import {
  FloodEngine,
  type CityScenarioInput,
  type FloodEnvironment,
} from '../src/index.js';

const config = {
  rainIntensityMmPerHour: 0,
  drainRateMmPerHour: 0,
  flowTransferRatio: 0,
  syntheticRelief: 'none' as const,
  roadFloodedThresholdInMeters: 0.25,
};

function scenario(ground = -2): CityScenarioInput {
  return {
    terrain: { kind: 'flat', elevationInMeters: ground },
    terrainGrid: {
      xCoordinates: [0, 10, 20],
      yCoordinates: [0, 10],
      elevationsInMeters: [
        [ground, ground, ground],
        [ground, ground, ground],
      ],
    },
    roadGraph: {
      nodes: [
        { id: 'west', x: 1, y: 5 },
        { id: 'bank', x: 9, y: 5 },
        { id: 'east', x: 19, y: 5 },
      ],
      edges: [
        {
          id: 'bridge',
          roadId: 'crossing',
          from: 'west',
          to: 'bank',
          lengthInMeters: 8,
          bidirectional: true,
        },
        {
          id: 'ordinary',
          roadId: 'bank-road',
          from: 'bank',
          to: 'east',
          lengthInMeters: 10,
          bidirectional: true,
        },
      ],
    },
    buildings: [],
  };
}

function engine(environment: FloodEnvironment, depth = 0, ground = -2) {
  return new FloodEngine(
    scenario(ground),
    config,
    [{ row: 0, column: 0, depthInMeters: depth }],
    environment,
  );
}

describe('road deck and permanent-water exposure', () => {
  it('keeps a bridge open above permanent water while ordinary roads flood', () => {
    const state = engine({
      roadDeckElevationsInMeters: { bridge: 0 },
      permanentWaterSurfaceElevationsInMeters: { 0: -0.5 },
    }).getSnapshot();
    expect(state.roadEdges[0]).toMatchObject({
      blocked: false,
      maxWaterDepthInMeters: 0,
      meanWaterDepthInMeters: 0,
    });
    expect(state.roadEdges[1]).toMatchObject({
      blocked: true,
      maxWaterDepthInMeters: 1.5,
      meanWaterDepthInMeters: 0.75,
    });
    expect(state.blockedRoadEdgeIds).toEqual(['ordinary']);
    expect(Array.from(state.waterDepthInMeters)).toEqual([0, 0]);
    expect(state.balance.currentVolumeInCubicMeters).toBe(0);
  });

  it.each([
    [-0.25, false, 0],
    [0.125, false, 0.125],
    [0.25, true, 0.25],
  ])(
    'compares permanent surface %s to the deck and inclusive threshold',
    (surface, blocked, depth) => {
      const state = engine({
        roadDeckElevationsInMeters: { bridge: 0 },
        permanentWaterSurfaceElevationsInMeters: { 0: surface },
      }).getSnapshot();
      expect(state.roadEdges[0]).toMatchObject({
        blocked,
        maxWaterDepthInMeters: depth,
        meanWaterDepthInMeters: depth,
      });
    },
  );

  it('allows dynamic pulses to overtop rather than unconditionally exempting bridges', () => {
    const metadata = {
      roadDeckElevationsInMeters: { bridge: 0 },
      permanentWaterSurfaceElevationsInMeters: { 0: -0.5 },
    };
    expect(engine(metadata, 2.125).getSnapshot().roadEdges[0]?.blocked).toBe(
      false,
    );
    expect(engine(metadata, 2.25).getSnapshot().roadEdges[0]).toMatchObject({
      blocked: true,
      maxWaterDepthInMeters: 0.25,
      meanWaterDepthInMeters: 0.25,
    });
    expect(
      engine({ roadDeckElevationsInMeters: { bridge: 0 } }, 2.25).getSnapshot()
        .roadEdges[0]?.blocked,
    ).toBe(true);
  });

  it('uses the highest surface independently in each sampled cell for maximum and mean', () => {
    const state = engine(
      {
        roadDeckElevationsInMeters: { ordinary: 0 },
        permanentWaterSurfaceElevationsInMeters: { 1: 0.5 },
      },
      2.25,
    ).getSnapshot();
    expect(state.roadEdges[1]).toMatchObject({
      maxWaterDepthInMeters: 0.5,
      meanWaterDepthInMeters: 0.375,
      blocked: true,
    });
  });

  it('supports below-sea-level decks and zero permanent surfaces', () => {
    const state = engine({
      roadDeckElevationsInMeters: { bridge: -0.25 },
      permanentWaterSurfaceElevationsInMeters: { 0: 0 },
    }).getSnapshot();
    expect(state.roadEdges[0]).toMatchObject({
      blocked: true,
      maxWaterDepthInMeters: 0.25,
    });
  });

  it('copies metadata and never modifies the scenario or caller environment', () => {
    const source = scenario();
    const metadata = {
      roadDeckElevationsInMeters: { bridge: 0 },
      permanentWaterSurfaceElevationsInMeters: { 0: -0.5 },
    };
    const before = JSON.stringify({ source, metadata });
    const flood = new FloodEngine(source, config, [], metadata);
    flood.step();
    expect(JSON.stringify({ source, metadata })).toBe(before);
    metadata.roadDeckElevationsInMeters.bridge = -2;
    metadata.permanentWaterSurfaceElevationsInMeters[0] = 10;
    expect(flood.getSnapshot().roadEdges[0]?.blocked).toBe(false);
  });

  it('does not add permanent water to solver depths, rain, drainage or building exposure', () => {
    const source = scenario();
    const simulation = {
      ...config,
      timeStepInSeconds: 60,
      rainIntensityMmPerHour: 120,
      drainRateMmPerHour: 10,
      flowTransferRatio: 0.5,
    };
    const environment = { additionalDrainRatesMmPerHour: [5, 20] };
    const legacy = new FloodEngine(
      source,
      simulation,
      [{ row: 0, column: 0, depthInMeters: 0.5 }],
      environment,
    );
    const water = new FloodEngine(
      source,
      simulation,
      [{ row: 0, column: 0, depthInMeters: 0.5 }],
      {
        ...environment,
        roadDeckElevationsInMeters: { bridge: 0 },
        permanentWaterSurfaceElevationsInMeters: { 0: 1 },
      },
    );
    for (let tick = 0; tick < 20; tick++) {
      const a = legacy.step();
      const b = water.step();
      expect(b.waterDepthInMeters).toEqual(a.waterDepthInMeters);
      expect(b.balance).toEqual(a.balance);
      expect(b.buildings).toEqual(a.buildings);
    }
  });

  it('takes the legacy path with absent or empty metadata', () => {
    const a = engine({}, 0.5);
    const b = engine(
      {
        roadDeckElevationsInMeters: {},
        permanentWaterSurfaceElevationsInMeters: {},
      },
      0.5,
    );
    expect(a.getSnapshot().roadEdges[0]).toMatchObject({
      maxWaterDepthInMeters: 0.5,
      meanWaterDepthInMeters: 0.5,
      blocked: true,
    });
    for (let tick = 0; tick < 5; tick++) expect(b.step()).toEqual(a.step());
  });

  it.each([
    { roadDeckElevationsInMeters: { missing: 0 } },
    { roadDeckElevationsInMeters: { bridge: NaN } },
    { roadDeckElevationsInMeters: { bridge: Infinity } },
    { permanentWaterSurfaceElevationsInMeters: { 0: NaN } },
    { permanentWaterSurfaceElevationsInMeters: { 0: -Infinity } },
    { permanentWaterSurfaceElevationsInMeters: { '-1': 0 } },
    { permanentWaterSurfaceElevationsInMeters: { 2: 0 } },
    { permanentWaterSurfaceElevationsInMeters: { '0.5': 0 } },
    { permanentWaterSurfaceElevationsInMeters: { invalid: 0 } },
  ])('rejects invalid exposure metadata %j', (metadata) => {
    expect(() => engine(metadata as FloodEnvironment)).toThrow(RangeError);
  });
});
