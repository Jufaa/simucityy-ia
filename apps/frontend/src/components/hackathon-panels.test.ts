import { expect, it } from 'vitest';
import { buildImpactNarrative, buildImpactSummary } from './impact-summary';
import { buildDemoSteps } from './demo-tour';
import { buildReport } from './report';

const summary = buildImpactSummary({
  elapsedSeconds: 720,
  maxWaterDepthInMeters: 0.42,
  blockedRoads: 7,
  exposedBuildings: 25,
  totalBuildings: 200,
  evacuated: 150,
  totalCitizens: 200,
  damagedBuildings: 3,
  collapsedBuildings: 1,
  trapped: 2,
});

it('summarises impact with percentages and elapsed minutes', () => {
  expect(summary.elapsedMinutes).toBe(12);
  expect(summary.evacuatedPercent).toBe(75);
  expect(summary.exposedPercent).toBe(12.5);
});

it('narrates only facts present in the numbers', () => {
  const lines = buildImpactNarrative(summary, 'lluvia intensa');
  expect(lines.join(' ')).toContain('42 cm');
  expect(lines.join(' ')).toContain('150 de 200');
  const calm = buildImpactNarrative(
    buildImpactSummary({
      elapsedSeconds: 0,
      maxWaterDepthInMeters: 0,
      blockedRoads: 0,
      exposedBuildings: 0,
      totalBuildings: 10,
      evacuated: 0,
      totalCitizens: 5,
      damagedBuildings: 0,
      collapsedBuildings: 0,
      trapped: 0,
    }),
    'lluvia intensa',
  );
  expect(calm).toHaveLength(1);
  expect(calm[0]).toContain('listo para iniciar');
});

it('builds a three-beat guided demo with camera and speed cues', () => {
  const steps = buildDemoSteps({
    zoneLabel: 'Eixample',
    buildings: 200,
    citizens: 500,
    hazardLabel: 'lluvia intensa',
  });
  expect(steps.map((step) => step.view)).toEqual(['world', 'city', 'city']);
  expect(steps.map((step) => step.speed)).toEqual([30, 300, 3]);
  expect(steps[0]!.body).toContain('Eixample');
});

it('builds a one-page report with impact, narrative and comparison', () => {
  const text = buildReport({
    zoneLabel: 'Eixample',
    hazardLabel: 'lluvia intensa',
    summary,
    narrative: buildImpactNarrative(summary, 'lluvia intensa'),
    comparisonLines: ['Evacuadas: 120 → 150'],
  });
  expect(text).toContain('Reporte de evento');
  expect(text).toContain('Evacuadas: 120 → 150');
  expect(text).toContain('guía de emergencia certificada');
});
