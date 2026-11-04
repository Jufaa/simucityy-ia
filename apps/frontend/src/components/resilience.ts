/** Resilience score 0-100 derived only from measured simulation outcomes. */
export interface ResilienceInput {
  totalPeople: number;
  evacuated: number;
  trapped: number;
  stranded: number;
  exposedBuildings: number;
  totalBuildings: number;
  blockedRoadsPeak: number;
  maxWaterDepthInMeters: number;
}

export function resilienceScore(input: ResilienceInput): number {
  const people = Math.max(0, input.totalPeople);
  const evacuatedRatio = people === 0 ? 1 : input.evacuated / people;
  const trappedRatio = people === 0 ? 0 : input.trapped / people;
  const strandedRatio = people === 0 ? 0 : input.stranded / people;
  const buildings = Math.max(0, input.totalBuildings);
  const exposedRatio = buildings === 0 ? 0 : input.exposedBuildings / buildings;
  const score =
    evacuatedRatio * 55 -
    trappedRatio * 120 -
    strandedRatio * 30 -
    exposedRatio * 25 -
    Math.min(15, input.maxWaterDepthInMeters * 5) -
    Math.min(10, input.blockedRoadsPeak * 0.5) +
    45;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function resilienceGrade(score: number): string {
  if (score >= 85) return 'Excelente';
  if (score >= 70) return 'Buena';
  if (score >= 50) return 'Regular';
  if (score >= 30) return 'Frágil';
  return 'Crítica';
}

export function buildShareText(input: {
  zoneLabel: string;
  hazardLabel: string;
  score: number;
  evacuated: number;
  total: number;
  waveHeightInMeters?: number;
}): string {
  const detail =
    input.waveHeightInMeters !== undefined
      ? ` con una ola de ${input.waveHeightInMeters} m`
      : '';
  return `Mi ciudad (${input.zoneLabel}) resistio un ${input.hazardLabel}${detail} en Simulicity IA: resiliencia ${input.score}/100, ${input.evacuated}/${input.total} personas evacuadas. Creala vos tambien y proba tu ciudad.`;
}
