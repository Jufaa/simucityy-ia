import {
  assessStructuralDamage,
  buildingImpactAt,
  floodCollapseDepthInMeters,
  floodImpactLoadInMeters,
  createFloodEnvironment,
  EvacuationEngine,
  hazardPreset,
  hazardWarningTimeInSeconds,
  roadEdgeIdsBlockedByBuildings,
  type BuildingImpact,
  type CityScenarioInput,
  type EvacuationSnapshot,
  type FloodDrain,
  type HazardKind,
  type StructuralAssessment,
} from '@simulicity/hazards';
import type { CityResponse } from './city-types';
import { FloodSimulation } from './flood-simulation';
import { sampleTerrainHeight } from './terrain-view';
import { organicFloodEnvironment } from './organic-flood-environment';
import { CitizenRoutineModel } from './citizen-routine-model';
import type { CivicLandmarkModel } from './civic-landmarks';

export type ComparisonArm = 'before' | 'after';
export interface DistrictSimulationOptions {
  evacuationEnabled?: boolean;
  alarmMode?: 'automatic' | 'manual';
  autoStart?: boolean;
  hazard?: HazardKind;
  routinesEnabled?: boolean;
  hazardsEnabled?: boolean;
  routineFacilities?: CivicLandmarkModel['assignments'];
}
interface Arm {
  flood: FloodSimulation;
  evacuation: EvacuationEngine;
  people: EvacuationSnapshot;
  routines: CitizenRoutineModel | null;
  exposed: Set<string>;
  peakDepth: number;
  peakBlocked: number;
  structural: StructuralAssessment;
  /** Edificio -> segundo simulado de su derrumbe (estructural o por agua). */
  collapsedAt: Map<string, number>;
  collapseSeverity: Map<string, number>;
  blockedCache: { collapsedCount: number; roadIds: string[] };
}

/** Matched local experiments; all arms advance on one synchronous simulation timeline. */
export class DistrictSimulation {
  private arms: Record<ComparisonArm, Arm>;
  private selected: ComparisonArm = 'before';
  private secondsIntoTick = 0;
  private elapsed = 0;
  private warningAt: number | null = null;
  private speed = 300;
  readonly drains: readonly FloodDrain[];
  readonly hazard: HazardKind;
  readonly hazardsEnabled: boolean;
  readonly evacuationEnabled: boolean;
  private readonly alarmMode: 'automatic' | 'manual';
  private readonly routinesEnabled: boolean;
  private readonly routineFacilities: CivicLandmarkModel['assignments'];
  running = false;
  started = false;
  alarmTime: number | null = null;
  private readonly input: CityScenarioInput;

  constructor(
    private readonly city: CityResponse,
    options: DistrictSimulationOptions = {},
  ) {
    this.evacuationEnabled = options.evacuationEnabled ?? true;
    this.hazardsEnabled = options.hazardsEnabled ?? true;
    this.routinesEnabled =
      (options.routinesEnabled ?? false) && this.evacuationEnabled;
    this.routineFacilities = options.routineFacilities ?? [];
    this.alarmMode = options.alarmMode ?? 'automatic';
    this.hazard = options.hazard ?? 'rain';
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
    this.warningAt = this.computeWarningTime();
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
    const flood = new FloodSimulation(
      this.input,
      environment,
      this.hazardsEnabled ? this.hazard : 'rain',
    );
    const structural = assessStructuralDamage(
      this.input,
      this.hazardsEnabled ? this.hazard : 'rain',
      {
        seed: this.city.config.seed ?? 123,
        reinforced: improved,
      },
    );
    const shelters = (this.city.shelters ?? []).flatMap((s) =>
      s.capacity === undefined ? [] : [{ ...s, capacity: s.capacity }],
    );
    // Reacción diferenciada por catástrofe: en terremoto se huye ya (más
    // rápido desde un edificio dañado); en viento la gente se resguarda
    // dentro durante las rachas y sale después; el tsunami tiene aviso
    // previo y el desborde da algo de margen. IDs, hogares y movilidad
    // no cambian: solo el tiempo de reacción.
    const damageByBuilding = new Map(
      structural.buildings.map((item) => [item.buildingId, item]),
    );
    const citizens = (this.city.citizens ?? []).map((citizen) => {
      const homeDamage = damageByBuilding.get(citizen.homeBuildingId);
      let delay = citizen.reactionDelayInSeconds;
      if (this.hazard === 'earthquake')
        delay *= homeDamage?.damaged ? 0.35 : 0.6;
      else if (this.hazard === 'strong-wind')
        delay = (delay + 240) * (homeDamage?.damaged ? 0.6 : 1);
      else if (this.hazard === 'tsunami') delay *= 0.5;
      else if (this.hazard === 'river-overflow') delay *= 0.8;
      else if (this.hazard === 'fire' || this.hazard === 'tornado')
        delay *= 0.5;
      return { ...citizen, reactionDelayInSeconds: delay };
    });
    const evacuation = new EvacuationEngine({
      roadGraph: this.input.roadGraph,
      citizens,
      shelters,
    });
    const routines = this.routinesEnabled
      ? new CitizenRoutineModel(this.city, this.routineFacilities)
      : null;
    if (routines) evacuation.synchronizeWaitingCitizens(routines.locations);
    return {
      flood,
      evacuation,
      people: evacuation.getSnapshot(),
      routines,
      exposed: new Set(),
      peakDepth: 0,
      peakBlocked: 0,
      structural,
      collapsedAt: new Map(),
      collapseSeverity: new Map(),
      blockedCache: { collapsedCount: -1, roadIds: [] },
    };
  }

