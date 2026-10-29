import { describe, expect, it } from 'vitest';
import {
  assessStructuralDamage,
  createDemoCompatibleScenario,
  createHazardPulses,
  FloodEngine,
  HAZARD_KINDS,
  hazardPreset,
  isHazardKind,
  type CityScenarioInput,
} from '../src/index.js';

describe('hazard scenarios', () => {
  it('expone las cinco catástrofes pedidas con presets coherentes', () => {
    expect(HAZARD_KINDS).toEqual([
      'rain',
      'river-overflow',
      'tsunami',
      'earthquake',
      'strong-wind',
    ]);
    expect(hazardPreset('rain').rainIntensityMmPerHour).toBe(120);
    expect(hazardPreset('tsunami').waveHeightInMeters).toBeGreaterThan(0);
    expect(hazardPreset('earthquake').magnitude).toBeGreaterThan(0);
    expect(hazardPreset('strong-wind').windSpeedKmh).toBeGreaterThan(0);
    expect(isHazardKind('tsunami')).toBe(true);
    expect(isHazardKind('meteorito')).toBe(false);
  });

  it('lluvia, terremoto y viento no inyectan agua inicial', () => {
    const scenario = createDemoCompatibleScenario(100, 100, 25);
    for (const kind of ['rain', 'earthquake', 'strong-wind'] as const)
      expect(createHazardPulses(scenario, kind)).toEqual([]);
  });

  it('el tsunami entra por el oeste perdiendo altura y respeta celdas bloqueadas', () => {
    const scenario = createDemoCompatibleScenario(200, 200, 25);
    const columns = scenario.terrainGrid.xCoordinates.length - 1;
    const blocked = [0, columns]; // primeras celdas de dos filas
    const pulses = createHazardPulses(scenario, 'tsunami', blocked);
    expect(pulses.length).toBeGreaterThan(0);
    expect(pulses.every((pulse) => pulse.column < 4)).toBe(true);
    const byColumn = new Map<number, number>();
    for (const pulse of pulses) byColumn.set(pulse.column, pulse.depthInMeters);
    expect(byColumn.get(0)!).toBeGreaterThan(byColumn.get(3)!);
    expect(
      pulses.some((pulse) =>
        blocked.includes(pulse.row * columns + pulse.column),
      ),
    ).toBe(false);
    // Los pulsos son aceptados por el motor real.
    const engine = new FloodEngine(
      scenario,
      {
        rainIntensityMmPerHour: 0,
        drainRateMmPerHour: 0,
        syntheticRelief: 'none',
      },
      pulses,
    );
    expect(engine.getSnapshot().maxWaterDepthInMeters).toBeGreaterThan(1);
  });

  it('el desborde parte de las celdas bajas del cauce con relieve', () => {
    const base = createDemoCompatibleScenario(200, 200, 25);
    const scenario: CityScenarioInput = {
      ...base,
      terrainGrid: {
        ...base.terrainGrid,
        elevationsInMeters: base.terrainGrid.yCoordinates.map((y) =>
          base.terrainGrid.xCoordinates.map((x) =>
            Math.abs(x - 100) < 15 && y >= 0 ? -3 : 2,
          ),
        ),
      },
    };
    const pulses = createHazardPulses(scenario, 'river-overflow');
    expect(pulses.length).toBeGreaterThan(0);
    const xs = scenario.terrainGrid.xCoordinates;
    for (const pulse of pulses) {
      const centerX = (xs[pulse.column]! + xs[pulse.column + 1]!) / 2;
      expect(Math.abs(centerX - 100)).toBeLessThan(30);
      expect(pulse.depthInMeters).toBeGreaterThan(0);
    }
  });

  it('el daño estructural es determinista, no muta y el refuerzo lo reduce', () => {
    const scenario = createDemoCompatibleScenario(500, 500, 25);
    const before = JSON.stringify(scenario);
    const a = assessStructuralDamage(scenario, 'earthquake');
    const b = assessStructuralDamage(scenario, 'earthquake');
    expect(a).toEqual(b);
    expect(JSON.stringify(scenario)).toBe(before);
    const reinforced = assessStructuralDamage(scenario, 'earthquake', {
      reinforced: true,
    });
    expect(reinforced.maxSeverity).toBeLessThanOrEqual(a.maxSeverity);
    expect(reinforced.damagedBuildingIds.length).toBeLessThanOrEqual(
      a.damagedBuildingIds.length,
    );
    // Sin daño estructural en catástrofes de agua.
    expect(assessStructuralDamage(scenario, 'rain').damagedBuildingIds).toEqual(
      [],
    );
    // Los tramos bloqueados por escombros existen solo si hay daño.
    if (a.damagedBuildingIds.length === 0)
      expect(a.blockedRoadEdgeIds).toEqual([]);
    for (const id of a.blockedRoadEdgeIds)
      expect(scenario.roadGraph.edges.some((edge) => edge.id === id)).toBe(
        true,
      );
  });

  it('el viento daña con severidad acotada y reproducible por edificio', () => {
    const scenario = createDemoCompatibleScenario(500, 500, 25);
    const wind = assessStructuralDamage(scenario, 'strong-wind', {
      seed: 7,
    });
    expect(wind.buildings).toHaveLength(scenario.buildings.length);
    for (const item of wind.buildings) {
      expect(item.severity).toBeGreaterThanOrEqual(0);
      expect(item.severity).toBeLessThanOrEqual(1);
      expect(item.damaged).toBe(item.severity >= 0.6);
    }
    expect(
      assessStructuralDamage(scenario, 'strong-wind', { seed: 7 }),
    ).toEqual(wind);
  });
});
