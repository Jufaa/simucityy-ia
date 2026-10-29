import { expect, it } from 'vitest';
import { createDemoCompatibleScenario } from '../../../../packages/hazards/src/defaults';
import { FloodSimulation } from './flood-simulation';

it('starts dry, advances at 300x, pauses, resumes and resets without changing the city', () => {
  const city = createDemoCompatibleScenario(100, 100, 25);
  const before = structuredClone(city);
  const simulation = new FloodSimulation(city);
  expect(simulation.snapshot.tick).toBe(0);
  expect(simulation.snapshot.maxWaterDepthInMeters).toBe(0);
  simulation.advance(1);
  expect(simulation.snapshot.tick).toBe(0);
  simulation.start();
  simulation.advance(0.1);
  simulation.pause();
  simulation.advance(10);
  expect(simulation.snapshot.tick).toBe(0);
  simulation.start();
  simulation.advance(0.1);
  expect(simulation.snapshot.tick).toBe(1);
  expect(simulation.snapshot.elapsedTimeInSeconds).toBe(60);
  expect(simulation.snapshot.maxWaterDepthInMeters).toBeCloseTo(0.00175);
  simulation.advance(25);
  expect(simulation.snapshot.blockedRoadEdgeIds.length).toBeGreaterThan(0);
  expect(simulation.snapshot.exposedBuildingIds.length).toBeGreaterThan(0);
  simulation.reset();
  expect(simulation.running).toBe(false);
  expect(simulation.snapshot.tick).toBe(0);
  expect(simulation.snapshot.maxWaterDepthInMeters).toBe(0);
  expect(simulation.snapshot.blockedRoadEdgeIds).toEqual([]);
  simulation.start();
  simulation.advance(0.2);
  expect(simulation.snapshot.tick).toBe(1);
  expect(city).toEqual(before);
});

it('keeps displayed flat terrain and simulated water elevations aligned', () => {
  const simulation = new FloodSimulation(
    createDemoCompatibleScenario(100, 100, 25),
  );
  simulation.start();
  simulation.advance(4);
  const depths = [...simulation.snapshot.waterDepthInMeters];
  expect(new Set(depths).size).toBe(1);
});

it('retains storm activation when paused before the first tick and clears it only on reset', () => {
  const simulation = new FloodSimulation(
    createDemoCompatibleScenario(100, 100, 25),
  );
  expect(simulation.started).toBe(false);
  simulation.start();
  simulation.advance(0.1);
  simulation.pause();
  expect(simulation.snapshot.tick).toBe(0);
  expect(simulation.started).toBe(true);
  expect(simulation.running).toBe(false);
  simulation.reset();
  expect(simulation.started).toBe(false);
});
