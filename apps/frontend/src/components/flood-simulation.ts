import { FloodEngine, type CityScenarioInput } from '@simulicity/hazards';

/** A synchronous controller: one real second represents five simulated minutes. */
export class FloodSimulation {
  private engine: FloodEngine;
  private accumulatedSeconds = 0;
  running = false;
  started = false;
  snapshot;

  constructor(private readonly city: CityScenarioInput) {
    this.engine = this.createEngine();
    this.snapshot = this.engine.getSnapshot();
  }

  private createEngine() {
    return new FloodEngine(this.city, { syntheticRelief: 'none' });
  }

  get cells() {
    return this.engine.getCells();
  }

  start() {
    this.started = true;
    this.running = true;
  }

  pause() {
    this.running = false;
  }

  reset() {
    this.pause();
    this.started = false;
    this.accumulatedSeconds = 0;
    this.engine = this.createEngine();
    this.snapshot = this.engine.getSnapshot();
  }

  advance(realSeconds: number): boolean {
    if (!this.running || !Number.isFinite(realSeconds) || realSeconds <= 0)
      return false;
    this.accumulatedSeconds += realSeconds;
    let changed = false;
    while (this.accumulatedSeconds >= 0.2 - 1e-9) {
      this.snapshot = this.engine.step();
      this.accumulatedSeconds = Math.max(0, this.accumulatedSeconds - 0.2);
      changed = true;
    }
    return changed;
  }
}
