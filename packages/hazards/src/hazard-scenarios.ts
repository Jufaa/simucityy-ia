import type { Building, CityScenarioInput, FloodPulse } from './types.js';

/**
 * Catástrofes seleccionables de la demo. `rain` conserva exactamente el
 * comportamiento histórico (lluvia uniforme sobre FloodEngine); el resto
 * reutiliza ese motor de agua o el daño estructural determinista de este
 * módulo. Ninguna función muta el escenario de entrada.
 */
export type HazardKind =
  | 'rain'
  | 'river-overflow'
  | 'tsunami'
  | 'earthquake'
  | 'strong-wind'
  | 'fire'
  | 'tornado';

export const HAZARD_KINDS: readonly HazardKind[] = [
  'rain',
  'river-overflow',
  'tsunami',
  'earthquake',
  'strong-wind',
  'fire',
  'tornado',
];

export interface HazardPreset {
  readonly kind: HazardKind;
  /** Etiqueta corta para controles. */
  readonly label: string;
  /** Qué ocurre, en una frase honesta para la UI. */
  readonly description: string;
  /** Lluvia equivalente que alimenta FloodEngine (mm/h). */
  readonly rainIntensityMmPerHour: number;
  readonly drainRateMmPerHour: number;
  readonly flowTransferRatio: number;
  /** Solo terremoto: magnitud demostrativa del evento. */
  readonly magnitude?: number;
  /** Solo viento fuerte: racha demostrativa en km/h. */
  readonly windSpeedKmh?: number;
  /** Solo tsunami: altura demostrativa de la ola entrante en metros. */
  readonly waveHeightInMeters?: number;
}

export const HAZARD_PRESETS: Readonly<Record<HazardKind, HazardPreset>> = {
  rain: {
    kind: 'rain',
    label: 'Lluvia intensa',
    description:
      'Lluvia uniforme de 120 mm/h; el agua se acumula en las zonas bajas y corta calles.',
    rainIntensityMmPerHour: 120,
    drainRateMmPerHour: 15,
    flowTransferRatio: 0.5,
  },
  'river-overflow': {
    kind: 'river-overflow',
    label: 'Desborde de río',
    description:
      'El cauce y el lago parten con agua y la lluvia la empuja sobre las orillas hacia los barrios.',
    rainIntensityMmPerHour: 70,
    drainRateMmPerHour: 15,
    flowTransferRatio: 0.5,
  },
  tsunami: {
    kind: 'tsunami',
    label: 'Tsunami',
    description:
      'Una ola entra desde el mar (borde oeste) y avanza tierra adentro perdiendo altura.',
    rainIntensityMmPerHour: 0,
    drainRateMmPerHour: 10,
    flowTransferRatio: 0.6,
    waveHeightInMeters: 1.6,
  },
  earthquake: {
    kind: 'earthquake',
    label: 'Terremoto',
    description:
      'Sacudida instantánea: daña edificios cerca del epicentro y bloquea calles con escombros.',
    rainIntensityMmPerHour: 0,
    drainRateMmPerHour: 15,
    flowTransferRatio: 0.5,
    magnitude: 6.8,
  },
  'strong-wind': {
    kind: 'strong-wind',
    label: 'Vientos fuertes',
    description:
      'Rachas de 110 km/h: dañan primero los edificios altos y cortan calles con restos.',
    rainIntensityMmPerHour: 0,
    drainRateMmPerHour: 15,
    flowTransferRatio: 0.5,
    windSpeedKmh: 110,
  },
  fire: {
    kind: 'fire',
    label: 'Incendio urbano',
    description:
      'Un foco en un edificio se propaga a su entorno con llegadas y daños progresivos; modelo sintético, sin combustión calibrada.',
    rainIntensityMmPerHour: 0,
    drainRateMmPerHour: 15,
    flowTransferRatio: 0.5,
  },
  tornado: {
    kind: 'tornado',
    label: 'Tornado',
    description:
      'Un embudo recorre una franja estrecha de la ciudad y daña los edificios al alcanzarlos; trayectoria y daños sintéticos.',
    rainIntensityMmPerHour: 0,
    drainRateMmPerHour: 15,
    flowTransferRatio: 0.5,
  },
};

