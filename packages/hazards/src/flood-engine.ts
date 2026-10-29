import { DEFAULT_FLOOD_CONFIG } from './defaults';
import type {
  AffectedRoadEdge,
  Building,
  CellBounds,
  CityScenarioInput,
  ExposedBuildingStatus,
  FloodConfig,
  FloodPulse,
  FloodSnapshot,
  RoadEdge,
  RoadNode,
  WaterBalance,
} from './types.js';

const NEIGHBOR_OFFSETS: readonly [number, number][] = [
  [-1, 0], // sur (row - 1)
  [1, 0], // norte (row + 1)
  [0, -1], // oeste (col - 1)
  [0, 1], // este (col + 1)
];

interface MappedEdge {
  readonly edge: RoadEdge;
  readonly cellIndices: readonly number[];
}

interface MappedBuilding {
  readonly building: Building;
  readonly cellIndices: readonly number[];
}

export class FloodEngine {
  private readonly rows: number;
  private readonly columns: number;
  private readonly cellCount: number;
  private readonly xCoords: readonly number[];
  private readonly yCoords: readonly number[];
  private readonly cells: readonly CellBounds[];
  private readonly mappedEdges: readonly MappedEdge[];
  private readonly mappedBuildings: readonly MappedBuilding[];

  private config: FloodConfig;
  private effectiveGroundElevation: Float64Array;
  private currentWaterDepth: Float64Array;
  private nextWaterDepth: Float64Array;

  private tickCount = 0;
  private elapsedTimeInSeconds = 0;
  private initialVolumeInCubicMeters = 0;
  private totalRainVolumeInCubicMeters = 0;
  private totalDrainedVolumeInCubicMeters = 0;

  constructor(
    scenario: CityScenarioInput,
    config: Partial<FloodConfig> = {},
    initialPulses: readonly FloodPulse[] = [],
  ) {
    const { xCoordinates, yCoordinates, elevationsInMeters } =
      scenario.terrainGrid;

    if (xCoordinates.length < 2 || yCoordinates.length < 2) {
      throw new Error(
        'terrainGrid must contain at least 2 xCoordinates and 2 yCoordinates to form cells.',
      );
    }

    this.columns = xCoordinates.length - 1;
    this.rows = yCoordinates.length - 1;
    this.cellCount = this.rows * this.columns;
    this.xCoords = [...xCoordinates];
    this.yCoords = [...yCoordinates];

    this.config = FloodEngine.sanitizeConfig({
      ...DEFAULT_FLOOD_CONFIG,
      ...config,
    });

    // Construimos las celdas (rows x columns) promediando las 4 muestras esquina de cada celda
    const cells: CellBounds[] = new Array<CellBounds>(this.cellCount);
    for (let r = 0; r < this.rows; r++) {
      const minY = this.yCoords[r] ?? 0;
      const maxY = this.yCoords[r + 1] ?? minY;
      const dy = Math.max(1e-6, maxY - minY);

      const rowElev0 = elevationsInMeters[r];
      const rowElev1 = elevationsInMeters[r + 1];

      for (let c = 0; c < this.columns; c++) {
        const minX = this.xCoords[c] ?? 0;
        const maxX = this.xCoords[c + 1] ?? minX;
        const dx = Math.max(1e-6, maxX - minX);

        const z00 = rowElev0?.[c] ?? scenario.terrain.elevationInMeters;
        const z01 = rowElev0?.[c + 1] ?? scenario.terrain.elevationInMeters;
        const z10 = rowElev1?.[c] ?? scenario.terrain.elevationInMeters;
        const z11 = rowElev1?.[c + 1] ?? scenario.terrain.elevationInMeters;
        const groundElevationInMeters = (z00 + z01 + z10 + z11) * 0.25;

        const idx = r * this.columns + c;
        cells[idx] = {
          row: r,
          column: c,
          minX,
          maxX,
          minY,
          maxY,
          areaInSqMeters: dx * dy,
          groundElevationInMeters,
        };
      }
    }
    this.cells = cells;

    this.effectiveGroundElevation = this.computeEffectiveElevation();
    this.currentWaterDepth = new Float64Array(this.cellCount);
    this.nextWaterDepth = new Float64Array(this.cellCount);

    // Pre-asociamos cada tramo (edge.id) y cada edificio (building.id) con las celdas que intersecta
    this.mappedEdges = this.mapRoadEdgesToCells(scenario.roadGraph);
    this.mappedBuildings = this.mapBuildingsToCells(scenario.buildings);

    // Aplicamos pulsos iniciales de agua si se configuraron
    let initialVol = 0;
    for (const pulse of initialPulses) {
      if (
        pulse.row >= 0 &&
        pulse.row < this.rows &&
        pulse.column >= 0 &&
        pulse.column < this.columns &&
        pulse.depthInMeters > 0
      ) {
        const idx = pulse.row * this.columns + pulse.column;
        const cell = this.cells[idx]!;
        this.currentWaterDepth[idx] =
          (this.currentWaterDepth[idx] ?? 0) + pulse.depthInMeters;
        initialVol += pulse.depthInMeters * cell.areaInSqMeters;
      }
    }
    this.initialVolumeInCubicMeters = initialVol;
  }

