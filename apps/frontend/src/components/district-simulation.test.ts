import { expect, it } from 'vitest';
import { generateCityScenario } from '../../../backend/src/modules/cities/city-scenario-generator';
import type { CityResponse } from './city-types';
import { createReliefCity } from './terrain-view';
import { DistrictSimulation } from './district-simulation';
import { hazardWarningTimeInSeconds } from '@simulicity/hazards';

const makeCity = (): CityResponse =>
  JSON.parse(
    JSON.stringify(
      generateCityScenario({
        layout: 'district',
        detailLevel: 'urban',
        config: {
          widthInMeters: 200,
          heightInMeters: 200,
          streetSpacingInMeters: 50,
          seed: 123,
        },
        terrain: { kind: 'flat', elevationInMeters: 25 },
        populationCount: 12,
      }),
    ),
  );

it('runs matched independent arms with bounded mitigation and preserves pause/reset and source bytes', () => {
  const city = createReliefCity(makeCity()),
    before = JSON.stringify(city);
  const sim = new DistrictSimulation(city);
  expect(sim.snapshot.tick).toBe(0);
  expect(sim.comparison.before.completionSeconds).toBeNull();
  expect(sim.drains.length).toBeGreaterThan(0);
  sim.start();
  sim.advance(24);
  const a = sim.comparison.before,
    b = sim.comparison.after;
  expect(a.tick).toBe(b.tick);
  expect(a.rainVolume).toBeCloseTo(b.rainVolume);
  expect(b.drainedVolume).toBeGreaterThan(a.drainedVolume);
  expect(sim.alarmTime).not.toBeNull();
  sim.pause();
  const paused = sim.snapshot;
  sim.advance(3);
  expect(sim.snapshot).toBe(paused);
  sim.selectArm('after');
  expect(sim.snapshot.tick).toBe(a.tick);
  sim.reset();
  expect(sim.started).toBe(false);
  expect(sim.snapshot.tick).toBe(0);
  expect(sim.alarmTime).toBeNull();
  expect(sim.evacuation.waitingCount).toBe(12);
  expect(sim.comparison.before.exposedBuildings).toBe(0);
  expect(JSON.stringify(city)).toBe(before);
});

it('keeps both clocks aligned when speed changes and uses simulation time for evacuation', () => {
  const sim = new DistrictSimulation(makeCity());
  sim.setSpeed(30);
  sim.start();
  sim.advance(2);
  expect(sim.snapshot.elapsedTimeInSeconds).toBe(60);
  sim.setSpeed(300);
  sim.advance(0.2);
  expect(sim.snapshot.elapsedTimeInSeconds).toBe(120);
  expect(sim.comparison.before.tick).toBe(sim.comparison.after.tick);
});

it('can disable all automatic population behavior while floods continue in both arms', () => {
  const city = createReliefCity(makeCity());
  const simulation = new DistrictSimulation(city, { evacuationEnabled: false });
  const initial = simulation.evacuation;
  simulation.start();
  simulation.advance(24);
  expect(simulation.snapshot.tick).toBeGreaterThan(0);
  expect(simulation.alarmTime).not.toBeNull();
  expect(simulation.evacuation).toEqual(initial);
  expect(simulation.comparison.before.evacuated).toBe(0);
  simulation.selectArm('after');
  expect(simulation.evacuation).toEqual(initial);
  simulation.reset();
  expect(simulation.evacuation).toEqual(initial);
});

it('waits for a manual alarm, preserves its timestamp and resets both populations', () => {
  const city = makeCity();
  const simulation = new DistrictSimulation(city, { alarmMode: 'manual' });
  const initial = simulation.evacuation;
  simulation.start();
  simulation.advance(24);
  expect(simulation.alarmTime).toBeNull();
  expect(simulation.evacuation).toEqual(initial);
  simulation.triggerAlarm();
  expect(simulation.alarmTime).toBe(7200);
  simulation.triggerAlarm();
  expect(simulation.alarmTime).toBe(7200);
  simulation.advance(2);
  expect(simulation.evacuation).not.toEqual(initial);
  simulation.pause();
  const paused = simulation.evacuation;
  simulation.advance(2);
  expect(simulation.evacuation).toEqual(paused);
  simulation.reset();
  expect(simulation.alarmTime).toBeNull();
  expect(simulation.evacuation).toEqual(initial);
  simulation.selectArm('after');
  expect(simulation.evacuation).toEqual(initial);
});

it('evacuates both arms after an early manual alarm with stable citizen IDs', () => {
  const city = makeCity();
  const simulation = new DistrictSimulation(city, { alarmMode: 'manual' });
  const ids = simulation.evacuation.citizens.map((person) => person.id);
  simulation.start();
  simulation.triggerAlarm();
  simulation.setSpeed(30);
  simulation.advance(30);
  for (const arm of ['before', 'after'] as const) {
    simulation.selectArm(arm);
    expect(simulation.evacuation.citizens.map((person) => person.id)).toEqual(
      ids,
    );
    expect(simulation.evacuation.evacuatedCount).toBe(ids.length);
  }
  const disabled = new DistrictSimulation(city, {
    evacuationEnabled: false,
    alarmMode: 'manual',
  });
  disabled.triggerAlarm();
  expect(disabled.alarmTime).toBeNull();
});