export function isHazardKind(value: unknown): value is HazardKind {
  return (
    typeof value === 'string' &&
    (HAZARD_KINDS as readonly string[]).includes(value)
  );
}

export function hazardPreset(kind: HazardKind): HazardPreset {
  return HAZARD_PRESETS[kind];
}

/** FNV-1a estable: misma entrada, mismo valor en cualquier plataforma. */
export function hazardHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 4294967296;
}

interface GridCell {
  readonly row: number;
  readonly column: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly groundElevationInMeters: number;
}

function gridCells(scenario: CityScenarioInput): GridCell[] {
  const {
    xCoordinates: xs,
    yCoordinates: ys,
    elevationsInMeters,
  } = scenario.terrainGrid;
  const cells: GridCell[] = [];
  for (let row = 0; row < ys.length - 1; row++) {
    for (let column = 0; column < xs.length - 1; column++) {
      const z00 =
        elevationsInMeters[row]?.[column] ?? scenario.terrain.elevationInMeters;
      const z01 =
        elevationsInMeters[row]?.[column + 1] ??
        scenario.terrain.elevationInMeters;
      const z10 =
        elevationsInMeters[row + 1]?.[column] ??
        scenario.terrain.elevationInMeters;
      const z11 =
        elevationsInMeters[row + 1]?.[column + 1] ??
        scenario.terrain.elevationInMeters;
      cells.push({
        row,
        column,
        centerX: ((xs[column] ?? 0) + (xs[column + 1] ?? 0)) / 2,
        centerY: ((ys[row] ?? 0) + (ys[row + 1] ?? 0)) / 2,
        groundElevationInMeters: (z00 + z01 + z10 + z11) * 0.25,
      });
    }
  }
  return cells;
}

/**
 * Agua inicial por catástrofe, como pulsos de FloodEngine. Las celdas
 * bloqueadas (edificios) se excluyen porque el motor las rechaza.
 */
export function createHazardPulses(
  scenario: CityScenarioInput,
  kind: HazardKind,
  blockedCellIndices: readonly number[] = [],
): FloodPulse[] {
  if (kind !== 'river-overflow' && kind !== 'tsunami') return [];
  const blocked = new Set(blockedCellIndices);
  const cells = gridCells(scenario);
  const columns = Math.max(1, scenario.terrainGrid.xCoordinates.length - 1);
  const open = cells.filter(
    (cell) => !blocked.has(cell.row * columns + cell.column),
  );
  if (kind === 'tsunami') {
    const wave = HAZARD_PRESETS.tsunami.waveHeightInMeters ?? 1.6;
    // El mar del mundo procedural está al oeste (x menor): la ola entra por
    // la columna 0 y pierde altura hacia el interior.
    return open
      .filter((cell) => cell.column < 4)
      .map((cell) => ({
        row: cell.row,
        column: cell.column,
        depthInMeters: wave * (1 - cell.column / 4),
      }));
  }
  // river-overflow: el agua parte del cauce. Con relieve real son las celdas
  // más bajas (canal/lago excavados); en un plano sin cauce se usa la franja
  // central como cauce sintético.
  const elevations = cells.map((cell) => cell.groundElevationInMeters);
  const min = Math.min(...elevations);
  const max = Math.max(...elevations);
  let source: GridCell[];
  if (max - min >= 1) {
    const sorted = [...elevations].sort((a, b) => a - b);
    const threshold = sorted[Math.floor(sorted.length * 0.12)] ?? min;
    source = open.filter((cell) => cell.groundElevationInMeters <= threshold);
  } else {
    const width =
      (scenario.terrainGrid.xCoordinates.at(-1) ?? 0) -
      (scenario.terrainGrid.xCoordinates[0] ?? 0);
    source = open.filter(
      (cell) => Math.abs(cell.centerX - width / 2) <= width * 0.06,
    );
  }
  return source.map((cell) => ({
    row: cell.row,
    column: cell.column,
    depthInMeters: 0.85,
  }));
}

