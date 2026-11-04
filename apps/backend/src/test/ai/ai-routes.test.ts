import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('../../modules/ai/service', () => ({
  runAi: vi.fn(),
  proposeCityPlan: vi.fn(async () => ({
    name: 'Ciudad del rio',
    summary: 'Rio central.',
    seed: 42,
    mode: 'district',
    profile: {
      buildingTarget: 150,
      parkTarget: 4,
      heightScale: 0.8,
      lakeScale: 0.9,
      riverWidthScale: 1.1,
    },
  })),
  proposeInterventions: vi.fn(async () => ({
    drains: 6,
    earlyWarning: true,
    reinforcement: false,
    done: false,
    rationale: 'Mas drenajes.',
  })),
}));

import { buildApp } from '../../app';
import { loadConfig } from '../../config/env';

const apps: FastifyInstance[] = [];
function makeApp(env: Record<string, string> = {}) {
  const app = buildApp(
    loadConfig({
      LOG_LEVEL: 'silent',
      BYOK_MASTER_KEY: '00'.repeat(32),
      ...env,
    }),
  );
  apps.push(app);
  return app;
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('POST /ai/city-plan', () => {
  it('returns 503 when no key is configured', async () => {
    const res = await makeApp().inject({
      method: 'POST',
      url: '/ai/city-plan',
      payload: { description: 'ciudad con rio' },
    });
    expect(res.statusCode).toBe(503);
  });

  it('uses the server Meta key and returns the plan', async () => {
    const res = await makeApp({ META_API_KEY: 'LLM_test_key' }).inject({
      method: 'POST',
      url: '/ai/city-plan',
      payload: { description: 'ciudad con rio' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().plan.profile.buildingTarget).toBe(150);
  });
});

describe('POST /ai/interventions', () => {
  it('rejects invalid measured context', async () => {
    const res = await makeApp({ META_API_KEY: 'LLM_test_key' }).inject({
      method: 'POST',
      url: '/ai/interventions',
      payload: { context: { hazardKind: 'rain' } },
    });
    expect(res.statusCode).toBe(400);
  });
});