it('can start unattended and automatically raise the hazard alarm without user commands', () => {
  const simulation = new DistrictSimulation(makeCity(), { autoStart: true });
  expect(simulation.running).toBe(true);
  expect(simulation.alarmTime).toBeNull();
  simulation.advance(24);
  expect(simulation.alarmTime).not.toBeNull();
  expect(simulation.evacuation.elapsedTimeInSeconds).toBeGreaterThan(0);
  simulation.pause();
  const paused = simulation.evacuation;
  simulation.advance(2);
  expect(simulation.evacuation).toEqual(paused);
});

it('runs a tsunami from the west edge and raises the alarm without rain', () => {
  const sim = new DistrictSimulation(makeCity(), { hazard: 'tsunami' });
  expect(sim.hazard).toBe('tsunami');
  expect(sim.preset.waveHeightInMeters).toBeGreaterThan(0);
  expect(sim.snapshot.maxWaterDepthInMeters).toBeGreaterThan(0.5);
  sim.start();
  sim.advance(24);
  expect(sim.alarmTime).not.toBeNull();
  expect(sim.snapshot.balance.totalRainVolumeInCubicMeters).toBe(0);
});

it('collapses shoreline buildings under tsunami load and reroutes evacuation', () => {
  const sim = new DistrictSimulation(makeCity(), { hazard: 'tsunami' });
  sim.start();
  sim.advance(24);
  expect(sim.snapshot.maxWaterDepthInMeters).toBeGreaterThan(0.5);
  expect(sim.comparison.before.collapsedBuildings).toBeGreaterThan(0);
  expect(
    sim.buildingImpacts.filter((i) => i.condition === 'collapsed').length,
  ).toBe(sim.comparison.before.collapsedBuildings);
});

it('keeps an earthquake dry but damages buildings, blocks roads and evacuates', () => {
  const sim = new DistrictSimulation(makeCity(), { hazard: 'earthquake' });
  sim.start();
  sim.advance(24);
  expect(sim.snapshot.maxWaterDepthInMeters).toBe(0);
  expect(sim.comparison.before.damagedBuildings).toBeGreaterThan(0);
  expect(sim.comparison.after.damagedBuildings).toBeLessThanOrEqual(
    sim.comparison.before.damagedBuildings,
  );
  expect(sim.selectedBlockedRoadEdgeIds.length).toBeGreaterThan(0);
  expect(sim.alarmTime).not.toBeNull();
});

it('collapses earthquake buildings over time, traps slow residents and cuts roads with debris', () => {
  const sim = new DistrictSimulation(makeCity(), { hazard: 'earthquake' });
  expect(sim.buildingImpacts.every((i) => i.condition !== 'collapsed')).toBe(
    true,
  );
  sim.start();
  // La alarma suena con la sacudida, sin esperar al agua.
  expect(sim.alarmTime).toBe(0);
  sim.advance(24);
  const collapsed = sim.buildingImpacts.filter(
    (i) => i.condition === 'collapsed',
  );
  expect(collapsed.length).toBeGreaterThan(0);
  expect(sim.comparison.before.collapsedBuildings).toBe(collapsed.length);
  expect(sim.selectedCollapsedBlockedRoadEdgeIds.length).toBeGreaterThan(0);
  const people = sim.evacuation;
  expect(
    people.evacuatedCount +
      people.trappedCount +
      people.strandedCount +
      people.waitingCount,
  ).toBe(12);
  // Tras el reset no hay derrumbes ni atrapados: el evento vuelve a empezar.
  sim.reset();
  expect(sim.comparison.before.collapsedBuildings).toBe(0);
  expect(sim.evacuation.trappedCount).toBe(0);
  expect(sim.evacuation.waitingCount).toBe(12);
});

it('grows wind damage with the gust ramp instead of damaging instantly', () => {
  const sim = new DistrictSimulation(makeCity(), { hazard: 'strong-wind' });
  sim.start();
  sim.advance(0.1);
  expect(sim.alarmTime).toBeNull();
  expect(sim.buildingImpacts.every((i) => i.condition === 'intact')).toBe(true);
  sim.advance(24);
  expect(sim.alarmTime).not.toBeNull();
  expect(sim.buildingImpacts.some((i) => i.condition !== 'intact')).toBe(true);
});

