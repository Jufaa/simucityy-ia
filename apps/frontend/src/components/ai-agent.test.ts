import { describe, expect, it } from 'vitest';
import { fallbackIntervention, type InterventionContext } from './ai-agent';

const ctx: InterventionContext = {
  hazardKind: 'rain',
  objective: 'Reducir edificios expuestos y personas atrapadas',
  iteration: 1,
  before: {
    evacuated: 10,
    trapped: 2,
    exposedBuildings: 20,
    blockedRoadsPeak: 5,
    maxWaterDepthInMeters: 0.4,
  },
  after: null,
  vulnerableExposed: 3,
  vulnerableTotal: 8,
  shelterOccupancy: 10,
  shelterCapacity: 100,
  currentDrains: 0,
};

describe('fallbackIntervention', () => {
  it('is deterministic, bounded and cites measured numbers', () => {
    const a = fallbackIntervention(ctx);
    expect(a).toEqual(fallbackIntervention(ctx));
    expect(a.source).toBe('fallback');
    expect(a.drains).toBeGreaterThan(0);
    expect(a.drains).toBeLessThanOrEqual(12);
    expect(a.rationale).toContain('20');
  });
  it('never exceeds the drain cap when drains already exist', () => {
    expect(
      fallbackIntervention({ ...ctx, currentDrains: 11 }).drains,
    ).toBeLessThanOrEqual(12);
  });
  it('stops at the third iteration', () => {
    expect(fallbackIntervention({ ...ctx, iteration: 3 }).done).toBe(true);
  });
});

import { vi } from 'vitest';
import { requestInterventions } from './ai-agent';

it('posts the measured context wrapped as { context } for the backend schema', async () => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: true,
    json: async () => ({
      plan: {
        drains: 4,
        earlyWarning: false,
        reinforcement: false,
        done: false,
        rationale: 'ok',
      },
    }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  try {
    const result = await requestInterventions(ctx);
    expect(result.source).toBe('meta');
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body).toEqual({ context: ctx });
  } finally {
    vi.unstubAllGlobals();
  }
});
