import { describe, expect, it } from 'vitest';
import {
  assessStructuralDamage,
  buildingImpactAt,
  clampEarthquakeMagnitude,
  clampTsunamiWaveHeightInMeters,
  createDemoCompatibleScenario,
  createHazardPulses,
  EARTHQUAKE_MAGNITUDE_LIMITS,
  floodCollapseDepthInMeters,
  floodImpactLoadInMeters,
  FloodEngine,
  HAZARD_KINDS,
  hazardPreset,
  isHazardKind,
  roadEdgeIdsBlockedByBuildings,
  TSUNAMI_WAVE_HEIGHT_LIMITS_IN_METERS,
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

  it('la magnitud y la ola son elegibles dentro de limites reales', () => {
    // Terremoto: el mayor registrado es 9,5 (Chile 1960); nada por encima.
    expect(EARTHQUAKE_MAGNITUDE_LIMITS).toEqual({ min: 4, max: 9.5 });
    expect(clampEarthquakeMagnitude(500)).toBe(9.5);
    expect(clampEarthquakeMagnitude(1)).toBe(4);
    expect(clampEarthquakeMagnitude(Number.NaN)).toBe(6.8);
    expect(clampEarthquakeMagnitude(7.4)).toBeCloseTo(7.4);
    // Tsunami: ni olas de 500.000 m ni negativas.
    expect(TSUNAMI_WAVE_HEIGHT_LIMITS_IN_METERS).toEqual({
      min: 0.5,
      max: 20,
    });
    expect(clampTsunamiWaveHeightInMeters(500000)).toBe(20);
    expect(clampTsunamiWaveHeightInMeters(-3)).toBe(0.5);

    const scenario = createDemoCompatibleScenario(200, 200, 25);
    // La ola elegida escala los pulsos; el preset sigue siendo el default.
    const preset = createHazardPulses(scenario, 'tsunami');
    const big = createHazardPulses(scenario, 'tsunami', [], 10);
    const maxDepth = (pulses: typeof preset) =>
      Math.max(...pulses.map((pulse) => pulse.depthInMeters));
    expect(maxDepth(big)).toBeCloseTo(10);
    expect(maxDepth(preset)).toBeCloseTo(2.2);
    // Y una ola absurda se recorta al máximo real, no entra cruda.
    expect(maxDepth(createHazardPulses(scenario, 'tsunami', [], 500000))).toBe(
      20,
    );

    // La magnitud escala el daño: 5 apenas daña, 6,8 es el histórico y
    // 9,5 daña estrictamente más (suma de severidades, monótona).
    const assessmentAt = (magnitude?: number) =>
      assessStructuralDamage(scenario, 'earthquake', {
        seed: 7,
        ...(magnitude !== undefined ? { magnitude } : {}),
      });
    const severitySum = (magnitude?: number) =>
      assessmentAt(magnitude).buildings.reduce(
        (sum, item) => sum + item.severity,
        0,
      );
    expect(assessmentAt().damagedBuildingIds).toEqual(
      assessmentAt(6.8).damagedBuildingIds,
    );
    expect(severitySum(5)).toBeLessThan(severitySum(6.8));
    expect(severitySum(9.5)).toBeGreaterThan(severitySum(6.8));
    expect(severitySum(500)).toBe(severitySum(9.5));
    expect(assessmentAt(5).damagedBuildingIds.length).toBeLessThanOrEqual(
      assessmentAt(6.8).damagedBuildingIds.length,
    );
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

  it('el daño sísmico decae con la distancia: lejos del epicentro no hay afectados', () => {
    const scenario = createDemoCompatibleScenario(500, 500, 25);
    const quake = assessStructuralDamage(scenario, 'earthquake');
    const byId = new Map(quake.buildings.map((b) => [b.buildingId, b]));
    // El edificio de la esquina (lejos del epicentro central) queda intacto
    // incluso al final del evento; el central sí puede resultar dañado.
    const corner = byId.get('bldg-corner-high')!;
    expect(buildingImpactAt(corner, 'earthquake', 3600).condition).toBe(
      'intact',
    );
    const center = byId.get('bldg-center-low')!;
    expect(center.severity).toBeGreaterThan(corner.severity);
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
    // Un edificio que no se derrumba no corta ninguna calle: el conjunto
    // oficial solo se alimenta de derrumbados (igualdad verificada arriba).
    const corner = quake.buildings.find(
      (item) => item.buildingId === 'bldg-corner-high',
    )!;
    expect(corner.collapsed).toBe(false);
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