export interface BuildingDamage {
  readonly buildingId: string;
  /** 0 = intacto, 1 = daño máximo demostrativo (potencial final del evento). */
  readonly severity: number;
  readonly damaged: boolean;
  /** Derrumbe total: la severidad supera el umbral de colapso del evento. */
  readonly collapsed: boolean;
  /**
   * Segundo simulado del derrumbe. Terremoto: durante/inmediatamente después
   * de la sacudida. Viento: cuando la rampa de rachas alcanza el umbral.
   */
  readonly collapseTimeInSeconds: number | null;
  /** New localized hazards only: synthetic ignition or corridor-arrival time. */
  readonly impactStartTimeInSeconds?: number;
}

export type BuildingCondition = 'intact' | 'damaged' | 'collapsed';

/** Estado físico de un edificio en un instante de la simulación. */
export interface BuildingImpact {
  readonly buildingId: string;
  readonly condition: BuildingCondition;
  /** Severidad efectiva a ese instante (el viento crece con las rachas). */
  readonly severity: number;
  readonly collapseTimeInSeconds: number | null;
  readonly cause: HazardKind;
}

export const COLLAPSE_THRESHOLDS: Readonly<Record<HazardKind, number>> = {
  rain: 1.01,
  'river-overflow': 1.01,
  tsunami: 1.01,
  earthquake: 0.75,
  'strong-wind': 0.88,
  fire: 0.82,
  tornado: 0.84,
};

export interface StructuralAssessment {
  readonly kind: HazardKind;
  readonly buildings: readonly BuildingDamage[];
  readonly damagedBuildingIds: readonly string[];
  readonly blockedRoadEdgeIds: readonly string[];
  readonly maxSeverity: number;
}

const DAMAGE_THRESHOLD = 0.6;

const LOCAL_EVENT_START = 30;
const TORNADO_DURATION = 180;
const FIRE_DAMAGE_RAMP = 90;
const TORNADO_DAMAGE_RAMP = 3;

function tornadoPath(
  scenario: Pick<CityScenarioInput, 'terrainGrid'>,
  seed: number,
) {
  const xs = scenario.terrainGrid.xCoordinates;
  const ys = scenario.terrainGrid.yCoordinates;
  const minX = xs[0] ?? 0,
    minY = ys[0] ?? 0;
  const width = Math.max(1, (xs.at(-1) ?? 1) - minX);
  const height = Math.max(1, (ys.at(-1) ?? 1) - minY);
  return {
    from: {
      x: minX,
      y: minY + height * (0.3 + hazardHash(`${seed}:tornado-entry`) * 0.4),
    },
    to: {
      x: minX + width,
      y: minY + height * (0.25 + hazardHash(`${seed}:tornado-exit`) * 0.5),
    },
    radiusInMeters: Math.max(18, Math.min(55, Math.min(width, height) * 0.065)),
  };
}

/** Shared domain/render trajectory: no random decisions or integration drift per frame. */
export function tornadoPathAt(
  scenario: Pick<CityScenarioInput, 'terrainGrid'>,
  elapsedInSeconds: number,
  seed = 123,
) {
  const path = tornadoPath(scenario, seed);
  const progress = Number.isFinite(elapsedInSeconds)
    ? Math.max(
        0,
        Math.min(1, (elapsedInSeconds - LOCAL_EVENT_START) / TORNADO_DURATION),
      )
    : 0;
  return {
    x: path.from.x + (path.to.x - path.from.x) * progress,
    y: path.from.y + (path.to.y - path.from.y) * progress,
    radiusInMeters: path.radiusInMeters,
    active:
      Number.isFinite(elapsedInSeconds) &&
      elapsedInSeconds >= LOCAL_EVENT_START &&
      elapsedInSeconds <= LOCAL_EVENT_START + TORNADO_DURATION,
  };
}

/** Legacy hazards retain their existing automatic-alarm policy. */
export function hazardWarningTimeInSeconds(
  kind: HazardKind,
  assessment: StructuralAssessment,
): number | null {
  if (kind !== 'fire' && kind !== 'tornado') return null;
  let firstArrival = Infinity;
  for (const building of assessment.buildings) {
    const arrival = building.impactStartTimeInSeconds;
    if (arrival !== undefined && Number.isFinite(arrival))
      firstArrival = Math.min(firstArrival, arrival);
  }
  return Number.isFinite(firstArrival) ? Math.max(0, firstArrival - 15) : null;
}

