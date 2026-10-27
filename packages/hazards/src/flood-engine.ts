import { DEFAULT_FLOOD_CONFIG } from './defaults.js';
import type {
  CellKind,
  FloodConfig,
  FloodMetrics,
  FloodSnapshot,
  FloodTerrainInput,
  WaterBalance,
} from './types.js';

const NEIGHBOR_OFFSETS: readonly [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export class FloodEngine {
  private readonly width: number;
  private readonly height: number;
  private readonly size: number;
  private readonly elevation: Float64Array;
  private readonly cellKinds: readonly CellKind[];
  private readonly entityIds: readonly (string | undefined)[];

  private config: FloodConfig;
  private currentWater: Float64Array;
  private nextWater: Float64Array;

  private tickCount = 0;
  private initialWaterSum = 0;
  private totalRainAdded = 0;
  private totalDrained = 0;

  constructor(
    terrain: FloodTerrainInput,
    config: Partial<FloodConfig> = {},
    initialWater?: ArrayLike<number>,
  ) {
    if (terrain.width <= 0 || terrain.height <= 0) {
      throw new Error('Grid width and height must be positive integers.');
    }
    this.width = Math.floor(terrain.width);
    this.height = Math.floor(terrain.height);
    this.size = this.width * this.height;

    if (terrain.elevation.length !== this.size) {
      throw new Error(
        `Elevation length (${terrain.elevation.length}) does not match grid size (${this.size}).`,
      );
    }

    this.elevation = new Float64Array(this.size);
    const kinds: CellKind[] = new Array<CellKind>(this.size);
    const ids: (string | undefined)[] = new Array<string | undefined>(
      this.size,
    );

    for (let i = 0; i < this.size; i++) {
      this.elevation[i] = terrain.elevation[i] ?? 0;
      kinds[i] = terrain.cellKinds?.[i] ?? 'empty';
      ids[i] = terrain.entityIds?.[i];
    }

    this.cellKinds = kinds;
    this.entityIds = ids;
    this.config = FloodEngine.sanitizeConfig({
      ...DEFAULT_FLOOD_CONFIG,
      ...config,
    });

    this.currentWater = new Float64Array(this.size);
    this.nextWater = new Float64Array(this.size);

    if (initialWater) {
      if (initialWater.length !== this.size) {
        throw new Error('initialWater length must match grid size.');
      }
      let sum = 0;
      for (let i = 0; i < this.size; i++) {
        const val = Math.max(0, initialWater[i] ?? 0);
        this.currentWater[i] = val;
        sum += val;
      }
      this.initialWaterSum = sum;
    }
  }

  private static sanitizeConfig(cfg: FloodConfig): FloodConfig {
    return {
      rainRatePerTick: Math.max(0, cfg.rainRatePerTick),
      flowTransferRatio: Math.min(1, Math.max(0, cfg.flowTransferRatio)),
      drainRatePerTick: Math.max(0, cfg.drainRatePerTick),
      roadFloodedThreshold: Math.max(0, cfg.roadFloodedThreshold),
      buildingExposedThreshold: Math.max(0, cfg.buildingExposedThreshold),
    };
  }

  public updateConfig(partial: Partial<FloodConfig>): void {
    this.config = FloodEngine.sanitizeConfig({ ...this.config, ...partial });
  }

  public getConfig(): FloodConfig {
    return { ...this.config };
  }

  /**
   * Avanza la simulación 1 tick usando actualización simultánea:
   * 1) Precalcula estado tras lluvia y drenaje en un buffer intermedio.
   * 2) Calcula el flujo saliente hacia los 4 vecinos a partir del estado previo del tick.
   * 3) Garantiza agua >= 0 y conservación exacta de masa.
   */
  public step(overrideRainRate?: number): FloodSnapshot {
    const rain =
      overrideRainRate !== undefined
        ? Math.max(0, overrideRainRate)
        : this.config.rainRatePerTick;
    const drain = this.config.drainRatePerTick;
    const transferRatio = this.config.flowTransferRatio;

    // Paso 1: Lluvia y pérdidas (drenaje) sobre el estado previo
    for (let i = 0; i < this.size; i++) {
      const prev = this.currentWater[i] ?? 0;
      const withRain = prev + rain;
      this.totalRainAdded += rain;

      const actualDrain = Math.min(withRain, drain);
      this.totalDrained += actualDrain;

      // Guardamos temporalmente en currentWater el estado pre-flujo del tick
      this.currentWater[i] = withRain - actualDrain;
      this.nextWater[i] = this.currentWater[i] ?? 0;
    }

    // Paso 2: Intercambio simultáneo con vecinos (4-conectividad)
    if (transferRatio > 0) {
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const idx = y * this.width + x;
          const waterHere = this.currentWater[idx] ?? 0;
          if (waterHere <= 0) continue;

          const elevHere = this.elevation[idx] ?? 0;
          const surfaceHere = elevHere + waterHere;

          let totalPositiveDiff = 0;
          const neighborIndices: number[] = [];
          const neighborDiffs: number[] = [];

          for (const [dx, dy] of NEIGHBOR_OFFSETS) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) {
              continue;
            }
            const nIdx = ny * this.width + nx;
            const nSurface =
              (this.elevation[nIdx] ?? 0) + (this.currentWater[nIdx] ?? 0);
            const diff = surfaceHere - nSurface;

            if (diff > 0) {
              neighborIndices.push(nIdx);
              neighborDiffs.push(diff);
              totalPositiveDiff += diff;
            }
          }

          if (totalPositiveDiff <= 0) continue;

          // El máximo que puede salir nunca supera el agua disponible ni el punto de equilibrio
          const maxEquilibriumOutflow =
            totalPositiveDiff / (neighborIndices.length + 1);
          const totalOutflow = Math.min(
            waterHere,
            maxEquilibriumOutflow * transferRatio,
          );

          if (totalOutflow <= 0) continue;

          this.nextWater[idx] = (this.nextWater[idx] ?? 0) - totalOutflow;

          for (let k = 0; k < neighborIndices.length; k++) {
            const nIdx = neighborIndices[k]!;
            const diff = neighborDiffs[k]!;
            const share = totalOutflow * (diff / totalPositiveDiff);
            this.nextWater[nIdx] = (this.nextWater[nIdx] ?? 0) + share;
          }
        }
      }
    }

    // Paso 3: Clamp de seguridad contra ruido de punto flotante (< 0) y swap de buffers
    for (let i = 0; i < this.size; i++) {
      const val = this.nextWater[i] ?? 0;
      this.currentWater[i] = val < 1e-15 ? 0 : val;
    }

    this.tickCount += 1;
    return this.getSnapshot();
  }

  public getSnapshot(): FloodSnapshot {
    const waterDepth = new Float32Array(this.size);
    const floodedRoadMask = new Uint8Array(this.size);
    const exposedBuildingMask = new Uint8Array(this.size);
    const floodedRoadIds: string[] = [];
    const exposedBuildingIds: string[] = [];

    let currentTotalWater = 0;
    let maxWaterDepth = 0;
    let floodedRoadCellsCount = 0;
    let exposedBuildingCellsCount = 0;

    for (let i = 0; i < this.size; i++) {
      const w = this.currentWater[i] ?? 0;
      waterDepth[i] = w;
      currentTotalWater += w;
      if (w > maxWaterDepth) {
        maxWaterDepth = w;
      }

      const kind = this.cellKinds[i] ?? 'empty';
      const entityId = this.entityIds[i];

      if (kind === 'road' && w >= this.config.roadFloodedThreshold) {
        floodedRoadMask[i] = 1;
        floodedRoadCellsCount += 1;
        if (entityId !== undefined) {
          floodedRoadIds.push(entityId);
        }
      } else if (
        kind === 'building' &&
        w >= this.config.buildingExposedThreshold
      ) {
        exposedBuildingMask[i] = 1;
        exposedBuildingCellsCount += 1;
        if (entityId !== undefined) {
          exposedBuildingIds.push(entityId);
        }
      }
    }

    const expectedWater =
      this.initialWaterSum + this.totalRainAdded - this.totalDrained;
    const balance: WaterBalance = {
      initialWater: this.initialWaterSum,
      totalRainAdded: this.totalRainAdded,
      totalDrained: this.totalDrained,
      currentTotalWater,
      massBalanceError: Math.abs(expectedWater - currentTotalWater),
    };

    const metrics: FloodMetrics = {
      tick: this.tickCount,
      maxWaterDepth,
      meanWaterDepth: this.size > 0 ? currentTotalWater / this.size : 0,
      floodedRoadCellsCount,
      exposedBuildingCellsCount,
      balance,
    };

    return {
      tick: this.tickCount,
      width: this.width,
      height: this.height,
      waterDepth,
      floodedRoadMask,
      exposedBuildingMask,
      floodedRoadIds,
      exposedBuildingIds,
      metrics,
    };
  }
}
