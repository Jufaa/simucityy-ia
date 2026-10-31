import { DEFAULT_FLOOD_CONFIG } from './defaults';
import type {
  AffectedRoadEdge,
  Building,
  CellBounds,
  CityScenarioInput,
  ExposedBuildingStatus,
  FloodConfig,
  FloodEnvironment,
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

/**
 * Flujo a 8 vecinos con peso 1/√2 en diagonal: con solo 4 vecinos las
 * esquinas de los edificios (celdas bloqueadas) sellan calles diagonales y
 * el frente se atasca en la primera manzana. La masa se conserva igual
 * porque las fracciones repartidas siempre suman el volumen total saliente.
 */
const FLOW_OFFSETS: readonly { dr: number; dc: number; weight: number }[] = [
  { dr: -1, dc: 0, weight: 1 },
  { dr: 1, dc: 0, weight: 1 },
  { dr: 0, dc: -1, weight: 1 },
  { dr: 0, dc: 1, weight: 1 },
  { dr: -1, dc: -1, weight: Math.SQRT1_2 },
  { dr: -1, dc: 1, weight: Math.SQRT1_2 },
  { dr: 1, dc: -1, weight: Math.SQRT1_2 },
  { dr: 1, dc: 1, weight: Math.SQRT1_2 },
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

  private readonly roadDeckElevations: ReadonlyMap<string, number>;
  private readonly permanentWaterSurfaces: ReadonlyMap<number, number>;
  private readonly blockedCells: ReadonlySet<number>;
  private readonly additionalDrainRates: readonly number[];
  private readonly sustainedInflow: {
    readonly cellIndices: readonly number[];
    readonly rateInMetersPerSecond: number;
    readonly durationInSeconds: number;
  } | null;

  private config: FloodConfig;
  private effectiveGroundElevation: Float64Array;
  private currentWaterDepth: Float64Array;
  private nextWaterDepth: Float64Array;

  private tickCount = 0;
  private elapsedTimeInSeconds = 0;
  private initialVolumeInCubicMeters = 0;
  private totalRainVolumeInCubicMeters = 0;
  private totalDrainedVolumeInCubicMeters = 0;
  private totalInflowVolumeInCubicMeters = 0;

  constructor(
    scenario: CityScenarioInput,
    config: Partial<FloodConfig> = {},
    initialPulses: readonly FloodPulse[] = [],
    environment: FloodEnvironment = {},
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
    const knownEdgeIds = new Set(
      scenario.roadGraph.edges.map((edge) => edge.id),
    );
    const decks = new Map<string, number>();
    for (const [edgeId, elevation] of Object.entries(
      environment.roadDeckElevationsInMeters ?? {},
    )) {
      if (!knownEdgeIds.has(edgeId) || !Number.isFinite(elevation)) {
        throw new RangeError(
          'Road deck elevations must be finite and reference existing edge IDs.',
        );
      }
      decks.set(edgeId, elevation);
    }
    const surfaces = new Map<number, number>();
    for (const [key, elevation] of Object.entries(
      environment.permanentWaterSurfaceElevationsInMeters ?? {},
    )) {
      const index = Number(key);
      if (
        key.trim() === '' ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= this.cellCount ||
        !Number.isFinite(elevation)
      ) {
        throw new RangeError(
          'Permanent water surfaces must be finite and reference integer cell indices inside the grid.',
        );
      }
      surfaces.set(index, elevation);
    }
    this.roadDeckElevations = decks;
    this.permanentWaterSurfaces = surfaces;
    const blocked = environment.blockedCellIndices ?? [];
    for (const index of blocked) {
      if (!Number.isInteger(index) || index < 0 || index >= this.cellCount)
        throw new RangeError(
          'Blocked cell index must be an integer inside the grid.',
        );
    }
    const rates = environment.additionalDrainRatesMmPerHour;
    if (rates !== undefined) {
      if (rates.length !== this.cellCount)
        throw new RangeError(
          'Additional drainage must contain one rate per cell.',
        );
      for (const rate of rates) {
        if (!Number.isFinite(rate) || rate < 0)
          throw new RangeError(
            'Additional drainage rates must be finite and nonnegative.',
          );
      }
    }
    this.blockedCells = new Set(blocked);
    this.additionalDrainRates = rates === undefined ? [] : [...rates];
    const inflow = environment.sustainedInflow;
    if (inflow !== undefined) {
      if (
        !Number.isFinite(inflow.rateInMetersPerSecond) ||
        inflow.rateInMetersPerSecond < 0 ||
        (inflow.durationInSeconds !== undefined &&
          (!Number.isFinite(inflow.durationInSeconds) ||
            inflow.durationInSeconds < 0))
      )
        throw new RangeError(
          'Sustained inflow rate and duration must be finite and nonnegative.',
        );
      for (const index of inflow.cellIndices) {
        if (!Number.isInteger(index) || index < 0 || index >= this.cellCount)
          throw new RangeError(
            'Sustained inflow cells must be integer indices inside the grid.',
          );
      }
      this.sustainedInflow = {
        cellIndices: [...inflow.cellIndices],
        rateInMetersPerSecond: inflow.rateInMetersPerSecond,
        durationInSeconds: inflow.durationInSeconds ?? Number.POSITIVE_INFINITY,
      };
    } else this.sustainedInflow = null;
    for (const pulse of initialPulses) {
      if (
        pulse.depthInMeters > 0 &&
        this.blockedCells.has(pulse.row * this.columns + pulse.column)
      )
        throw new RangeError(
          'Initial water cannot be placed in a blocked cell.',
        );
    }
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

      if (this.blockedCells.size > 0) {
        const open = new Set(
          indices.filter((index) => !this.blockedCells.has(index)),
        );
        for (const index of indices) {
          if (!this.blockedCells.has(index)) continue;
          const row = Math.floor(index / this.columns);
          const column = index % this.columns;
          for (const [dr, dc] of NEIGHBOR_OFFSETS) {
            const r = row + dr,
              c = column + dc;
            const neighbor = r * this.columns + c;
            if (
              r >= 0 &&
              r < this.rows &&
              c >= 0 &&
              c < this.columns &&
              !this.blockedCells.has(neighbor)
            )
              open.add(neighbor);
          }
        }
        return { building, cellIndices: [...open] };
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
      if (this.blockedCells.has(i)) continue;
      const prevDepth = this.currentWaterDepth[i] ?? 0;
      const withRain = prevDepth + rainDepthMeters;
      this.totalRainVolumeInCubicMeters +=
        rainDepthMeters * cell.areaInSqMeters;

      const localDrain = ((this.additionalDrainRates[i] ?? 0) / 1000) * dtHours;
      const actualDrain = Math.min(withRain, drainDepthMeters + localDrain);
      this.totalDrainedVolumeInCubicMeters += actualDrain * cell.areaInSqMeters;

      const postSourceDepth = withRain - actualDrain;
      this.currentWaterDepth[i] = postSourceDepth;
      this.nextWaterDepth[i] = postSourceDepth;
    }

    // 1b. Caudal sostenido (río/mar) durante su ventana de hidrográfica.
    if (this.sustainedInflow) {
      const remaining = Math.max(
        0,
        this.sustainedInflow.durationInSeconds - this.elapsedTimeInSeconds,
      );
      const depth =
        this.sustainedInflow.rateInMetersPerSecond *
        Math.min(this.config.timeStepInSeconds, remaining);
      if (depth > 0)
        for (const index of this.sustainedInflow.cellIndices) {
          if (this.blockedCells.has(index)) continue;
          this.currentWaterDepth[index] =
            (this.currentWaterDepth[index] ?? 0) + depth;
          this.nextWaterDepth[index] =
            (this.nextWaterDepth[index] ?? 0) + depth;
          this.totalInflowVolumeInCubicMeters +=
            depth * this.cells[index]!.areaInSqMeters;
        }
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

          for (const { dr, dc, weight } of FLOW_OFFSETS) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.columns) {
              continue;
            }
            const nIdx = nr * this.columns + nc;
            if (this.blockedCells.has(nIdx)) continue;
            const nSurface =
              (this.effectiveGroundElevation[nIdx] ?? 0) +
              (this.currentWaterDepth[nIdx] ?? 0);
            const diff = surfaceHere - nSurface;

            if (diff > 0) {
              neighborIndices.push(nIdx);
              neighborDiffs.push(diff * weight);
              totalPositiveDiff += diff * weight;
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

    // Velocidad proxy por celda (Manning, rugosidad urbana n=0.08): nace de
    // la mayor pendiente de superficie libre hacia un vecino y de la lámina.
    const flowSpeedInMetersPerSecond = new Float32Array(this.cellCount);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.columns; c++) {
        const idx = r * this.columns + c;
        const depth = this.currentWaterDepth[idx] ?? 0;
        if (depth < 0.02) continue;
        const cell = this.cells[idx]!;
        const surface = (this.effectiveGroundElevation[idx] ?? 0) + depth;
        let maxSlope = 0;
        for (const [dr, dc] of NEIGHBOR_OFFSETS) {
          const nr = r + dr,
            nc = c + dc;
          if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.columns)
            continue;
          const nIdx = nr * this.columns + nc;
          const nSurface =
            (this.effectiveGroundElevation[nIdx] ?? 0) +
            (this.currentWaterDepth[nIdx] ?? 0);
          const distance =
            dc !== 0 ? cell.maxX - cell.minX : cell.maxY - cell.minY;
          const slope = (surface - nSurface) / Math.max(1e-6, distance);
          if (slope > maxSlope) maxSlope = slope;
        }
        flowSpeedInMetersPerSecond[idx] = Math.min(
          6,
          (1 / 0.08) * Math.pow(depth, 2 / 3) * Math.sqrt(maxSlope),
        );
      }
    }

    // Evaluación de tramos viales por edge.id
    const blockedRoadEdgeIds: string[] = [];
    const roadEdges: AffectedRoadEdge[] = this.mappedEdges.map(
      ({ edge, cellIndices }) => {
        let maxD = 0;
        let sumD = 0;
        for (const cIdx of cellIndices) {
          const dynamicDepth = this.currentWaterDepth[cIdx] ?? 0;
          const deck = this.roadDeckElevations.get(edge.id);
          const permanentSurface = this.permanentWaterSurfaces.get(cIdx);
          // Keep ordinary roads without metadata on the exact legacy path.
          const ground = this.effectiveGroundElevation[cIdx] ?? 0;
          const d =
            deck === undefined && permanentSurface === undefined
              ? dynamicDepth
              : Math.max(
                  0,
                  Math.max(
                    ground + dynamicDepth,
                    permanentSurface ?? -Infinity,
                  ) - (deck ?? ground),
                );
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
        let maxSpeed = 0;
        for (const cIdx of cellIndices) {
          const d = this.currentWaterDepth[cIdx] ?? 0;
          if (d > maxD) maxD = d;
          sumD += d;
          const speed = flowSpeedInMetersPerSecond[cIdx] ?? 0;
          if (speed > maxSpeed) maxSpeed = speed;
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
          maxFlowSpeedInMetersPerSecond: maxSpeed,
          exposed,
        };
      },
    );

    const expectedVolume =
      this.initialVolumeInCubicMeters +
      this.totalRainVolumeInCubicMeters +
      this.totalInflowVolumeInCubicMeters -
      this.totalDrainedVolumeInCubicMeters;

    const balance: WaterBalance = {
      initialVolumeInCubicMeters: this.initialVolumeInCubicMeters,
      totalRainVolumeInCubicMeters: this.totalRainVolumeInCubicMeters,
      totalDrainedVolumeInCubicMeters: this.totalDrainedVolumeInCubicMeters,
      totalInflowVolumeInCubicMeters: this.totalInflowVolumeInCubicMeters,
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
      flowSpeedInMetersPerSecond,
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
