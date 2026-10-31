import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createDemoCompatibleScenario,
  FloodEngine,
  type CityScenarioInput,
} from '../src/index.js';

describe('FloodEngine (@simulicity/hazards) - Contrato Integrante A & B', () => {
  it('construye 20x20 celdas a partir de 21x21 muestras y no muta el CityScenario original', () => {
    const scenario = createDemoCompatibleScenario(500, 500, 25);
    expect(scenario.terrainGrid.xCoordinates).toHaveLength(21);
    expect(scenario.terrainGrid.yCoordinates).toHaveLength(21);

    const scenarioSnapshotBefore = JSON.stringify(scenario);
    const engine = new FloodEngine(scenario);
    const state = engine.step();

    expect(state.rows).toBe(20);
    expect(state.columns).toBe(20);
    expect(state.waterDepthInMeters).toHaveLength(400);
    expect(JSON.stringify(scenario)).toBe(scenarioSnapshotBefore);
  });

  it('1) garantiza agua no negativa incluso con drenaje extremo', () => {
    const scenario = createDemoCompatibleScenario(200, 200, 50);
    const engine = new FloodEngine(scenario, {
      rainIntensityMmPerHour: 10,
      drainRateMmPerHour: 5000,
      flowTransferRatio: 1.0,
    });

    for (let t = 0; t < 20; t++) {
      const snap = engine.step();
      for (const depth of snap.waterDepthInMeters) {
        expect(depth).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('2) conserva el volumen de agua (no hay creación espontánea) incluso con celdas de distinto tamaño', () => {
    // Última celda más corta (como advierte el punto 5 del documento de A)
    const scenario: CityScenarioInput = {
      terrain: { kind: 'flat', elevationInMeters: 0 },
      terrainGrid: {
        xCoordinates: [0, 25, 50, 60], // columnas de 25m, 25m y 10m
        yCoordinates: [0, 25, 40], // filas de 25m y 15m
        elevationsInMeters: [
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ],
      },
      roadGraph: { nodes: [], edges: [] },
      buildings: [],
    };

    const engine = new FloodEngine(
      scenario,
      {
        rainIntensityMmPerHour: 0,
        drainRateMmPerHour: 0,
        flowTransferRatio: 0.6,
        syntheticRelief: 'central-basin',
      },
      [{ row: 0, column: 0, depthInMeters: 1.2 }], // 1.2m * (25m * 25m) = 750 m³
    );

    let snap = engine.getSnapshot();
    expect(snap.balance.initialVolumeInCubicMeters).toBeCloseTo(750, 6);

    for (let t = 0; t < 40; t++) {
      snap = engine.step();
    }

    expect(snap.balance.currentVolumeInCubicMeters).toBeCloseTo(750, 6);
    expect(snap.balance.volumeBalanceErrorInCubicMeters).toBeLessThan(1e-6);
  });

  it('3) es completamente determinista ante el mismo escenario y configuración', () => {
    const scenario = createDemoCompatibleScenario(250, 250, 25);
    const config = {
      timeStepInSeconds: 60,
      rainIntensityMmPerHour: 150,
      drainRateMmPerHour: 10,
      flowTransferRatio: 0.45,
    };

    const engineA = new FloodEngine(scenario, config);
    const engineB = new FloodEngine(scenario, config);

    for (let t = 0; t < 20; t++) {
      engineA.step();
      engineB.step();
    }

    const snapA = engineA.getSnapshot();
    const snapB = engineB.getSnapshot();

    expect(Array.from(snapA.waterDepthInMeters)).toEqual(
      Array.from(snapB.waterDepthInMeters),
    );
    expect(snapA.blockedRoadEdgeIds).toEqual(snapB.blockedRoadEdgeIds);
    expect(snapA.exposedBuildingIds).toEqual(snapB.exposedBuildingIds);
  });

  it('4) transiciona tramos viales (edge.id) a bloqueados y edificios (building.id) a expuestos al cruzar el umbral', () => {
    const scenario = createDemoCompatibleScenario(100, 100, 25);
    const engine = new FloodEngine(scenario, {
      timeStepInSeconds: 3600, // 1 hora por tick para cuentas redondas
      rainIntensityMmPerHour: 100, // +0.10 m por tick
      drainRateMmPerHour: 0,
      flowTransferRatio: 0, // sin flujo lateral para medir acumulación pura
      syntheticRelief: 'none',
      roadFloodedThresholdInMeters: 0.15,
      buildingExposedThresholdInMeters: 0.25,
    });

    // Tick 1: 0.10 m -> ni calles ni edificios superan umbral
    const snap1 = engine.step();
    expect(snap1.blockedRoadEdgeIds).toEqual([]);
    expect(snap1.exposedBuildingIds).toEqual([]);

    // Tick 2: 0.20 m -> tramos viales bloqueados (>= 0.15m), edificios aún a salvo (< 0.25m)
    const snap2 = engine.step();
    expect(snap2.blockedRoadEdgeIds).toEqual([
      'edge-west-center',
      'edge-center-east',
    ]);
    expect(snap2.exposedBuildingIds).toEqual([]);

    // Tick 3: 0.30 m -> edificios ahora también expuestos (>= 0.25m)
    const snap3 = engine.step();
    expect(snap3.exposedBuildingIds).toEqual([
      'bldg-center-low',
      'bldg-corner-high',
    ]);
  });

  it('5) funciona directamente con scenarios/demo-city.json si está presente en el repositorio', () => {
    const demoUrl = new URL(
      '../../../scenarios/demo-city.json',
      import.meta.url,
    );
    const resolvedPath = fileURLToPath(demoUrl);

    if (!fs.existsSync(resolvedPath)) {
      return; // Si aún no está scenarios/demo-city.json, se ignora
    }

    const rawJson = fs.readFileSync(resolvedPath, 'utf-8');
    const demoScenario = JSON.parse(rawJson) as CityScenarioInput;

    const engine = new FloodEngine(demoScenario);
    const snap = engine.step();

    expect(snap.rows).toBe(demoScenario.terrainGrid.yCoordinates.length - 1);
    expect(snap.columns).toBe(demoScenario.terrainGrid.xCoordinates.length - 1);
    expect(snap.roadEdges.length).toBe(demoScenario.roadGraph.edges.length);
    expect(snap.buildings.length).toBe(demoScenario.buildings.length);
  });
});

describe('FloodEngine physics upgrades', () => {
  it('sustained inflow keeps feeding source cells and conserves volume', () => {
    const scenario = createDemoCompatibleScenario(200, 200, 50);
    const engine = new FloodEngine(
      scenario,
      {
        rainIntensityMmPerHour: 0,
        drainRateMmPerHour: 0,
        flowTransferRatio: 0.5,
      },
      [],
      {
        sustainedInflow: {
          cellIndices: [0],
          rateInMetersPerSecond: 0.001,
          durationInSeconds: 120,
        },
      },
    );
    let snap = engine.step();
    expect(snap.balance.totalInflowVolumeInCubicMeters).toBeGreaterThan(0);
    expect(snap.balance.volumeBalanceErrorInCubicMeters).toBeLessThan(1e-6);
    engine.step();
    snap = engine.step();
    // Duration exhausted after two 60 s steps: no more inflow is added.
    const afterWindow = snap.balance.totalInflowVolumeInCubicMeters ?? 0;
    snap = engine.step();
    expect(snap.balance.totalInflowVolumeInCubicMeters).toBeCloseTo(
      afterWindow,
    );
  });

  it('estimates flow speed from depth and surface slope, zero in still water', () => {
    const scenario = createDemoCompatibleScenario(200, 200, 50);
    const still = new FloodEngine(
      scenario,
      {
        rainIntensityMmPerHour: 0,
        drainRateMmPerHour: 0,
        flowTransferRatio: 0,
        syntheticRelief: 'none',
      },
      [{ row: 1, column: 1, depthInMeters: 1 }],
    );
    // A lone pulse on a flat grid spreads a surface slope toward neighbours.
    const snap = still.step();
    const speeds = snap.flowSpeedInMetersPerSecond!;
    expect(speeds.length).toBe(snap.waterDepthInMeters.length);
    expect(Math.max(...speeds)).toBeGreaterThan(0);
    const allCells = Array.from({ length: 16 }, (_, i) => ({
      row: Math.floor(i / 4),
      column: i % 4,
      depthInMeters: 1,
    }));
    const ponded = new FloodEngine(
      scenario,
      {
        rainIntensityMmPerHour: 0,
        drainRateMmPerHour: 0,
        flowTransferRatio: 0,
        syntheticRelief: 'none',
      },
      allCells,
    ).getSnapshot();
    // Uniform depth on flat ground has no slope, hence no flow.
    expect(Math.max(...ponded.flowSpeedInMetersPerSecond!)).toBe(0);
    const building = snap.buildings[0]!;
    expect(building.maxFlowSpeedInMetersPerSecond).toBeDefined();
  });

  it('rejects invalid sustained inflow', () => {
    const scenario = createDemoCompatibleScenario(200, 200, 50);
    expect(
      () =>
        new FloodEngine(scenario, {}, [], {
          sustainedInflow: { cellIndices: [9999], rateInMetersPerSecond: 1 },
        }),
    ).toThrow(RangeError);
  });
});
