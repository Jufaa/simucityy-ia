import {
  createFloodEnvironment,
  EvacuationEngine,
  type CityScenarioInput,
  type EvacuationSnapshot,
  type FloodDrain,
} from '@simulicity/hazards';
import type { CityResponse } from './city-types';
import { FloodSimulation } from './flood-simulation';
import { sampleTerrainHeight } from './terrain-view';
import { organicFloodEnvironment } from './organic-flood-environment';

export type ComparisonArm = 'before' | 'after';
export interface DistrictSimulationOptions {
  evacuationEnabled?: boolean;
  alarmMode?: 'automatic' | 'manual';
  autoStart?: boolean;
}
interface Arm {
  flood: FloodSimulation;
  evacuation: EvacuationEngine;
  people: EvacuationSnapshot;
  exposed: Set<string>;
  peakDepth: number;
  peakBlocked: number;
}

/** Matched local experiments; all arms advance on one synchronous simulation timeline. */
export class DistrictSimulation {
  private arms: Record<ComparisonArm, Arm>;
  private selected: ComparisonArm = 'before';
  private secondsIntoTick = 0;
  private elapsed = 0;
  private speed = 300;
  readonly drains: readonly FloodDrain[];
  readonly evacuationEnabled: boolean;
  private readonly alarmMode: 'automatic' | 'manual';
  running = false;
  started = false;
  alarmTime: number | null = null;
  private readonly input: CityScenarioInput;

