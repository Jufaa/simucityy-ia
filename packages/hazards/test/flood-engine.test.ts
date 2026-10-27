import { describe, expect, it } from 'vitest';
import {
  createSyntheticTerrain,
  FloodEngine,
  type FloodTerrainInput,
} from '../src/index.js';

describe('FloodEngine (@simulicity/hazards)', () => {
  it('1) garantiza agua no negativa incluso con drenaje extremo y pendientes fuertes', () => {
    const terrain = createSyntheticTerrain(8, 8);
    const engine = new FloodEngine(terrain, {
      rainRatePerTick: 0.01,
      drainRatePerTick: 10.0, // Drenaje mucho mayor que la lluvia
      flowTransferRatio: 1.0,
    });

    for (let t = 0; t < 20; t++) {
      const snapshot = engine.step();
      for (const depth of snapshot.waterDepth) {
        expect(depth).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('2) conserva la masa: no hay creación ni pérdida espontánea de agua', () => {
    const terrain = createSyntheticTerrain(10, 10);
    const initialWater = new Float64Array(100);
    initialWater[0] = 5.0;
    initialWater[55] = 3.5;

    const engine = new FloodEngine(
      terrain,
      {
        rainRatePerTick: 0,
        drainRatePerTick: 0,
        flowTransferRatio: 0.6,
      },
      initialWater,
    );

    let lastSnapshot = engine.getSnapshot();
    for (let t = 0; t < 50; t++) {
      lastSnapshot = engine.step();
    }

    expect(lastSnapshot.metrics.balance.currentTotalWater).toBeCloseTo(8.5, 9);
    expect(lastSnapshot.metrics.balance.massBalanceError).toBeLessThan(1e-9);
  });

  it('3) es completamente determinista ante las mismas entradas', () => {
    const terrainA = createSyntheticTerrain(12, 12);
    const terrainB = createSyntheticTerrain(12, 12);

    const config = {
      rainRatePerTick: 0.03,
      drainRatePerTick: 0.005,
      flowTransferRatio: 0.45,
    };

    const engineA = new FloodEngine(terrainA, config);
    const engineB = new FloodEngine(terrainB, config);

    for (let t = 0; t < 25; t++) {
      engineA.step();
      engineB.step();
    }

    const snapA = engineA.getSnapshot();
    const snapB = engineB.getSnapshot();

    expect(Array.from(snapA.waterDepth)).toEqual(Array.from(snapB.waterDepth));
    expect(snapA.floodedRoadIds).toEqual(snapB.floodedRoadIds);
    expect(snapA.exposedBuildingIds).toEqual(snapB.exposedBuildingIds);
  });

  it('4) detecta la transición de vía transitable a inundada al cruzar el umbral', () => {
    const terrain: FloodTerrainInput = {
      width: 2,
      height: 1,
      elevation: [0, 0],
      cellKinds: ['road', 'building'],
      entityIds: ['road-main', 'bldg-hq'],
    };

    const engine = new FloodEngine(terrain, {
      rainRatePerTick: 0.1,
      drainRatePerTick: 0,
      flowTransferRatio: 0.5,
      roadFloodedThreshold: 0.25,
      buildingExposedThreshold: 0.35,
    });

    // Tick 1: 0.10m de agua -> todavía transitable (< 0.25)
    const snap1 = engine.step();
    expect(snap1.floodedRoadMask[0]).toBe(0);
    expect(snap1.floodedRoadIds).toEqual([]);

    // Tick 2: 0.20m de agua -> todavía transitable (< 0.25)
    const snap2 = engine.step();
    expect(snap2.floodedRoadMask[0]).toBe(0);

    // Tick 3: 0.30m de agua -> vía inundada (>= 0.25), edificio aún no expuesto (< 0.35)
    const snap3 = engine.step();
    expect(snap3.floodedRoadMask[0]).toBe(1);
    expect(snap3.floodedRoadIds).toEqual(['road-main']);
    expect(snap3.exposedBuildingMask[1]).toBe(0);

    // Tick 4: 0.40m de agua -> edificio ahora también expuesto (>= 0.35)
    const snap4 = engine.step();
    expect(snap4.exposedBuildingMask[1]).toBe(1);
    expect(snap4.exposedBuildingIds).toEqual(['bldg-hq']);
  });
});
