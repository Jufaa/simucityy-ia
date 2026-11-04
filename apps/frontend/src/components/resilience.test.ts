import { describe, expect, it } from 'vitest';
import { resilienceScore, buildShareText } from './resilience';

const base = {
  totalPeople: 100,
  evacuated: 100,
  trapped: 0,
  stranded: 0,
  exposedBuildings: 0,
  totalBuildings: 100,
  blockedRoadsPeak: 0,
  maxWaterDepthInMeters: 0,
};

describe('resilienceScore', () => {
  it('gives a perfect city 100 and punishes trapped people most', () => {
    expect(resilienceScore(base)).toBe(100);
    const bad = resilienceScore({ ...base, evacuated: 50, trapped: 20 });
    const mild = resilienceScore({ ...base, evacuated: 50, trapped: 0 });
    expect(bad).toBeLessThan(mild);
    expect(bad).toBeGreaterThanOrEqual(0);
  });
  it('stays in range with empty cities', () => {
    expect(
      resilienceScore({ ...base, totalPeople: 0, totalBuildings: 0 }),
    ).toBe(100);
  });
});

it('buildShareText cites the score and measured evacuation', () => {
  const text = buildShareText({
    zoneLabel: 'Distrito',
    hazardLabel: 'tsunami',
    score: 82,
    evacuated: 90,
    total: 100,
    waveHeightInMeters: 10,
  });
  expect(text).toContain('82/100');
  expect(text).toContain('90/100');
  expect(text).toContain('tsunami');
});
