import { expect, it } from 'vitest';
import { hazardWarningTimeInSeconds } from '@simulicity/hazards';
import { createOrganicCity } from './organic-city-model';
import { generateCityLife } from './city-life-model';
import { DistrictSimulation } from './district-simulation';
import { generateCivicLandmarks } from './civic-landmarks';
import type { CityResponse } from './city-types';

function expandedCity() {
  const source: CityResponse = {
    config: {
      widthInMeters: 1200,
      heightInMeters: 1000,
      streetSpacingInMeters: 80,
      seed: 123,
    },
    terrain: { kind: 'flat', elevationInMeters: 25 },
    roads: [],
    blocks: [],
    buildings: [],
    citizens: Array.from({ length: 300 }, (_, i) => ({
      id: `person-${i}`,
      homeBuildingId: 'source-home',
      nodeId: 'source-node',
      position: { x: 0, y: 0 },
      mobilityFactor: 1,
      reactionDelayInSeconds: 3,
    })),
  };
  return createOrganicCity(source, 123, { expanded: true }).city;
}

it('reserves visible signals before street scenery exhausts its placement budget', () => {
  const city = expandedCity(),
    before = JSON.stringify(city);
  const life = generateCityLife(city, { prioritizeSignals: true });
  const signal = life.items.findIndex((item) => item.kind === 'traffic-light');
  expect(signal).toBeGreaterThanOrEqual(0);
  const car = life.items.findIndex(
    (item) =>
      item.kind === 'car' ||
      item.kind === 'taxi' ||
      item.kind === 'bus' ||
      item.kind === 'van',
  );
  if (car >= 0) expect(signal).toBeLessThan(car);
  expect(life.items.length).toBeLessThanOrEqual(600);
  expect(JSON.stringify(city)).toBe(before);
});

it('integrates a populated expanded peaceful city with bounded routine activity', () => {
  const city = expandedCity(),
    before = JSON.stringify(city);
  const landmarks = generateCivicLandmarks(city);
  const sim = new DistrictSimulation(city, {
    hazard: 'tornado',
    hazardsEnabled: false,
    routinesEnabled: true,
    routineFacilities: landmarks.assignments,
    autoStart: true,
  });
  sim.setSpeed(3);
  sim.advance(15);
  expect(sim.citizenState.citizens).toHaveLength(300);
  expect(
    new Set(sim.citizenState.citizens.map((person) => person.id)).size,
  ).toBe(300);
  expect(sim.routineActivity?.walking).toBeGreaterThan(0);
  expect(sim.routineActivity?.walking).toBeLessThanOrEqual(96);
  expect(sim.snapshot.tick).toBe(0);
  expect(sim.alarmTime).toBeNull();
  expect(sim.comparison.before.damagedBuildings).toBe(0);
  expect(JSON.stringify(city)).toBe(before);
});

it.each(['fire', 'tornado'] as const)(
  'integrates %s warning, occupancy-aware evacuation and actual collapse consequences',
  (hazard) => {
    const city = expandedCity();
    const sim = new DistrictSimulation(city, {
      hazard,
      routinesEnabled: true,
      autoStart: true,
    });
    sim.setSpeed(3);
    const warning = hazardWarningTimeInSeconds(hazard, sim.structural);
    expect(warning).not.toBeNull();
    sim.advance((warning ?? 0) / 3);
    expect(sim.alarmTime).toBeCloseTo(warning ?? 0);
    expect(
      sim.buildingImpacts.every((item) => item.condition === 'intact'),
    ).toBe(true);
    sim.advance(300);
    expect(sim.comparison.before.damagedBuildings).toBeGreaterThan(0);
    expect(sim.collapsedBuildingIds.length).toBeGreaterThan(0);
    expect(sim.citizenState.citizens).toHaveLength(300);
    expect(
      sim.evacuation.evacuatedCount +
        sim.evacuation.trappedCount +
        sim.evacuation.waitingCount +
        sim.evacuation.strandedCount,
    ).toBeLessThanOrEqual(300);
    expect(sim.snapshot.maxWaterDepthInMeters).toBe(0);
    sim.reset();
    expect(sim.alarmTime).toBeNull();
    expect(sim.comparison.before.collapsedBuildings).toBe(0);
  },
);
