import type { ImpactSummary } from './impact-summary';

/** One-page plain-text report built from live simulation numbers. */
export function buildReport(input: {
  zoneLabel: string;
  hazardLabel: string;
  summary: ImpactSummary;
  narrative: string[];
  comparisonLines: string[];
}): string {
  const { summary } = input;
  return [
    `Simulicity IA — Reporte de evento`,
    `Zona: ${input.zoneLabel}`,
    `Evento: ${input.hazardLabel}`,
    ``,
    `## Impacto`,
    `- Tiempo simulado: ${summary.elapsedMinutes} min`,
    `- Agua máxima: ${(summary.maxWaterDepthInMeters * 100).toFixed(1)} cm`,
    `- Personas evacuadas: ${summary.evacuated} / ${summary.totalCitizens} (${summary.evacuatedPercent}%)`,
    `- Edificios expuestos: ${summary.exposedBuildings} / ${summary.totalBuildings} (${summary.exposedPercent}%)`,
    `- Edificios dañados: ${summary.damagedBuildings} · Derrumbados: ${summary.collapsedBuildings}`,
    `- Personas atrapadas: ${summary.trapped}`,
    `- Tramos bloqueados: ${summary.blockedRoads}`,
    ``,
    `## Relato (generado desde los datos, sin IA)`,
    ...input.narrative.map((line) => `- ${line}`),
    ...(input.comparisonLines.length
      ? [
          ``,
          `## Comparación sin/con mejora`,
          ...input.comparisonLines.map((line) => `- ${line}`),
        ]
      : []),
    ``,
    `Coeficientes demostrativos, no calibrados. No es guía de emergencia certificada.`,
  ].join('\n');
}

export function downloadReport(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
