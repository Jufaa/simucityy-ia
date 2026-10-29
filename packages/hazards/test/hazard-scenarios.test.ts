import { describe, expect, it } from 'vitest';
import {
  assessStructuralDamage,
  buildingImpactAt,
  createDemoCompatibleScenario,
  createHazardPulses,
  floodCollapseDepthInMeters,
  floodImpactLoadInMeters,
  FloodEngine,
  HAZARD_KINDS,
  hazardPreset,
  isHazardKind,
  roadEdgeIdsBlockedByBuildings,
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

  it('los edificios se dañan primero y se derrumban en su instante determinista', () => {
    const scenario = createDemoCompatibleScenario(500, 500, 25);
    const quake = assessStructuralDamage(scenario, 'earthquake');
    for (const item of quake.buildings) {
      if (item.collapsed) {
        expect(item.damaged).toBe(true);
        expect(item.collapseTimeInSeconds).toBeGreaterThanOrEqual(4);
        expect(item.collapseTimeInSeconds).toBeLessThanOrEqual(114);
        const at0 = buildingImpactAt(item, 'earthquake', 0);
        expect(at0.condition).not.toBe('collapsed');
        const atCollapse = buildingImpactAt(
          item,
          'earthquake',
          item.collapseTimeInSeconds!,
        );
        expect(atCollapse.condition).toBe('collapsed');
      } else {
        expect(item.collapseTimeInSeconds).toBeNull();
        expect(buildingImpactAt(item, 'earthquake', 3600).condition).not.toBe(
          'collapsed',
        );
      }
    }
    // El viento no derrumba al inicio: la severidad crece con las rachas.
    const wind = assessStructuralDamage(scenario, 'strong-wind');
    for (const item of wind.buildings) {
      expect(buildingImpactAt(item, 'strong-wind', 0).condition).toBe('intact');
      if (item.collapsed)
        expect(item.collapseTimeInSeconds).toBeGreaterThanOrEqual(528);
    }
  });

  it('solo los derrumbes cortan calles con escombros', () => {
    const scenario = createDemoCompatibleScenario(500, 500, 25);
    const quake = assessStructuralDamage(scenario, 'earthquake');
    expect(roadEdgeIdsBlockedByBuildings(scenario, new Set())).toEqual([]);
    expect(quake.blockedRoadEdgeIds).toEqual(
      roadEdgeIdsBlockedByBuildings(
        scenario,
        new Set(
          quake.buildings
            .filter((item) => item.collapsed)
            .map((item) => item.buildingId),
        ),
      ),
    );
    // Un edificio solo dañado (no derrumbado) no corta ninguna calle.
    const damagedOnly = quake.buildings.find(
      (item) => item.damaged && !item.collapsed,
    );
    if (damagedOnly)
      expect(
        roadEdgeIdsBlockedByBuildings(
          scenario,
          new Set([damagedOnly.buildingId]),
        ),
      ).toEqual([]);
  });

  it('el agua derrumba a profundidades distintas por evento y edificio', () => {
    const house = { id: 'casa', heightInMeters: 3 };
    const tower = { id: 'torre', heightInMeters: 36 };
    for (const building of [house, tower]) {
      expect(floodCollapseDepthInMeters(building, 'tsunami')).toBeLessThan(
        floodCollapseDepthInMeters(building, 'river-overflow'),
      );
      expect(
        floodCollapseDepthInMeters(building, 'river-overflow'),
      ).toBeLessThan(floodCollapseDepthInMeters(building, 'rain'));
    }
    // La corriente del tsunami carga más que el agua quieta de lluvia.
    expect(floodImpactLoadInMeters(0.5, 'tsunami')).toBeGreaterThan(
      floodImpactLoadInMeters(0.5, 'river-overflow'),
    );
    expect(floodImpactLoadInMeters(0.5, 'river-overflow')).toBeGreaterThan(
      floodImpactLoadInMeters(0.5, 'rain'),
    );
    expect(floodImpactLoadInMeters(0.5, 'rain')).toBe(0.5);
    // Determinista y acotada.
    expect(floodCollapseDepthInMeters(house, 'tsunami')).toBe(
      floodCollapseDepthInMeters(house, 'tsunami'),
    );
    expect(floodCollapseDepthInMeters(house, 'tsunami')).toBeGreaterThanOrEqual(
      0.3,
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
