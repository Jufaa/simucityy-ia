import {
  assessStructuralDamage,
  buildingImpactAt,
  floodCollapseDepthInMeters,
  floodImpactLoadInMeters,
  createFloodEnvironment,
  EvacuationEngine,
  hazardPreset,
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

export type ComparisonArm = 'before' | 'after';
export interface DistrictSimulationOptions {
  evacuationEnabled?: boolean;
  alarmMode?: 'automatic' | 'manual';
  autoStart?: boolean;
  hazard?: HazardKind;
}
interface Arm {
  flood: FloodSimulation;
  evacuation: EvacuationEngine;
  people: EvacuationSnapshot;
  exposed: Set<string>;
  peakDepth: number;
  peakBlocked: number;
  structural: StructuralAssessment;
  /** Edificio -> segundo simulado de su derrumbe (estructural o por agua). */
  collapsedAt: Map<string, number>;
  collapseSeverity: Map<string, number>;
  /** Daño acumulado por agua (0-1): el derrumbe llega por duración, no al instante. */
  floodDamage: Map<string, number>;
  blockedCache: { collapsedCount: number; roadIds: string[] };
}

/** Matched local experiments; all arms advance on one synchronous simulation timeline. */
export class DistrictSimulation {
  private arms: Record<ComparisonArm, Arm>;
  private selected: ComparisonArm = 'before';
  private secondsIntoTick = 0;
  private elapsed = 0;
  private speed = 300;
  readonly drains: readonly FloodDrain[];
  readonly hazard: HazardKind;
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
    const flood = new FloodSimulation(this.input, environment, this.hazard);
    const structural = assessStructuralDamage(this.input, this.hazard, {
      seed: this.city.config.seed ?? 123,
      reinforced: improved,
    });
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
      return { ...citizen, reactionDelayInSeconds: delay };
    });
    const evacuation = new EvacuationEngine({
      roadGraph: this.input.roadGraph,
      citizens,
      shelters,
    });
    return {
      flood,
      evacuation,
      people: evacuation.getSnapshot(),
      exposed: new Set(),
      peakDepth: 0,
      peakBlocked: 0,
      structural,
      collapsedAt: new Map(),
      collapseSeverity: new Map(),
      floodDamage: new Map(),
      blockedCache: { collapsedCount: -1, roadIds: [] },
    };
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
      const status = floodByBuilding.get(building.id);
      const depth = status?.maxWaterDepthInMeters ?? 0;
      const threshold = floodCollapseDepthInMeters(
        building,
        this.hazard,
        this.city.config.seed ?? 123,
      );
      const load = floodImpactLoadInMeters(
        depth,
        this.hazard,
        status?.maxFlowSpeedInMetersPerSecond ?? 0,
      );
      const damage = arm.floodDamage.get(building.id) ?? 0;
      return {
        buildingId: building.id,
        condition:
          depth >= 0.2 || damage > 0.12
            ? ('damaged' as const)
            : ('intact' as const),
        severity: Math.min(0.59, Math.max(load / threshold, damage)),
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
      this.alarmMode === 'automatic' &&
      this.alarmTime === null &&
      this.hazard === 'earthquake' &&
      Object.values(this.arms).some(
        (arm) => arm.structural.damagedBuildingIds.length > 0,
      )
    )
      this.alarmTime = 0;
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

  /**
   * Derrumbes por agua con daño progresivo: cada minuto de evaluación la
   * carga (profundidad + altura de velocidad) por encima del 55 % de la
   * resistencia acumula daño; al llegar a 1 el edificio cae. Un golpe con
   * el doble de la resistencia derrumba al instante. El daño no se cura
   * cuando el agua baja.
   */
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
        status.maxFlowSpeedInMetersPerSecond ?? 0,
      );
      const ratio = load / threshold;
      if (ratio <= 0.55) continue;
      const damage =
        (arm.floodDamage.get(status.buildingId) ?? 0) +
        (ratio >= 2 ? 1 : (ratio - 0.55) * (60 / 240));
      arm.floodDamage.set(status.buildingId, damage);
      if (damage < 1) continue;
      arm.collapsedAt.set(status.buildingId, this.elapsed);
      arm.collapseSeverity.set(
        status.buildingId,
        Math.min(1, Math.max(0.6, ratio)),
      );
      if (this.evacuationEnabled)
        arm.evacuation.trapCitizensInBuildings([status.buildingId]);
    }
    if (this.evacuationEnabled) arm.people = arm.evacuation.getSnapshot();
  }

  /**
   * Personas alcanzadas por la corriente: con lámina y velocidad cuyo
   * producto supera el límite de estabilidad (más bajo si la movilidad es
   * reducida), o con agua por encima de 1,1 m, quedan incapacitadas donde
   * estén — en casa, en el conector o en mitad de la calle.
   */
  private processCitizenWaterExposure(arm: Arm) {
    if (!this.evacuationEnabled) return;
    const snapshot = arm.flood.snapshot;
    const grid = this.city.terrainGrid;
    if (!grid) return;
    const locate = (axis: readonly number[], value: number) => {
      const next = axis.findIndex((x, i) => i > 0 && x > value);
      return next < 0 ? axis.length - 2 : Math.max(0, next - 1);
    };
    const mobilityById = new Map(
      (this.city.citizens ?? []).map((citizen) => [
        citizen.id,
        citizen.mobilityFactor,
      ]),
    );
    const swept: string[] = [];
    for (const citizen of arm.people.citizens) {
      if (citizen.status === 'evacuated' || citizen.status === 'trapped')
        continue;
      const column = locate(grid.xCoordinates, citizen.position.x);
      const row = locate(grid.yCoordinates, citizen.position.y);
      const index = row * snapshot.columns + column;
      const depth = snapshot.waterDepthInMeters[index] ?? 0;
      if (depth < 0.35) continue;
      const speed = snapshot.flowSpeedInMetersPerSecond?.[index] ?? 0;
      const stabilityLimit = 0.3 + 0.45 * (mobilityById.get(citizen.id) ?? 1);
      if (depth >= 1.1 || depth * speed >= stabilityLimit)
        swept.push(citizen.id);
    }
    if (swept.length) {
      arm.evacuation.sweepCitizens(swept);
      arm.people = arm.evacuation.getSnapshot();
    }
  }
  pause() {
    this.running = false;
    for (const arm of Object.values(this.arms)) arm.flood.pause();
  }
  triggerAlarm() {
    if (!this.evacuationEnabled || this.alarmTime !== null) return;
    this.alarmTime = this.elapsed;
    for (const arm of Object.values(this.arms))
      arm.people = arm.evacuation.advance(0, this.blockedRoadEdgeIds(arm));
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
      for (const arm of Object.values(this.arms))
        this.processStructuralCollapses(arm);
      let dt = Math.min(remaining, 60 - this.secondsIntoTick);
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
        if (this.evacuationEnabled && this.alarmTime !== null)
          arm.people = arm.evacuation.advance(dt, this.blockedRoadEdgeIds(arm));
        changed = arm.flood.advance(dt / 300) || changed;
      }
      this.elapsed += dt;
      this.secondsIntoTick += dt;
      remaining -= dt;
      if (this.secondsIntoTick >= 60 - 1e-8) {
        this.secondsIntoTick = 0;
        for (const arm of Object.values(this.arms)) {
          this.processFloodCollapses(arm);
          this.processCitizenWaterExposure(arm);
        }
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
