export interface ComparisonMetrics {
  evacuated: number;
  trapped: number;
  exposedBuildings: number;
  blockedRoadsPeak: number;
  maxWaterDepthInMeters: number;
}

/**
 * Ranks concrete recommendations from the before/after comparison: what
 * the improvement arm already proves, and what still hurts most. Lines
 * are plain Spanish for the final summary and the report.
 */
export function recommendImprovements(input: {
  before: ComparisonMetrics;
  after: ComparisonMetrics;
  vulnerableExposed: number;
  vulnerableTotal: number;
  shelterOccupancy: number;
  shelterCapacity: number;
}): string[] {
  const lines: string[] = [];
  const { before, after } = input;
  const savedPeople = after.evacuated - before.evacuated;
  if (savedPeople > 0)
    lines.push(
      `✅ La mejora (drenajes + infiltración) evacuó ${savedPeople} personas más y dejó ${before.trapped - after.trapped} atrapadas menos. Es la intervención con mejor resultado medido.`,
    );
  if (input.vulnerableTotal > 0 && input.vulnerableExposed > 0)
    lines.push(
      `🏫 ${input.vulnerableExposed} de ${input.vulnerableTotal} edificios vulnerables (escuela/hospital/residencia) quedaron expuestos: priorizar su alerta temprana y plan de evacuación asistida.`,
    );
  if (
    input.shelterCapacity > 0 &&
    input.shelterOccupancy >= input.shelterCapacity
  )
    lines.push(
      `⛺ Los refugios se llenaron (${input.shelterOccupancy}/${input.shelterCapacity}): hace falta capacidad adicional o un refugio más antes de la próxima tormenta.`,
    );
  if (after.blockedRoadsPeak > 0)
    lines.push(
      `🚧 Aun con la mejora, ${after.blockedRoadsPeak} tramos se bloquearon en el pico: revisar rutas alternativas de evacuación que no dependan de esas calles.`,
    );
  if (after.maxWaterDepthInMeters >= 0.3)
    lines.push(
      `🌊 El agua llegó a ${(after.maxWaterDepthInMeters * 100).toFixed(0)} cm: los drenajes actuales no alcanzan para este nivel de lluvia; combinar con retardadores aguas arriba.`,
    );
  if (!lines.length)
    lines.push(
      '✅ Sin pérdidas relevantes en este escenario: mantener el plan actual y repetir la simulación con lluvia más intensa.',
    );
  return lines;
}