  private static sanitizeConfig(cfg: FloodConfig): FloodConfig {
    return {
      timeStepInSeconds: Math.max(1, cfg.timeStepInSeconds),
      rainIntensityMmPerHour: Math.max(0, cfg.rainIntensityMmPerHour),
      drainRateMmPerHour: Math.max(0, cfg.drainRateMmPerHour),
      flowTransferRatio: Math.min(1, Math.max(0, cfg.flowTransferRatio)),
      roadFloodedThresholdInMeters: Math.max(
        0,
        cfg.roadFloodedThresholdInMeters,
      ),
      buildingExposedThresholdInMeters: Math.max(
        0,
        cfg.buildingExposedThresholdInMeters,
      ),
      syntheticRelief: cfg.syntheticRelief,
      syntheticReliefAmplitudeInMeters: Math.max(
        0,
        cfg.syntheticReliefAmplitudeInMeters,
      ),
    };
  }

  private computeEffectiveElevation(): Float64Array {
    const out = new Float64Array(this.cellCount);
    const maxX = this.xCoords[this.xCoords.length - 1] ?? 1;
    const maxY = this.yCoords[this.yCoords.length - 1] ?? 1;
    const centerX = maxX * 0.5;
    const centerY = maxY * 0.5;
    const maxRadius = Math.hypot(centerX, centerY) || 1;

    for (let i = 0; i < this.cellCount; i++) {
      const cell = this.cells[i]!;
      let reliefOffset = 0;

      if (
        this.config.syntheticRelief !== 'none' &&
        this.config.syntheticReliefAmplitudeInMeters > 0
      ) {
        const midX = (cell.minX + cell.maxX) * 0.5;
        const midY = (cell.minY + cell.maxY) * 0.5;

        if (this.config.syntheticRelief === 'central-basin') {
          const dist = Math.hypot(midX - centerX, midY - centerY);
          reliefOffset =
            (dist / maxRadius) * this.config.syntheticReliefAmplitudeInMeters;
        } else if (this.config.syntheticRelief === 'west-to-east-slope') {
          reliefOffset =
            ((maxX - midX) / (maxX || 1)) *
            this.config.syntheticReliefAmplitudeInMeters;
        }
      }

      out[i] = cell.groundElevationInMeters + reliefOffset;
    }
    return out;
  }

  private findCellIndexAtPoint(x: number, y: number): number {
    // Buscamos la columna y fila donde cae (x, y)
    let col = 0;
    for (let c = 0; c < this.columns; c++) {
      const x0 = this.xCoords[c] ?? 0;
      const x1 = this.xCoords[c + 1] ?? x0;
      if (x >= x0 && x <= x1) {
        col = c;
        break;
      }
      if (x > x1) col = c;
    }

    let row = 0;
    for (let r = 0; r < this.rows; r++) {
      const y0 = this.yCoords[r] ?? 0;
      const y1 = this.yCoords[r + 1] ?? y0;
      if (y >= y0 && y <= y1) {
        row = r;
        break;
      }
      if (y > y1) row = r;
    }

    return row * this.columns + col;
  }

