/**
 * Presentation-only summary of a running simulation. Numbers come from
 * existing snapshots/comparison metrics; nothing here feeds the solver.
 * The narrative is generated deterministically from those numbers, so
 * the demo never needs an LLM or a paid API.
 */
export interface ImpactInput {
  elapsedSeconds: number;
  maxWaterDepthInMeters: number;
  blockedRoads: number;
  exposedBuildings: number;
  totalBuildings: number;
  evacuated: number;
  totalCitizens: number;
  damagedBuildings: number;
  collapsedBuildings: number;
  trapped: number;
}

export interface ImpactSummary extends ImpactInput {
  elapsedMinutes: number;
  evacuatedPercent: number;
  exposedPercent: number;
}

export function buildImpactSummary(input: ImpactInput): ImpactSummary {
  const percent = (part: number, total: number) =>
    total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
  return {
    ...input,
    elapsedMinutes: Math.floor(input.elapsedSeconds / 60),
    evacuatedPercent: percent(input.evacuated, input.totalCitizens),
    exposedPercent: percent(input.exposedBuildings, input.totalBuildings),
  };
}

export function buildImpactNarrative(
  summary: ImpactSummary,
  hazardLabel: string,
): string[] {
  const lines: string[] = [];
  if (summary.elapsedSeconds <= 0) {
    lines.push(
      `Evento de ${hazardLabel} listo para iniciar sobre ${summary.totalBuildings} edificios y ${summary.totalCitizens} personas.`,
    );
    return lines;
  }
  lines.push(
    `A los ${summary.elapsedMinutes} min simulados, el agua alcanzó ${(summary.maxWaterDepthInMeters * 100).toFixed(0)} cm en el punto más profundo.`,
  );
  if (summary.blockedRoads > 0)
    lines.push(
      `${summary.blockedRoads} tramos quedaron bloqueados y las rutas de evacuación se recalcularon en tiempo real.`,
    );
  if (summary.exposedBuildings > 0)
    lines.push(
      `${summary.exposedBuildings} edificios quedaron expuestos (${summary.exposedPercent}% del total).`,
    );
  if (summary.damagedBuildings > 0 || summary.collapsedBuildings > 0)
    lines.push(
      `Daños: ${summary.damagedBuildings} edificios dañados, ${summary.collapsedBuildings} derrumbados.`,
    );
  if (summary.trapped > 0)
    lines.push(
      `${summary.trapped} personas quedaron atrapadas y requieren rescate.`,
    );
  lines.push(
    `Evacuación: ${summary.evacuated} de ${summary.totalCitizens} personas (${summary.evacuatedPercent}%) llegaron a refugio.`,
  );
  return lines;
}