it('keeps strong wind dry with structural damage as the hazard', () => {
  const sim = new DistrictSimulation(makeCity(), { hazard: 'strong-wind' });
  sim.start();
  sim.advance(24);
  expect(sim.snapshot.maxWaterDepthInMeters).toBe(0);
  expect(sim.preset.windSpeedKmh).toBe(110);
  expect(sim.structural.buildings.length).toBeGreaterThan(0);
  expect(sim.alarmTime).not.toBeNull();
});

it('supports a readable 3x walking speed without changing the shared simulation clock', () => {
  const simulation = new DistrictSimulation(makeCity(), { autoStart: true });
  simulation.setSpeed(3);
  simulation.advance(20);
  expect(simulation.snapshot.elapsedTimeInSeconds).toBe(60);
  expect(simulation.comparison.before.tick).toBe(
    simulation.comparison.after.tick,
  );
});

it('runs opt-in daily routines and hands the same people to evacuation at their actual locations', () => {
  const city = makeCity(),
    before = JSON.stringify(city);
  const sim = new DistrictSimulation(city, {
    routinesEnabled: true,
    alarmMode: 'manual',
  });
  const initial = sim.citizenState;
  expect(initial.citizens).toHaveLength(12);
  sim.setSpeed(3);
  sim.start();
  let walker = false;
  for (let i = 0; i < 20; i++) {
    sim.advance(1);
    if (
      sim.evacuation.citizens.some((person) => person.currentEdgeId !== null)
    ) {
      walker = true;
      break;
    }
  }
  expect(walker).toBe(true);
  expect(sim.citizenState.citizens.map((p) => p.position)).not.toEqual(
    initial.citizens.map((p) => p.position),
  );
  sim.pause();
  const paused = sim.citizenState;
  sim.advance(10);
  expect(sim.citizenState).toEqual(paused);
  sim.triggerAlarm();
  expect(sim.evacuation.citizens.map((p) => p.position)).toEqual(
    paused.citizens.map((p) => p.position),
  );
  expect(new Set(sim.citizenState.citizens.map((p) => p.id)).size).toBe(12);
  sim.reset();
  expect(sim.citizenState).toEqual(initial);
  expect(JSON.stringify(city)).toBe(before);
});

it('keeps the peaceful city alive without starting an earthquake or a hydraulic event', () => {
  const city = makeCity();
  const sim = new DistrictSimulation(city, {
    hazard: 'earthquake',
    routinesEnabled: true,
    hazardsEnabled: false,
    autoStart: true,
  });
  sim.setSpeed(3);
  const initial = sim.citizenState;
  sim.advance(10);
  expect(sim.elapsedTimeInSeconds).toBe(30);
  expect(sim.snapshot.tick).toBe(0);
  expect(sim.alarmTime).toBeNull();
  expect(sim.comparison.before.damagedBuildings).toBe(0);
  expect(sim.collapsedBuildingIds).toHaveLength(0);
  expect(sim.citizenState.citizens.map((p) => p.position)).not.toEqual(
    initial.citizens.map((p) => p.position),
  );
  sim.pause();
  sim.advance(10);
  expect(sim.elapsedTimeInSeconds).toBe(30);
  sim.reset();
  expect(sim.elapsedTimeInSeconds).toBe(0);
});

it.each(['fire', 'tornado'] as const)(
  'warns exactly before %s arrival, then integrates damage, reset and immutable input',
  (hazard) => {
    const city = makeCity(),
      source = JSON.stringify(city);
    const sim = new DistrictSimulation(city, {
      hazard,
      routinesEnabled: true,
      autoStart: true,
    });
    sim.setSpeed(3);
    const warning = hazardWarningTimeInSeconds(hazard, sim.structural);
    expect(warning).not.toBeNull();
    sim.advance((warning ?? 0) / 3);
    expect(sim.alarmTime).toBe(warning);
    expect(sim.elapsedTimeInSeconds).toBe(warning);
    expect(sim.buildingImpacts.every((p) => p.condition === 'intact')).toBe(
      true,
    );
    sim.advance(5);
    expect(sim.collapsedBuildingIds).toHaveLength(0);
    sim.advance(60);
    expect(sim.comparison.before.damagedBuildings).toBeGreaterThan(0);
    expect(sim.evacuation.citizens).toHaveLength(city.citizens?.length ?? 0);
    sim.reset();
    expect(sim.alarmTime).toBeNull();
    expect(sim.comparison.before.damagedBuildings).toBe(0);
    expect(sim.selectedCollapsedBlockedRoadEdgeIds).toHaveLength(0);
    expect(JSON.stringify(city)).toBe(source);
  },
);

it('does not retain tsunami source water when the selected event is disabled for daily life', () => {
  const sim = new DistrictSimulation(makeCity(), {
    hazard: 'tsunami',
    hazardsEnabled: false,
    autoStart: true,
  });
  expect(sim.snapshot.maxWaterDepthInMeters).toBe(0);
  sim.advance(1);
  expect(sim.snapshot.maxWaterDepthInMeters).toBe(0);
  expect(sim.alarmTime).toBeNull();
});