  private mapRoadEdgesToCells(roadGraph: {
    readonly nodes: readonly RoadNode[];
    readonly edges: readonly RoadEdge[];
  }): MappedEdge[] {
    const nodesById = new Map<string, RoadNode>(
      roadGraph.nodes.map((node) => [node.id, node]),
    );

    return roadGraph.edges.map((edge) => {
      const start = nodesById.get(edge.from);
      const end = nodesById.get(edge.to);
      if (!start || !end) {
        return { edge, cellIndices: [] };
      }

      const dist = Math.hypot(end.x - start.x, end.y - start.y);
      const steps = Math.max(2, Math.ceil(dist / 5)); // Muestreo cada <= 5 metros
      const uniqueIndices = new Set<number>();

      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = start.x + (end.x - start.x) * t;
        const py = start.y + (end.y - start.y) * t;
        uniqueIndices.add(this.findCellIndexAtPoint(px, py));
      }

      return { edge, cellIndices: [...uniqueIndices] };
    });
  }

  private mapBuildingsToCells(
    buildings: readonly Building[],
  ): MappedBuilding[] {
    return buildings.map((building) => {
      const indices: number[] = [];
      for (let i = 0; i < this.cellCount; i++) {
        const cell = this.cells[i]!;
        const overlapsX =
          building.minCorner.x <= cell.maxX &&
          building.maxCorner.x >= cell.minX;
        const overlapsY =
          building.minCorner.y <= cell.maxY &&
          building.maxCorner.y >= cell.minY;
        if (overlapsX && overlapsY) {
          indices.push(i);
        }
      }

      if (indices.length === 0) {
        const centerX = (building.minCorner.x + building.maxCorner.x) * 0.5;
        const centerY = (building.minCorner.y + building.maxCorner.y) * 0.5;
        indices.push(this.findCellIndexAtPoint(centerX, centerY));
      }

      return { building, cellIndices: indices };
    });
  }

  public getCells(): readonly CellBounds[] {
    return this.cells;
  }

  /**
   * Avanza la simulación un tick de forma simultánea a partir del estado previo:
   * 1) Aplica lluvia y pérdidas (drenaje) convirtiendo mm/h a metros por tick.
   * 2) Intercambia volumen (m³) con los 4 vecinos ortogonales según desnivel de superficie libre (z + w),
   *    garantizando conservación exacta de masa incluso con celdas de distinto tamaño.
   */
  public step(): FloodSnapshot {
    const dtHours = this.config.timeStepInSeconds / 3600;
    const rainDepthMeters =
      (this.config.rainIntensityMmPerHour / 1000) * dtHours;
    const drainDepthMeters = (this.config.drainRateMmPerHour / 1000) * dtHours;
    const transferRatio = this.config.flowTransferRatio;

    // 1. Lluvia y drenaje sobre el estado previo
    for (let i = 0; i < this.cellCount; i++) {
      const cell = this.cells[i]!;
      const prevDepth = this.currentWaterDepth[i] ?? 0;
      const withRain = prevDepth + rainDepthMeters;
      this.totalRainVolumeInCubicMeters +=
        rainDepthMeters * cell.areaInSqMeters;

      const actualDrain = Math.min(withRain, drainDepthMeters);
      this.totalDrainedVolumeInCubicMeters += actualDrain * cell.areaInSqMeters;

      const postSourceDepth = withRain - actualDrain;
      this.currentWaterDepth[i] = postSourceDepth;
      this.nextWaterDepth[i] = postSourceDepth;
    }

    // 2. Intercambio simultáneo de volumen (m³) entre celdas vecinas
    if (transferRatio > 0) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.columns; c++) {
          const idx = r * this.columns + c;
          const depthHere = this.currentWaterDepth[idx] ?? 0;
          if (depthHere <= 0) continue;

          const cellHere = this.cells[idx]!;
          const surfaceHere =
            (this.effectiveGroundElevation[idx] ?? 0) + depthHere;

          let totalPositiveDiff = 0;
          const neighborIndices: number[] = [];
          const neighborDiffs: number[] = [];

          for (const [dr, dc] of NEIGHBOR_OFFSETS) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.columns) {
              continue;
            }
            const nIdx = nr * this.columns + nc;
            const nSurface =
              (this.effectiveGroundElevation[nIdx] ?? 0) +
              (this.currentWaterDepth[nIdx] ?? 0);
            const diff = surfaceHere - nSurface;

            if (diff > 0) {
              neighborIndices.push(nIdx);
              neighborDiffs.push(diff);
              totalPositiveDiff += diff;
            }
          }

          if (totalPositiveDiff <= 0) continue;

          const maxEquilibriumDepthOut =
            totalPositiveDiff / (neighborIndices.length + 1);
          const depthOutflow = Math.min(
            depthHere,
            maxEquilibriumDepthOut * transferRatio,
          );
          if (depthOutflow <= 0) continue;

          const volumeOutflow = depthOutflow * cellHere.areaInSqMeters;
          this.nextWaterDepth[idx] =
            (this.nextWaterDepth[idx] ?? 0) - depthOutflow;

          for (let k = 0; k < neighborIndices.length; k++) {
            const nIdx = neighborIndices[k]!;
            const diff = neighborDiffs[k]!;
            const neighborCell = this.cells[nIdx]!;
            const sharedVolume = volumeOutflow * (diff / totalPositiveDiff);
            // Convertimos el volumen recibido en incremento de lámina según el área del vecino
            this.nextWaterDepth[nIdx] =
              (this.nextWaterDepth[nIdx] ?? 0) +
              sharedVolume / neighborCell.areaInSqMeters;
          }
        }
      }
    }

    // 3. Clamp numérico de agua no negativa y actualización del estado
    for (let i = 0; i < this.cellCount; i++) {
      const d = this.nextWaterDepth[i] ?? 0;
      this.currentWaterDepth[i] = d < 1e-15 ? 0 : d;
    }

    this.tickCount += 1;
    this.elapsedTimeInSeconds += this.config.timeStepInSeconds;

    return this.getSnapshot();
  }

  public getSnapshot(): FloodSnapshot {
    const waterDepthInMeters = new Float32Array(this.cellCount);
    let currentVolumeInCubicMeters = 0;
    let maxWaterDepthInMeters = 0;
    let sumDepth = 0;

    for (let i = 0; i < this.cellCount; i++) {
      const d = this.currentWaterDepth[i] ?? 0;
      const area = this.cells[i]!.areaInSqMeters;
      waterDepthInMeters[i] = d;
      currentVolumeInCubicMeters += d * area;
      sumDepth += d;
      if (d > maxWaterDepthInMeters) {
        maxWaterDepthInMeters = d;
      }
    }

    // Evaluación de tramos viales por edge.id
    const blockedRoadEdgeIds: string[] = [];
    const roadEdges: AffectedRoadEdge[] = this.mappedEdges.map(
      ({ edge, cellIndices }) => {
        let maxD = 0;
        let sumD = 0;
        for (const cIdx of cellIndices) {
          const d = this.currentWaterDepth[cIdx] ?? 0;
          if (d > maxD) maxD = d;
          sumD += d;
        }
        const meanD = cellIndices.length > 0 ? sumD / cellIndices.length : 0;
        const blocked = maxD >= this.config.roadFloodedThresholdInMeters;
        if (blocked) {
          blockedRoadEdgeIds.push(edge.id);
        }
        return {
          edgeId: edge.id,
          roadId: edge.roadId,
          maxWaterDepthInMeters: maxD,
          meanWaterDepthInMeters: meanD,
          blocked,
        };
      },
    );

    // Evaluación de exposición de edificios por building.id
    const exposedBuildingIds: string[] = [];
    const buildings: ExposedBuildingStatus[] = this.mappedBuildings.map(
      ({ building, cellIndices }) => {
        let maxD = 0;
        let sumD = 0;
        for (const cIdx of cellIndices) {
          const d = this.currentWaterDepth[cIdx] ?? 0;
          if (d > maxD) maxD = d;
          sumD += d;
        }
        const meanD = cellIndices.length > 0 ? sumD / cellIndices.length : 0;
        const exposed = maxD >= this.config.buildingExposedThresholdInMeters;
        if (exposed) {
          exposedBuildingIds.push(building.id);
        }
        return {
          buildingId: building.id,
          maxWaterDepthInMeters: maxD,
          meanWaterDepthInMeters: meanD,
          exposed,
        };
      },
    );

    const expectedVolume =
      this.initialVolumeInCubicMeters +
      this.totalRainVolumeInCubicMeters -
      this.totalDrainedVolumeInCubicMeters;

    const balance: WaterBalance = {
      initialVolumeInCubicMeters: this.initialVolumeInCubicMeters,
      totalRainVolumeInCubicMeters: this.totalRainVolumeInCubicMeters,
      totalDrainedVolumeInCubicMeters: this.totalDrainedVolumeInCubicMeters,
      currentVolumeInCubicMeters,
      volumeBalanceErrorInCubicMeters: Math.abs(
        expectedVolume - currentVolumeInCubicMeters,
      ),
    };

    return {
      tick: this.tickCount,
      elapsedTimeInSeconds: this.elapsedTimeInSeconds,
      rows: this.rows,
      columns: this.columns,
      waterDepthInMeters,
      roadEdges,
      blockedRoadEdgeIds,
      buildings,
      exposedBuildingIds,
      maxWaterDepthInMeters,
      meanWaterDepthInMeters:
        this.cellCount > 0 ? sumDepth / this.cellCount : 0,
      balance,
    };
  }
}
