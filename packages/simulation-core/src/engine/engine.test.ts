import { describe, expect, it } from 'vitest';
import { demoScenario } from '@simulicity/shared';
import { SimulationEngine, createSeededRandom } from '../index';
describe('deterministic empty engine', () => {
  it('initializes empty, advances in seconds, pauses, and resets exactly', () => {
    const engine = new SimulationEngine(demoScenario);
    const initial = engine.getState();
    expect(initial.status).toBe('ready');
    expect(initial.metrics).toMatchObject({
      steps: 0,
      elapsedSeconds: 0,
      populationCount: 0,
      buildingCount: 0,
      affectedBuildings: null,
    });
    engine.step(0.5);
    expect(engine.getState().metrics).toMatchObject({
      steps: 1,
      elapsedSeconds: 0.5,
    });
    engine.pause();
    const paused = engine.getState();
    engine.step(1);
    expect(engine.getState()).toEqual(paused);
    engine.resume();
    engine.step(1);
    expect(engine.getState().metrics.elapsedSeconds).toBe(1.5);
    engine.reset();
    expect(engine.getState()).toEqual(initial);
  });
  it('reproduces identical runs and random sequences for a seed', () => {
    const a = new SimulationEngine(demoScenario);
    const b = new SimulationEngine(demoScenario);
    for (const dt of [0.1, 1, 0.5, 2]) {
      a.step(dt);
      b.step(dt);
    }
    expect(a.getState()).toEqual(b.getState());
    const x = createSeededRandom(42);
    const y = createSeededRandom(42);
    const other = createSeededRandom(43);
    const sequence = Array.from({ length: 20 }, x);
    expect(sequence).toEqual(Array.from({ length: 20 }, y));
    expect(sequence).not.toEqual(Array.from({ length: 20 }, other));
    expect(sequence.every((v) => v >= 0 && v < 1)).toBe(true);
  });
  it('rejects invalid steps without mutation and returns detached snapshots', () => {
    const engine = new SimulationEngine(demoScenario);
    const before = engine.getState();
    for (const dt of [-1, 0, Infinity, NaN])
      expect(() => engine.step(dt)).toThrow();
    expect(engine.getState()).toEqual(before);
    const copy = engine.getState();
    copy.world.citizens.push({
      id: 'test',
      position: { crs: 'local-meters', x: 0, y: 0, z: 0 },
      status: 'idle',
      provenance: demoScenario.provenance,
    });
    expect(engine.getState().world.citizens).toHaveLength(0);
  });
  it('does not pretend unimplemented hazards are simulated', () => {
    expect(
      () =>
        new SimulationEngine({
          ...demoScenario,
          hazards: [
            {
              id: 'f',
              kind: 'flood',
              enabled: true,
              provenance: demoScenario.provenance,
            },
          ],
        }),
    ).toThrow(/not implemented/);
  });
});