  constructor(
    private readonly city: CityResponse,
    options: DistrictSimulationOptions = {},
  ) {
    this.evacuationEnabled = options.evacuationEnabled ?? true;
    this.alarmMode = options.alarmMode ?? 'automatic';
    if (!city.terrainGrid || !city.roadGraph?.edges)
      throw new Error('Missing simulation grid or graph.');
    this.input = {
      terrain: city.terrain,
      terrainGrid: city.terrainGrid,
      roadGraph: { nodes: city.roadGraph.nodes, edges: city.roadGraph.edges },
      buildings: city.buildings,
    };
    const blocked = new Set(
      createFloodEnvironment(this.input, { obstacles: true })
        .blockedCellIndices,
    );
    const grid = city.terrainGrid;
    const locate = (axis: readonly number[], value: number) => {
      const next = axis.findIndex((x, i) => i > 0 && x > value);
      return next < 0 ? axis.length - 2 : Math.max(0, next - 1);
    };
    const nodes = [...city.roadGraph.nodes].filter(
      (node) =>
        !blocked.has(
          locate(grid.yCoordinates, node.y) * (grid.xCoordinates.length - 1) +
            locate(grid.xCoordinates, node.x),
        ),
    );
    nodes.sort(
      (a, b) =>
        sampleTerrainHeight(city, a.x, a.y) -
          sampleTerrainHeight(city, b.x, b.y) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    this.drains = nodes.slice(0, 6).map((node) => ({
      id: `drain:${node.id}`,
      position: { x: node.x, y: node.y },
      capacityInCubicMetersPerSecond: 0.15,
    }));
    this.arms = { before: this.createArm(false), after: this.createArm(true) };
    if (options.autoStart) this.start();
  }

  private createArm(improved: boolean): Arm {
    const environment = {
      ...createFloodEnvironment(this.input, {
        obstacles: true,
        permeableAreas: this.city.district?.parks ?? [],
        infiltrationRateMmPerHour: improved ? 60 : 15,
        drains: improved ? this.drains : [],
      }),
      ...organicFloodEnvironment(this.city),
    };
    const flood = new FloodSimulation(this.input, environment);
    const shelters = (this.city.shelters ?? []).flatMap((s) =>
      s.capacity === undefined ? [] : [{ ...s, capacity: s.capacity }],
    );
    const evacuation = new EvacuationEngine({
      roadGraph: this.input.roadGraph,
      citizens: this.city.citizens ?? [],
      shelters,
    });
    return {
      flood,
      evacuation,
      people: evacuation.getSnapshot(),
      exposed: new Set(),
      peakDepth: 0,
      peakBlocked: 0,
    };
  }

  get snapshot() {
    return this.arms[this.selected].flood.snapshot;
  }
  get cells() {
    return this.arms.before.flood.cells;
  }
  get evacuation() {
    return this.arms[this.selected].people;
  }
  get arm() {
    return this.selected;
  }
  selectArm(arm: ComparisonArm) {
    this.selected = arm;
  }
  setSpeed(speed: number) {
    if (speed !== 3 && speed !== 30 && speed !== 300)
      throw new RangeError('Supported speeds are 3x, 30x and 300x.');
    this.speed = speed;
  }
  start() {
    this.started = this.running = true;
    for (const arm of Object.values(this.arms)) arm.flood.start();
  }
  pause() {
    this.running = false;
    for (const arm of Object.values(this.arms)) arm.flood.pause();
  }
  triggerAlarm() {
    if (!this.evacuationEnabled || this.alarmTime !== null) return;
    this.alarmTime = this.elapsed;
    for (const arm of Object.values(this.arms))
      arm.people = arm.evacuation.advance(
        0,
        arm.flood.snapshot.blockedRoadEdgeIds,
      );
  }
  reset() {
    this.running = this.started = false;
    this.alarmTime = null;
    this.elapsed = this.secondsIntoTick = 0;
    this.arms = { before: this.createArm(false), after: this.createArm(true) };
  }

  get comparison() {
    const metrics = (arm: Arm) => ({
      tick: arm.flood.snapshot.tick,
      rainVolume: arm.flood.snapshot.balance.totalRainVolumeInCubicMeters,
      drainedVolume: arm.flood.snapshot.balance.totalDrainedVolumeInCubicMeters,
      exposedBuildings: arm.exposed.size,
      peakBlocked: arm.peakBlocked,
      peakDepth: arm.peakDepth,
      evacuated: arm.people.evacuatedCount,
      stranded: arm.people.strandedCount,
      completionSeconds:
        this.alarmTime === null ? null : arm.people.completionTimeInSeconds,
    });
    return {
      before: metrics(this.arms.before),
      after: metrics(this.arms.after),
    };
  }

  advance(realSeconds: number): boolean {
    if (!this.running || !Number.isFinite(realSeconds) || realSeconds <= 0)
      return false;
    let remaining = realSeconds * this.speed,
      changed = false;
    while (remaining > 1e-8) {
      const dt = Math.min(remaining, 60 - this.secondsIntoTick);
      for (const arm of Object.values(this.arms)) {
        if (this.evacuationEnabled && this.alarmTime !== null)
          arm.people = arm.evacuation.advance(
            dt,
            arm.flood.snapshot.blockedRoadEdgeIds,
          );
        changed = arm.flood.advance(dt / 300) || changed;
      }
      this.elapsed += dt;
      this.secondsIntoTick += dt;
      remaining -= dt;
      if (this.secondsIntoTick >= 60 - 1e-8) {
        this.secondsIntoTick = 0;
        for (const arm of Object.values(this.arms)) {
          const snapshot = arm.flood.snapshot;
          snapshot.exposedBuildingIds.forEach((id) => arm.exposed.add(id));
          arm.peakDepth = Math.max(
            arm.peakDepth,
            snapshot.maxWaterDepthInMeters,
          );
          arm.peakBlocked = Math.max(
            arm.peakBlocked,
            snapshot.blockedRoadEdgeIds.length,
          );
        }
        if (
          this.alarmMode === 'automatic' &&
          this.alarmTime === null &&
          Object.values(this.arms).some(
            (arm) =>
              arm.flood.snapshot.blockedRoadEdgeIds.length ||
              arm.flood.snapshot.exposedBuildingIds.length,
          )
        )
          this.alarmTime = this.elapsed;
        if (this.evacuationEnabled && this.alarmTime !== null)
          for (const arm of Object.values(this.arms))
            arm.people = arm.evacuation.advance(
              0,
              arm.flood.snapshot.blockedRoadEdgeIds,
            );
      }
    }
    return changed;
  }
}
