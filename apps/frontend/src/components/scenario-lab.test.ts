import { describe, expect, it } from 'vitest';
import { buildEventLog } from './event-log';
import { recommendImprovements } from './recommendation';
import { parseSavedScenarios } from './saved-scenarios';
import { vulnerableKindFor } from './real-city-model';

describe('event log', () => {
  it('records firsts and evacuation milestones in order', () => {
    const events = buildEventLog([
      {
        elapsedSeconds: 0,
        maxWaterDepthInMeters: 0,
        blockedRoads: 0,
        exposedBuildings: 0,
        evacuated: 0,
        trapped: 0,
        totalCitizens: 100,
      },
      {
        elapsedSeconds: 120,
        maxWaterDepthInMeters: 0.05,
        blockedRoads: 1,
        exposedBuildings: 2,
        evacuated: 30,
        trapped: 0,
        totalCitizens: 100,
      },
      {
        elapsedSeconds: 300,
        maxWaterDepthInMeters: 0.2,
        blockedRoads: 3,
        exposedBuildings: 5,
        evacuated: 100,
        trapped: 1,
        totalCitizens: 100,
      },
    ]);
    expect(events.map((e) => e.text)).toEqual([
      'min 2 — Aparece el agua en las calles',
      'min 2 — Primera calle bloqueada',
      'min 2 — Primer edificio expuesto al agua',
      'min 2 — 25% de las personas evacuadas',
      'min 5 — Primera persona atrapada',
      'min 5 — 50% de las personas evacuadas',
      'min 5 — 75% de las personas evacuadas',
      'min 5 — 100% de las personas evacuadas',
    ]);
  });
});

describe('recommendations', () => {
  it('ranks measured improvement, vulnerable exposure and full shelters', () => {
    const lines = recommendImprovements({
      before: {
        evacuated: 80,
        trapped: 5,
        exposedBuildings: 40,
        blockedRoadsPeak: 9,
        maxWaterDepthInMeters: 0.5,
      },
      after: {
        evacuated: 95,
        trapped: 1,
        exposedBuildings: 30,
        blockedRoadsPeak: 4,
        maxWaterDepthInMeters: 0.42,
      },
      vulnerableExposed: 2,
      vulnerableTotal: 3,
      shelterOccupancy: 600,
      shelterCapacity: 600,
    });
    expect(lines[0]).toContain('15 personas más');
    expect(lines.some((l) => l.includes('edificios vulnerables'))).toBe(true);
    expect(lines.some((l) => l.includes('refugios se llenaron'))).toBe(true);
  });
});

describe('saved scenarios parsing', () => {
  it('keeps valid entries and drops malformed data', () => {
    expect(parseSavedScenarios('not json')).toEqual([]);
    expect(
      parseSavedScenarios('[{"id":"a","name":"X"},42,{"id":1}]'),
    ).toHaveLength(1);
  });
});

describe('vulnerable buildings', () => {
  it('classifies schools, hospitals and care homes from tags', () => {
    expect(vulnerableKindFor({ amenity: 'school' })).toBe('school');
    expect(vulnerableKindFor({ building: 'hospital' })).toBe('hospital');
    expect(vulnerableKindFor({ amenity: 'nursing_home' })).toBe('care-home');
    expect(vulnerableKindFor({ building: 'yes' })).toBeUndefined();
  });
});
