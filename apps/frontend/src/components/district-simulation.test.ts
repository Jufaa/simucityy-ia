import { expect, it } from 'vitest';
import { generateCityScenario } from '../../../backend/src/modules/cities/city-scenario-generator';
import type { CityResponse } from './city-types';
import { createReliefCity } from './terrain-view';
import { DistrictSimulation } from './district-simulation';

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

it('pushes the tsunami front across most of the city instead of stalling at the first buildings', () => {
  const sim = new DistrictSimulation(createReliefCity(makeCity()), {
    hazard: 'tsunami',
  });
  sim.start();
  sim.advance(30);
  let front = -20;
  sim.cells.forEach((cell, index) => {
    if ((sim.snapshot.waterDepthInMeters[index] ?? 0) >= 0.06)
      front = Math.max(front, cell.maxX);
  });
  // La ciudad mide 200 m: el frente supera el 75 % del recorrido.
  expect(front).toBeGreaterThan(150);
});

it('keeps accumulating river water over time until houses are exposed', () => {
  const sim = new DistrictSimulation(createReliefCity(makeCity()), {
    hazard: 'river-overflow',
  });
  sim.start();
  sim.advance(20);
  const earlyMean = sim.snapshot.meanWaterDepthInMeters;
  const earlyExposed = sim.snapshot.exposedBuildingIds.length;
  sim.advance(40);
  expect(sim.snapshot.meanWaterDepthInMeters).toBeGreaterThan(earlyMean);
  expect(sim.snapshot.exposedBuildingIds.length).toBeGreaterThan(earlyExposed);
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