function assessLocalizedDamage(
  scenario: CityScenarioInput,
  kind: 'fire' | 'tornado',
  seed: number,
  reinforced: boolean,
): StructuralAssessment {
  const xs = scenario.terrainGrid.xCoordinates,
    ys = scenario.terrainGrid.yCoordinates;
  const width = (xs.at(-1) ?? 0) - (xs[0] ?? 0),
    height = (ys.at(-1) ?? 0) - (ys[0] ?? 0);
  const ignition =
    scenario.buildings[
      Math.floor(hazardHash(`${seed}:fire-origin`) * scenario.buildings.length)
    ];
  const origin = ignition
    ? {
        x: (ignition.minCorner.x + ignition.maxCorner.x) / 2,
        y: (ignition.minCorner.y + ignition.maxCorner.y) / 2,
      }
    : { x: 0, y: 0 };
  const fireRadius = Math.max(
    55,
    Math.min(190, Math.min(width, height) * 0.24),
  );
  const path = tornadoPath(scenario, seed);
  const pathDx = path.to.x - path.from.x,
    pathDy = path.to.y - path.from.y;
  const pathLengthSquared = pathDx * pathDx + pathDy * pathDy;
  const buildings: BuildingDamage[] = scenario.buildings.map((building) => {
    const center = {
      x: (building.minCorner.x + building.maxCorner.x) / 2,
      y: (building.minCorner.y + building.maxCorner.y) / 2,
    };
    const vulnerability = hazardHash(`${seed}:${kind}:${building.id}`);
    let severity = 0,
      impactStartTimeInSeconds: number | undefined;
    if (kind === 'fire' && ignition) {
      const distance = Math.hypot(center.x - origin.x, center.y - origin.y);
      if (distance < fireRadius) {
        severity =
          (1.15 - (distance / fireRadius) * 0.9) *
          (0.92 + vulnerability * 0.25);
        impactStartTimeInSeconds = LOCAL_EVENT_START + distance / 1.2;
      }
    } else if (kind === 'tornado') {
      const distance = distanceToSegment(center, path.from, path.to);
      if (distance < path.radiusInMeters) {
        const progress = Math.max(
          0,
          Math.min(
            1,
            ((center.x - path.from.x) * pathDx +
              (center.y - path.from.y) * pathDy) /
              pathLengthSquared,
          ),
        );
        severity =
          (1 - distance / path.radiusInMeters) * (1.05 + vulnerability * 0.3);
        impactStartTimeInSeconds =
          LOCAL_EVENT_START + progress * TORNADO_DURATION;
      }
    }
    severity = Math.max(0, Math.min(1, severity * (reinforced ? 0.55 : 1)));
    const collapsed = severity >= COLLAPSE_THRESHOLDS[kind];
    const ramp = kind === 'fire' ? FIRE_DAMAGE_RAMP : TORNADO_DAMAGE_RAMP;
    return {
      buildingId: building.id,
      severity,
      damaged: severity >= DAMAGE_THRESHOLD,
      collapsed,
      collapseTimeInSeconds:
        collapsed && impactStartTimeInSeconds !== undefined
          ? impactStartTimeInSeconds +
            (COLLAPSE_THRESHOLDS[kind] / severity) * ramp
          : null,
      ...(impactStartTimeInSeconds === undefined
        ? {}
        : { impactStartTimeInSeconds }),
    };
  });
  return {
    kind,
    buildings,
    damagedBuildingIds: buildings
      .filter((building) => building.damaged)
      .map((building) => building.buildingId),
    blockedRoadEdgeIds: roadEdgeIdsBlockedByBuildings(
      scenario,
      new Set(
        buildings
          .filter((building) => building.collapsed)
          .map((building) => building.buildingId),
      ),
    ),
    maxSeverity: buildings.reduce(
      (max, building) => Math.max(max, building.severity),
      0,
    ),
  };
}

function distanceToSegment(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t =
    length === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length),
        );
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

/**
 * Daño estructural determinista para terremoto y viento. `reinforced`
 * representa el brazo "con mejora" (refuerzo sísmico / techos asegurados):
 * reduce la severidad sin cambiar qué edificios existen.
 */
