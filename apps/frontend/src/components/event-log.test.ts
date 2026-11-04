import { expect, it } from 'vitest';
import { buildEventLog, type EventSample } from './event-log';

const samples: EventSample[] = [
  {
    elapsedSeconds: 120,
    maxWaterDepthInMeters: 0.2,
    blockedRoads: 1,
    exposedBuildings: 1,
    evacuated: 50,
    trapped: 1,
    totalCitizens: 100,
  },
];

it('builds the timeline in English when asked', () => {
  const texts = buildEventLog(samples, 'en').map((event) => event.text);
  expect(texts).toContain('min 2 — Water appears in the streets');
  expect(texts).toContain('min 2 — First street blocked');
  expect(texts).toContain('min 2 — 50% of people evacuated');
});

it('keeps the Spanish timeline by default', () => {
  const texts = buildEventLog(samples).map((event) => event.text);
  expect(texts).toContain('min 2 — Aparece el agua en las calles');
});
