/** Progress of the current run towards the chosen duration, 0..1. */
export function simulationProgress(
  elapsedSeconds: number,
  durationInMinutes: number,
): number {
  if (!Number.isFinite(elapsedSeconds) || durationInMinutes <= 0) return 0;
  return Math.min(1, Math.max(0, elapsedSeconds / (durationInMinutes * 60)));
}

/** True when a running simulation has reached its chosen duration. */
export function shouldFinishSimulation(
  elapsedSeconds: number,
  durationInMinutes: number,
  running: boolean,
): boolean {
  return running && simulationProgress(elapsedSeconds, durationInMinutes) >= 1;
}

export interface FinalSummaryInput {
  elapsedSeconds: number;
  evacuated: number;
  totalCitizens: number;
  trapped: number;
  exposedBuildings: number;
  damagedBuildings: number;
  collapsedBuildings: number;
  totalBuildings: number;
  blockedRoads: number;
  maxWaterDepthInMeters: number;
  /** People who neither reached a shelter nor are trapped (still exposed). */
  withoutShelter?: number;
  shelterOccupancy?: number;
  shelterCapacity?: number;
  vulnerableExposed?: number;
  vulnerableTotal?: number;
}

/** Loss/impact rows for the end-of-simulation summary, in display order. */
export function finalSummaryRows(
  input: FinalSummaryInput,
): { label: string; value: string }[] {
  const percent = (part: number, total: number) =>
    total > 0 ? ` (${Math.round((part / total) * 100)}%)` : '';
  return [
    {
      label: 'Tiempo simulado',
      value: `${Math.floor(input.elapsedSeconds / 60)} min`,
    },
    {
      label: 'Personas evacuadas',
      value: `${input.evacuated}${percent(input.evacuated, input.totalCitizens)} de ${input.totalCitizens}`,
    },
    { label: 'Personas atrapadas', value: `${input.trapped}` },
    {
      label: 'Edificios expuestos',
      value: `${input.exposedBuildings}${percent(input.exposedBuildings, input.totalBuildings)}`,
    },
    { label: 'Edificios dañados', value: `${input.damagedBuildings}` },
    { label: 'Edificios derrumbados', value: `${input.collapsedBuildings}` },
    { label: 'Tramos de calle bloqueados', value: `${input.blockedRoads}` },
    {
      label: 'Agua máxima',
      value: `${(input.maxWaterDepthInMeters * 100).toFixed(1)} cm`,
    },
    ...(input.withoutShelter !== undefined
      ? [{ label: 'Sin refugio al terminar', value: `${input.withoutShelter}` }]
      : []),
    ...(input.shelterCapacity !== undefined
      ? [
          {
            label: 'Refugios (ocupación/capacidad)',
            value: `${input.shelterOccupancy ?? 0} / ${input.shelterCapacity}`,
          },
        ]
      : []),
    ...(input.vulnerableTotal !== undefined && input.vulnerableTotal > 0
      ? [
          {
            label: 'Edificios vulnerables expuestos',
            value: `${input.vulnerableExposed ?? 0} de ${input.vulnerableTotal} (escuela/hospital/residencia)`,
          },
        ]
      : []),
  ];
}
