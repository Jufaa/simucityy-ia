// Contratos base compatibles estructuralmente con apps/backend/src/modules/cities/city.types.ts
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Building {
  readonly id: string;
  readonly minCorner: Point;
  readonly maxCorner: Point;
  readonly heightInMeters: number;
}

export interface RoadNode extends Point {
  readonly id: string;
}

export interface RoadEdge {
  readonly id: string;
  readonly roadId: string;
  readonly from: string;
  readonly to: string;
  readonly lengthInMeters: number;
  readonly bidirectional: boolean;
}

export interface RoadGraph {
  readonly nodes: readonly RoadNode[];
  readonly edges: readonly RoadEdge[];
}

export interface TerrainGrid {
  readonly xCoordinates: readonly number[];
  readonly yCoordinates: readonly number[];
  readonly elevationsInMeters: readonly (readonly number[])[];
  readonly source?: string;
}

export interface TerrainConfig {
  readonly kind: string;
  readonly elevationInMeters: number;
}

/**
 * Subconjunto estructural de CityScenario requerido por el motor de inundación.
 * Acepta directamente cualquier objeto CityScenario validado por parseCityScenario,
 * sin mutarlo en ningún momento.
 */
export interface CityScenarioInput {
  readonly terrain: TerrainConfig;
  readonly terrainGrid: TerrainGrid;
  readonly roadGraph: RoadGraph;
  readonly buildings: readonly Building[];
}

export type SyntheticReliefMode =
  'none' | 'central-basin' | 'west-to-east-slope';

export interface FloodPulse {
  readonly row: number;
  readonly column: number;
  readonly depthInMeters: number;
}

/** Optional local environment; omitted preserves legacy behavior. */
export interface FloodEnvironment {
  /** Absolute deck elevation by existing road edge ID; affects road exposure only. */
  readonly roadDeckElevationsInMeters?: Readonly<Record<string, number>>;
  /** Static absolute water surface by cell index; not added to solver volume. */
  readonly permanentWaterSurfaceElevationsInMeters?: Readonly<
    Record<number, number>
  >;
  readonly blockedCellIndices?: readonly number[];
  readonly additionalDrainRatesMmPerHour?: readonly number[];
}

export interface FloodConfig {
  /** Duración de cada tick de simulación en segundos */
  readonly timeStepInSeconds: number;
  /** Intensidad de lluvia en milímetros por hora (mm/h) o equivalente por segundo */
  readonly rainIntensityMmPerHour: number;
  /** Pérdida por drenaje/infiltración en milímetros por hora (mm/h) */
  readonly drainRateMmPerHour: number;
  /** Coeficiente de transferencia lateral entre celdas vecinas por tick (0 a 1) */
  readonly flowTransferRatio: number;
  /** Umbral de profundidad (m) a partir del cual un tramo (edge.id) no es transitable */
  readonly roadFloodedThresholdInMeters: number;
  /** Umbral de profundidad (m) a partir del cual un edificio (building.id) se considera expuesto */
  readonly buildingExposedThresholdInMeters: number;
  /**
   * Relieve sintético opcional superpuesto en el motor cuando el terreno de demo es plano (0m),
   * sin alterar CityScenario.
   */
  readonly syntheticRelief: SyntheticReliefMode;
  /** Amplitud máxima en metros del relieve sintético cuando syntheticRelief !== 'none' */
  readonly syntheticReliefAmplitudeInMeters: number;
}

export interface CellBounds {
  readonly row: number;
  readonly column: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly areaInSqMeters: number;
  readonly groundElevationInMeters: number;
}

export interface AffectedRoadEdge {
  readonly edgeId: string;
  readonly roadId: string;
  readonly maxWaterDepthInMeters: number;
  readonly meanWaterDepthInMeters: number;
  readonly blocked: boolean;
}

export interface ExposedBuildingStatus {
  readonly buildingId: string;
  readonly maxWaterDepthInMeters: number;
  readonly meanWaterDepthInMeters: number;
  readonly exposed: boolean;
}

export interface WaterBalance {
  readonly initialVolumeInCubicMeters: number;
  readonly totalRainVolumeInCubicMeters: number;
  readonly totalDrainedVolumeInCubicMeters: number;
  readonly currentVolumeInCubicMeters: number;
  /** Error absoluto de conservación de volumen (m³): |initial + rain - drained - current| */
  readonly volumeBalanceErrorInCubicMeters: number;
}

export interface FloodState {
  readonly tick: number;
  readonly elapsedTimeInSeconds: number;
  readonly rows: number;
  readonly columns: number;
  /** Profundidad de agua en metros por celda [row * columns + column] */
  readonly waterDepthInMeters: Float32Array;
  /** Estado de todos los tramos del grafo vial (identificados por edge.id) */
  readonly roadEdges: readonly AffectedRoadEdge[];
  /** Lista rápida de IDs de tramos bloqueados/inundados (waterDepth >= roadFloodedThresholdInMeters) */
  readonly blockedRoadEdgeIds: readonly string[];
  /** Estado de todos los edificios del escenario (identificados por building.id) */
  readonly buildings: readonly ExposedBuildingStatus[];
  /** Lista rápida de IDs de edificios expuestos (waterDepth >= buildingExposedThresholdInMeters) */
  readonly exposedBuildingIds: readonly string[];
  readonly maxWaterDepthInMeters: number;
  readonly meanWaterDepthInMeters: number;
  readonly balance: WaterBalance;
}

/** Alias compacto para transmisión a Worker / UI / Módulo C (Evacuación) */
export type FloodSnapshot = FloodState;