export function assessStructuralDamage(
  scenario: CityScenarioInput,
  kind: HazardKind,
  options: { seed?: number; reinforced?: boolean } = {},
): StructuralAssessment {
  if (kind === 'fire' || kind === 'tornado')
    return assessLocalizedDamage(
      scenario,
      kind,
      options.seed ?? 123,
      options.reinforced ?? false,
    );
  const empty: StructuralAssessment = {
    kind,
    buildings: scenario.buildings.map((building) => ({
      buildingId: building.id,
      severity: 0,
      damaged: false,
      collapsed: false,
      collapseTimeInSeconds: null,
    })),
    damagedBuildingIds: [],
    blockedRoadEdgeIds: [],
    maxSeverity: 0,
  };
  if (kind !== 'earthquake' && kind !== 'strong-wind') return empty;
  const seed = options.seed ?? 123;
  const factor = options.reinforced ? 0.55 : 1;
  const xs = scenario.terrainGrid.xCoordinates;
  const ys = scenario.terrainGrid.yCoordinates;
  const width = (xs.at(-1) ?? 0) - (xs[0] ?? 0);
  const height = (ys.at(-1) ?? 0) - (ys[0] ?? 0);
  const epicenter = {
    x: (xs[0] ?? 0) + width / 2,
    y: (ys[0] ?? 0) + height / 2,
  };
  const maxDistance = Math.hypot(width, height) / 2 || 1;
  const buildings: BuildingDamage[] = scenario.buildings.map(
    (building: Building) => {
      const center = {
        x: (building.minCorner.x + building.maxCorner.x) / 2,
        y: (building.minCorner.y + building.maxCorner.y) / 2,
      };
      const random = hazardHash(`${seed}:${kind}:${building.id}`);
      let severity: number;
      if (kind === 'earthquake') {
        const distanceRatio =
          Math.hypot(center.x - epicenter.x, center.y - epicenter.y) /
          maxDistance;
        const heightFactor = Math.min(1, building.heightInMeters / 40) * 0.2;
        severity =
          (1.12 - 0.62 * distanceRatio) * (0.62 + 0.55 * random) +
          heightFactor -
          0.28;
      } else {
        // El viento castiga la altura expuesta y la orientación aleatoria.
        const heightRatio = Math.min(1, building.heightInMeters / 36);
        severity = (0.22 + 0.85 * heightRatio) * (0.55 + 0.65 * random);
      }
      severity = Math.max(0, Math.min(1, severity * factor));
      const collapsed = severity >= COLLAPSE_THRESHOLDS[kind];
      // El terremoto derrumba durante la sacudida y sus réplicas inmediatas
      // (4-114 s, escalonado por edificio). El viento derrumba cuando la
      // rampa de rachas (600 s hasta el pico) empuja la severidad efectiva
      // por encima del umbral: t = umbral / severidadFinal * 600.
      const collapseTimeInSeconds = !collapsed
        ? null
        : kind === 'earthquake'
          ? 4 + hazardHash(`${seed}:collapse:${building.id}`) * 110
          : (COLLAPSE_THRESHOLDS[kind] / severity) * 600;
      return {
        buildingId: building.id,
        severity,
        damaged: severity >= DAMAGE_THRESHOLD,
        collapsed,
        collapseTimeInSeconds,
      };
    },
  );
  const damaged = buildings.filter((item) => item.damaged);
  // Los escombros que cortan una calle salen de los edificios derrumbados.
  const blockedRoadEdgeIds = roadEdgeIdsBlockedByBuildings(
    scenario,
    new Set(
      buildings.filter((item) => item.collapsed).map((item) => item.buildingId),
    ),
  );
  return {
    kind,
    buildings,
    damagedBuildingIds: damaged.map((item) => item.buildingId),
    blockedRoadEdgeIds,
    maxSeverity: buildings.reduce(
      (max, item) => Math.max(max, item.severity),
      0,
    ),
  };
}

