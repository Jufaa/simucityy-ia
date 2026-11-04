import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ComparisonPanel } from './comparison-panel';

it('labels cumulative and matched metrics and never displays unfinished evacuation as zero time', () => {
  const metrics = {
    tick: 0,
    rainVolume: 0,
    drainedVolume: 0,
    exposedBuildings: 0,
    damagedBuildings: 0,
    collapsedBuildings: 0,
    peakBlocked: 0,
    peakDepth: 0,
    evacuated: 0,
    stranded: 0,
    trapped: 0,
    completionSeconds: null,
  };
  const html = renderToStaticMarkup(
    createElement(ComparisonPanel, {
      comparison: {
        before: metrics,
        after: { ...metrics, completionSeconds: 120 },
      },
      alarmTime: 60,
      total: 12,
    }),
  );
  expect(html).toContain('Without improvement');
  expect(html).toContain('With improvement');
  expect(html).toContain('Not completed');
  expect(html).toContain('2.0 min');
  expect(html).toContain('Exposed buildings (cumulative)');
});

it('does not imply evacuation is active when population behavior is disabled', () => {
  const metrics = {
    tick: 1,
    rainVolume: 1,
    drainedVolume: 0,
    exposedBuildings: 0,
    damagedBuildings: 0,
    collapsedBuildings: 0,
    peakBlocked: 0,
    peakDepth: 0,
    evacuated: 0,
    stranded: 0,
    trapped: 0,
    completionSeconds: null,
  };
  const html = renderToStaticMarkup(
    createElement(ComparisonPanel, {
      comparison: { before: metrics, after: metrics },
      alarmTime: null,
      total: 200,
      evacuationEnabled: false,
    }),
  );
  expect(html).toContain('automatic behavior disabled');
  expect(html).not.toContain('Evacuated');
  expect(html).not.toContain('Evacuation from alarm');
});
