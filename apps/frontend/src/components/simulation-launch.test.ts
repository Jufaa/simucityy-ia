import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  finalSummaryRows,
  shouldFinishSimulation,
  simulationProgress,
} from './simulation-launch';
import { FinalSummary } from './final-summary';

const input = {
  elapsedSeconds: 300,
  evacuated: 150,
  totalCitizens: 200,
  trapped: 3,
  exposedBuildings: 40,
  damagedBuildings: 12,
  collapsedBuildings: 2,
  totalBuildings: 200,
  blockedRoads: 7,
  maxWaterDepthInMeters: 0.42,
};

describe('simulation launch and final summary', () => {
  it('tracks progress and finishes at the chosen duration', () => {
    expect(simulationProgress(150, 5)).toBeCloseTo(0.5);
    expect(simulationProgress(9999, 5)).toBe(1);
    expect(shouldFinishSimulation(300, 5, true)).toBe(true);
    expect(shouldFinishSimulation(300, 5, false)).toBe(false);
    expect(shouldFinishSimulation(120, 5, true)).toBe(false);
  });

  it('builds loss rows with percentages', () => {
    const rows = finalSummaryRows(input);
    expect(rows).toContainEqual({
      label: 'Personas evacuadas',
      value: '150 (75%) de 200',
    });
    expect(rows).toContainEqual({ label: 'Edificios derrumbados', value: '2' });
    expect(rows).toContainEqual({ label: 'Agua máxima', value: '42.0 cm' });
  });

  it('renders the final summary dialog', () => {
    const html = renderToStaticMarkup(
      createElement(FinalSummary, {
        title: 'Lluvia intensa en Test',
        input,
        narrative: ['Pasó esto.'],
        onDownloadReport: () => {},
        onRestart: () => {},
        onClose: () => {},
      }),
    );
    expect(html).toContain('Resumen: Lluvia intensa en Test');
    expect(html).toContain('Personas evacuadas');
    expect(html).toContain('Descargar reporte');
  });
});