/** Tramos cortados por escombros de un conjunto de edificios derrumbados. */
export function roadEdgeIdsBlockedByBuildings(
  scenario: CityScenarioInput,
  collapsedBuildingIds: ReadonlySet<string>,
): string[] {
  if (collapsedBuildingIds.size === 0) return [];
  const nodesById = new Map(
    scenario.roadGraph.nodes.map((node) => [node.id, node]),
  );
  const blockedRoadEdgeIds: string[] = [];
  for (const edge of scenario.roadGraph.edges) {
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    if (!from || !to) continue;
    const blocked = scenario.buildings.some((building) => {
      if (!collapsedBuildingIds.has(building.id)) return false;
      const center = {
        x: (building.minCorner.x + building.maxCorner.x) / 2,
        y: (building.minCorner.y + building.maxCorner.y) / 2,
      };
      const reach =
        Math.hypot(
          building.maxCorner.x - building.minCorner.x,
          building.maxCorner.y - building.minCorner.y,
        ) /
          2 +
        10;
      return distanceToSegment(center, from, to) <= reach;
    });
    if (blocked) blockedRoadEdgeIds.push(edge.id);
  }
  return blockedRoadEdgeIds;
}

/** Severidad efectiva a un instante: el viento crece con la rampa de rachas. */
export function effectiveSeverityAt(
  damage: BuildingDamage,
  kind: HazardKind,
  elapsedInSeconds: number,
): number {
  if (kind === 'fire' || kind === 'tornado') {
    const onset = damage.impactStartTimeInSeconds;
    if (
      onset === undefined ||
      !Number.isFinite(onset) ||
      Number.isNaN(elapsedInSeconds)
    )
      return 0;
    const ramp = kind === 'fire' ? FIRE_DAMAGE_RAMP : TORNADO_DAMAGE_RAMP;
    return (
      damage.severity *
      Math.max(0, Math.min(1, (elapsedInSeconds - onset) / ramp))
    );
  }
  if (kind === 'strong-wind')
    return damage.severity * Math.min(1, Math.max(0, elapsedInSeconds) / 600);
  return damage.severity;
}

/** Estado físico de un edificio en un instante dado del evento. */
export function buildingImpactAt(
  damage: BuildingDamage,
  kind: HazardKind,
  elapsedInSeconds: number,
): BuildingImpact {
  const severity = effectiveSeverityAt(damage, kind, elapsedInSeconds);
  const condition: BuildingCondition =
    damage.collapsed &&
    damage.collapseTimeInSeconds !== null &&
    elapsedInSeconds >= damage.collapseTimeInSeconds
      ? 'collapsed'
      : severity >= DAMAGE_THRESHOLD
        ? 'damaged'
        : 'intact';
  return {
    buildingId: damage.buildingId,
    condition,
    severity,
    collapseTimeInSeconds: damage.collapseTimeInSeconds,
    cause: kind,
  };
}

/** Duración de la rampa de rachas del viento, en segundos simulados. */
export const WIND_RAMP_IN_SECONDS = 600;

/**
 * Carga equivalente sobre un edificio a partir de la profundidad junto a
 * él. El solver no calcula velocidad, así que el empuje de la corriente se
 * aproxima con un factor por evento: el tsunami arrastra (×2,2), el
 * desborde empuja (×1,3) y la lluvia es agua casi quieta (×1).
 */
export function floodImpactLoadInMeters(
  depthInMeters: number,
  kind: HazardKind,
): number {
  const factor = kind === 'tsunami' ? 2.2 : kind === 'river-overflow' ? 1.3 : 1;
  return Math.max(0, depthInMeters) * factor;
}

/**
 * Profundidad de agua que derrumba un edificio en eventos de agua.
 * El tsunami golpea con fuerza (0,7 m), el desborde empuja (1,0 m) y la
 * lluvia sola rara vez derrumba (1,4 m). Varía por edificio (hash estable)
 * y los edificios bajos son más vulnerables al arrastre.
 */
export function floodCollapseDepthInMeters(
  building: Pick<Building, 'id' | 'heightInMeters'>,
  kind: HazardKind,
  seed = 123,
): number {
  const base = kind === 'tsunami' ? 0.7 : kind === 'river-overflow' ? 1.0 : 1.4;
  const variation = hazardHash(`${seed}:flood-collapse:${building.id}`) * 0.3;
  const lowBuildingPenalty =
    building.heightInMeters <= 4
      ? 0.15
      : building.heightInMeters <= 9
        ? 0.07
        : 0;
  return Math.max(0.3, base + variation - lowBuildingPenalty);
}