  get elapsedTimeInSeconds() {
    return this.elapsed;
  }

  private computeWarningTime(): number | null {
    if (!this.hazardsEnabled) return null;
    const times = Object.values(this.arms).flatMap((arm) => {
      const time = hazardWarningTimeInSeconds(this.hazard, arm.structural);
      return time === null ? [] : [time];
    });
    return times.length ? Math.min(...times) : null;
  }

  private activateScheduledWarning() {
    const warning = this.warningAt;
    if (
      this.alarmMode !== 'automatic' ||
      this.alarmTime !== null ||
      warning === null ||
      this.elapsed < warning - 1e-9
    )
      return;
    this.alarmTime = this.elapsed;
    if (this.evacuationEnabled)
      for (const arm of Object.values(this.arms))
        arm.people = arm.evacuation.advance(0, this.blockedRoadEdgeIds(arm));
  }

  get preset() {
    return hazardPreset(this.hazard);
  }
  /** Daño estructural del escenario visible (sin/con mejora). */
  get structural() {
    return this.arms[this.selected].structural;
  }
  /** Tramos intransitables del brazo: agua (motor) + escombros de derrumbes ya ocurridos. */
  blockedRoadEdgeIds(arm: Arm): readonly string[] {
    const merged = new Set(arm.flood.snapshot.blockedRoadEdgeIds);
    for (const id of this.collapsedBlockedRoadEdgeIds(arm)) merged.add(id);
    return [...merged];
  }
  /** Solo los tramos cortados por escombros de edificios ya derrumbados. */
  collapsedBlockedRoadEdgeIds(arm: Arm): readonly string[] {
    if (arm.blockedCache.collapsedCount !== arm.collapsedAt.size) {
      arm.blockedCache = {
        collapsedCount: arm.collapsedAt.size,
        roadIds: roadEdgeIdsBlockedByBuildings(
          this.input,
          new Set(arm.collapsedAt.keys()),
        ),
      };
    }
    return arm.blockedCache.roadIds;
  }
  get selectedCollapsedBlockedRoadEdgeIds(): readonly string[] {
    return this.collapsedBlockedRoadEdgeIds(this.arms[this.selected]);
  }
  /** Estado físico actual (intacto/dañado/derrumbado) de cada edificio. */
  buildingImpactsOf(arm: Arm): BuildingImpact[] {
    if (!this.hazardsEnabled)
      return this.input.buildings.map((building) => ({
        buildingId: building.id,
        condition: 'intact' as const,
        severity: 0,
        collapseTimeInSeconds: null,
        cause: this.hazard,
      }));
    const floodByBuilding = new Map(
      arm.flood.snapshot.buildings.map((item) => [item.buildingId, item]),
    );
    const damageByBuilding = new Map(
      arm.structural.buildings.map((item) => [item.buildingId, item]),
    );
    return this.input.buildings.map((building) => {
      const collapsedAt = arm.collapsedAt.get(building.id);
      if (collapsedAt !== undefined)
        return {
          buildingId: building.id,
          condition: 'collapsed' as const,
          severity: arm.collapseSeverity.get(building.id) ?? 1,
          collapseTimeInSeconds: collapsedAt,
          cause: this.hazard,
        };
      const structural = damageByBuilding.get(building.id);
      if (structural && structural.severity > 0)
        return buildingImpactAt(structural, this.hazard, this.elapsed);
      const depth =
        floodByBuilding.get(building.id)?.maxWaterDepthInMeters ?? 0;
      const threshold = floodCollapseDepthInMeters(
        building,
        this.hazard,
        this.city.config.seed ?? 123,
      );
      const load = floodImpactLoadInMeters(depth, this.hazard);
      return {
        buildingId: building.id,
        condition: depth >= 0.2 ? ('damaged' as const) : ('intact' as const),
        severity: Math.min(0.59, load / threshold),
        collapseTimeInSeconds: null,
        cause: this.hazard,
      };
    });
  }
  get buildingImpacts(): BuildingImpact[] {
    return this.buildingImpactsOf(this.arms[this.selected]);
  }
  get collapsedBuildingIds(): readonly string[] {
    return [...this.arms[this.selected].collapsedAt.keys()];
  }
  get selectedBlockedRoadEdgeIds(): readonly string[] {
    return this.blockedRoadEdgeIds(this.arms[this.selected]);
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
  /** One presentation population; hazard truth always remains in the evacuation engine. */
  get citizenState() {
    const arm = this.arms[this.selected];
    if (!arm.routines || this.alarmTime !== null) return arm.people;
    const daily = new Map(
      arm.routines.snapshot.citizens.map((person) => [person.id, person]),
    );
    return {
      ...arm.people,
      elapsedTimeInSeconds: this.elapsed,
      citizens: arm.people.citizens.map((person) => ({
        ...person,
        walking:
          person.status === 'waiting' &&
          (daily.get(person.id)?.walking ?? false),
      })),
    };
  }
  get routineActivity() {
    const arm = this.arms[this.selected];
    if (!arm.routines || this.alarmTime !== null) return null;
    const trapped = new Set(
      arm.people.citizens
        .filter((person) => person.status === 'trapped')
        .map((person) => person.id),
    );
    const citizens = arm.routines.snapshot.citizens.filter(
      (person) => !trapped.has(person.id),
    );
    return {
      walking: citizens.filter((person) => person.walking).length,
      home: citizens.filter((person) => person.activity === 'home').length,
      visiting: citizens.filter(
        (person) => !person.walking && person.activity !== 'home',
      ).length,
    };
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
    // El terremoto no espera a que el agua corte una calle: la alarma
    // suena con la sacudida y la gente reacciona desde el segundo cero.
    if (
      this.hazardsEnabled &&
      this.alarmMode === 'automatic' &&
      this.alarmTime === null &&
      this.hazard === 'earthquake' &&
      Object.values(this.arms).some(
        (arm) => arm.structural.damagedBuildingIds.length > 0,
      )
    )
      this.alarmTime = 0;
    this.activateScheduledWarning();
  }

  /** Registra los derrumbes estructurales cuyo instante ya llegó. */
  private processStructuralCollapses(arm: Arm) {
    for (const damage of arm.structural.buildings) {
      if (
        !damage.collapsed ||
        damage.collapseTimeInSeconds === null ||
        this.elapsed < damage.collapseTimeInSeconds ||
        arm.collapsedAt.has(damage.buildingId)
      )
        continue;
      arm.collapsedAt.set(damage.buildingId, damage.collapseTimeInSeconds);
      arm.collapseSeverity.set(damage.buildingId, damage.severity);
      if (this.evacuationEnabled)
        arm.evacuation.trapCitizensInBuildings([damage.buildingId]);
    }
    if (this.evacuationEnabled) arm.people = arm.evacuation.getSnapshot();
  }

  /** Derrumbes por agua: la profundidad del motor supera la resistencia. */
  private processFloodCollapses(arm: Arm) {
    const buildingById = new Map(
      this.input.buildings.map((building) => [building.id, building]),
    );
    for (const status of arm.flood.snapshot.buildings) {
      if (arm.collapsedAt.has(status.buildingId)) continue;
      const building = buildingById.get(status.buildingId);
      if (!building) continue;
      const threshold = floodCollapseDepthInMeters(
        building,
        this.hazard,
        this.city.config.seed ?? 123,
      );
      const load = floodImpactLoadInMeters(
        status.maxWaterDepthInMeters,
        this.hazard,
      );
      if (load < threshold) continue;
      arm.collapsedAt.set(status.buildingId, this.elapsed);
      arm.collapseSeverity.set(
        status.buildingId,
        Math.min(1, Math.max(0.6, load / threshold)),
      );
      if (this.evacuationEnabled)
        arm.evacuation.trapCitizensInBuildings([status.buildingId]);
    }
    if (this.evacuationEnabled) arm.people = arm.evacuation.getSnapshot();
  }
  pause() {
    this.running = false;
    for (const arm of Object.values(this.arms)) arm.flood.pause();
  }
  triggerAlarm() {
    if (
      !this.hazardsEnabled ||
      !this.evacuationEnabled ||
      this.alarmTime !== null
    )
      return;
    this.alarmTime = this.elapsed;
    for (const arm of Object.values(this.arms))
      arm.people = arm.evacuation.advance(0, this.blockedRoadEdgeIds(arm));
  }
  reset() {
    this.running = this.started = false;
    this.alarmTime = null;
    this.elapsed = this.secondsIntoTick = 0;
    this.arms = { before: this.createArm(false), after: this.createArm(true) };
    this.warningAt = this.computeWarningTime();
  }

  get comparison() {
    const metrics = (arm: Arm) => ({
      tick: arm.flood.snapshot.tick,
      rainVolume: arm.flood.snapshot.balance.totalRainVolumeInCubicMeters,
      drainedVolume: arm.flood.snapshot.balance.totalDrainedVolumeInCubicMeters,
      exposedBuildings: arm.exposed.size,
      damagedBuildings: this.buildingImpactsOf(arm).filter(
        (item) => item.condition !== 'intact',
      ).length,
      collapsedBuildings: arm.collapsedAt.size,
      peakBlocked: arm.peakBlocked,
      peakDepth: arm.peakDepth,
      evacuated: arm.people.evacuatedCount,
      stranded: arm.people.strandedCount,
      trapped: arm.people.trappedCount,
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
      this.activateScheduledWarning();
      if (this.hazardsEnabled)
        for (const arm of Object.values(this.arms))
          this.processStructuralCollapses(arm);
      let dt = Math.min(remaining, 60 - this.secondsIntoTick);
      const warning = this.warningAt;
      if (
        this.alarmMode === 'automatic' &&
        this.alarmTime === null &&
        warning !== null &&
        warning > this.elapsed
      )
        dt = Math.min(dt, warning - this.elapsed);
      // No saltar por encima de un derrumbe: el avance se detiene en su
      // instante para atrapar a quien sigue dentro y cortar las calles.
      for (const arm of Object.values(this.arms))
        for (const damage of arm.structural.buildings) {
          if (
            damage.collapsed &&
            damage.collapseTimeInSeconds !== null &&
            damage.collapseTimeInSeconds > this.elapsed &&
            !arm.collapsedAt.has(damage.buildingId)
          )
            dt = Math.min(dt, damage.collapseTimeInSeconds - this.elapsed);
        }
      if (dt <= 1e-9) dt = Math.min(remaining, 60 - this.secondsIntoTick);
      for (const arm of Object.values(this.arms)) {
        if (arm.routines && this.alarmTime === null) {
          const trapped = new Set(
            arm.people.citizens
              .filter((person) => person.status === 'trapped')
              .map((person) => person.id),
          );
          arm.routines.advance(dt, this.blockedRoadEdgeIds(arm), trapped);
          arm.evacuation.synchronizeWaitingCitizens(
            arm.routines.locations.filter(
              (location) => !trapped.has(location.citizenId),
            ),
          );
          arm.people = arm.evacuation.getSnapshot();
        }
        if (this.evacuationEnabled && this.alarmTime !== null)
          arm.people = arm.evacuation.advance(dt, this.blockedRoadEdgeIds(arm));
        if (this.hazardsEnabled)
          changed = arm.flood.advance(dt / 300) || changed;
      }
      this.elapsed += dt;
      this.activateScheduledWarning();
      this.secondsIntoTick += dt;
      remaining -= dt;
      if (this.secondsIntoTick >= 60 - 1e-8) {
        this.secondsIntoTick = 0;
        if (!this.hazardsEnabled) continue;
        for (const arm of Object.values(this.arms))
          this.processFloodCollapses(arm);
        for (const arm of Object.values(this.arms)) {
          const snapshot = arm.flood.snapshot;
          snapshot.exposedBuildingIds.forEach((id) => arm.exposed.add(id));
          arm.peakDepth = Math.max(
            arm.peakDepth,
            snapshot.maxWaterDepthInMeters,
          );
          arm.peakBlocked = Math.max(
            arm.peakBlocked,
            this.blockedRoadEdgeIds(arm).length,
          );
        }
        if (
          this.alarmMode === 'automatic' &&
          this.alarmTime === null &&
          Object.values(this.arms).some(
            (arm) =>
              this.blockedRoadEdgeIds(arm).length ||
              arm.flood.snapshot.exposedBuildingIds.length ||
              this.buildingImpactsOf(arm).some(
                (item) => item.condition !== 'intact',
              ),
          )
        )
          this.alarmTime = this.elapsed;
        if (this.evacuationEnabled && this.alarmTime !== null)
          for (const arm of Object.values(this.arms))
            arm.people = arm.evacuation.advance(
              0,
              this.blockedRoadEdgeIds(arm),
            );
      }
    }
    return changed;
  }
}
