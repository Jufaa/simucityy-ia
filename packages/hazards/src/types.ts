export type CellKind = 'empty' | 'road' | 'building';

export interface FloodTerrainInput {
  readonly width: number;
  readonly height: number;
  /** Elevación del terreno por celda (largo = width * height, orden row-major: y * width + x) */
  readonly elevation: ArrayLike<number>;
  /** Tipo de celda opcional o IDs asociados para cruzar con el mapa de A */
  readonly cellKinds?: ArrayLike<CellKind> | undefined;
  readonly entityIds?: ArrayLike<string | undefined> | undefined;
}

export interface FloodConfig {
  /** Metros/unidades de agua agregados por celda en cada tick */
  readonly rainRatePerTick: number;
  /** Fracción de la diferencia de nivel transferida a los vecinos por tick (0 a 1) */
  readonly flowTransferRatio: number;
  /** Pérdida/absorción/drenaje de agua por celda en cada tick (>= 0) */
  readonly drainRatePerTick: number;
  /** Umbral de agua (m) a partir del cual una calle (road) se considera inundada */
  readonly roadFloodedThreshold: number;
  /** Umbral de agua (m) a partir del cual un edificio (building) se considera expuesto */
  readonly buildingExposedThreshold: number;
}

export interface WaterBalance {
  readonly initialWater: number;
  readonly totalRainAdded: number;
  readonly totalDrained: number;
  readonly currentTotalWater: number;
  /** Desviación numérica: debería ser ~0 (initial + rain - drained - current) */
  readonly massBalanceError: number;
}

export interface FloodMetrics {
  readonly tick: number;
  readonly maxWaterDepth: number;
  readonly meanWaterDepth: number;
  readonly floodedRoadCellsCount: number;
  readonly exposedBuildingCellsCount: number;
  readonly balance: WaterBalance;
}

export interface FloodSnapshot {
  readonly tick: number;
  readonly width: number;
  readonly height: number;
  /** Copia inmutable/compacta de la profundidad de agua por celda para Worker/UI */
  readonly waterDepth: Float32Array;
  /** 1 si la vía en esa celda supera roadFloodedThreshold, 0 si es transitable */
  readonly floodedRoadMask: Uint8Array;
  /** 1 si el edificio en esa celda supera buildingExposedThreshold, 0 si no */
  readonly exposedBuildingMask: Uint8Array;
  /** Lista de IDs de vías inundadas (si se proveyeron entityIds) */
  readonly floodedRoadIds: readonly string[];
  /** Lista de IDs de edificios expuestos (si se proveyeron entityIds) */
  readonly exposedBuildingIds: readonly string[];
  readonly metrics: FloodMetrics;
}
