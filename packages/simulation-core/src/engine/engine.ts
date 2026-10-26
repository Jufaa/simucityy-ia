import {
  scenarioSchema,
  type Scenario,
  type SimulationMetrics,
} from '@simulicity/shared';
import type { WorldState } from '../world/types';
import type { HazardFactory, HazardSystem } from '../hazards/types';
import { getMetrics } from '../metrics';
import { createSeededRandom } from './random';
export interface EngineSnapshot {
  status: 'ready' | 'running' | 'paused';
  world: WorldState;
  metrics: SimulationMetrics;
}
/** Synchronous pure-TS lifecycle, transport agnostic for Web Workers and worker_threads. */
export class SimulationEngine {
  private readonly scenario: Scenario;
  private world!: WorldState;
  private status: EngineSnapshot['status'] = 'ready';
  private systems: HazardSystem[] = [];
  constructor(
    scenario: Scenario,
    private readonly factories: Partial<
      Record<Scenario['hazards'][number]['kind'], HazardFactory>
    > = {},
  ) {
    this.scenario = scenarioSchema.parse(structuredClone(scenario));
    this.reset();
  }
  reset(): void {
    const random = createSeededRandom(this.scenario.seed);
    const world: WorldState = {
      scenario: structuredClone(this.scenario),
      elapsedSeconds: 0,
      steps: 0,
      buildings: [],
      citizens: [],
      roads: [],
      shelters: [],
      terrain: [],
    };
    const systems = this.scenario.hazards
      .filter((h) => h.enabled)
      .map((h) => {
        const factory = this.factories[h.kind];
        if (!factory) throw new Error(`Hazard ${h.kind} is not implemented`);
        const system = factory(random);
        system.initialize(world);
        return system;
      });
    this.world = world;
    this.systems = systems;
    this.status = 'ready';
  }
  step(deltaTime: number): EngineSnapshot {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0 || deltaTime > 60)
      throw new RangeError('deltaTime must be in (0, 60] seconds');
    if (this.status === 'paused') return this.getState();
    for (const system of this.systems) system.update(this.world, deltaTime);
    this.world.elapsedSeconds += deltaTime;
    this.world.steps += 1;
    this.status = 'running';
    return this.getState();
  }
  pause(): void {
    this.status = 'paused';
  }
  resume(): void {
    this.status = 'running';
  }
  getState(): EngineSnapshot {
    return structuredClone({
      status: this.status,
      world: this.world,
      metrics: getMetrics(this.world),
    });
  }
}
