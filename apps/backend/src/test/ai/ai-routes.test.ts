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
  explainCitizen: vi.fn(async () => ({ text: 'Estoy evacuando.' })),
  writeEmergencyReport: vi.fn(async () => ({ report: 'Informe medido.' })),
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

describe('POST /ai/citizen and /ai/report', () => {
  const citizen = {
    status: 'evacuating',
    hazardKind: 'tsunami',
    shelterAssigned: true,
    elapsedMinutes: 5,
  };
  it('returns 503 without a key and the narration with the server key', async () => {
    const noKey = await makeApp().inject({
      method: 'POST',
      url: '/ai/citizen',
      payload: { context: citizen },
    });
    expect(noKey.statusCode).toBe(503);
    const ok = await makeApp({ META_API_KEY: 'LLM_test_key' }).inject({
      method: 'POST',
      url: '/ai/citizen',
      payload: { context: citizen },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().reply.text).toContain('evacuando');
  });
  it('rejects invalid citizen status and writes a measured report', async () => {
    const bad = await makeApp({ META_API_KEY: 'LLM_test_key' }).inject({
      method: 'POST',
      url: '/ai/citizen',
      payload: { context: { ...citizen, status: 'flying' } },
    });
    expect(bad.statusCode).toBe(400);
    const report = await makeApp({ META_API_KEY: 'LLM_test_key' }).inject({
      method: 'POST',
      url: '/ai/report',
      payload: {
        context: {
          zoneLabel: 'Distrito',
          hazardLabel: 'tsunami',
          score: 82,
          evacuated: 90,
          totalPeople: 100,
          trapped: 0,
          exposedBuildings: 3,
          damagedBuildings: 1,
          maxWaterDepthInMeters: 0.4,
          recommendations: ['Mas drenajes'],
        },
      },
    });
    expect(report.statusCode).toBe(200);
    expect(report.json().report).toContain('Informe');
  });
});

describe('security hardening', () => {
  it('hides BYOK key management while BYOK is disabled (default)', async () => {
    const app = makeApp({ META_API_KEY: 'LLM_test_key' });
    const save = await app.inject({
      method: 'POST',
      url: '/ai/keys',
      payload: { userId: 'someone', apiKey: 'LLM_test_key' },
    });
    expect(save.statusCode).toBe(404);
    const del = await app.inject({ method: 'DELETE', url: '/ai/keys/someone' });
    expect(del.statusCode).toBe(404);
    const chat = await app.inject({
      method: 'POST',
      url: '/ai/chat',
      payload: { userId: 'someone', mode: 'auto', prompt: 'hola' },
    });
    expect(chat.statusCode).toBe(404);
  });

  it('does not echo provider details on validation errors', async () => {
    const res = await makeApp({ META_API_KEY: 'LLM_test_key' }).inject({
      method: 'POST',
      url: '/ai/interventions',
      payload: { context: { hazardKind: 'rain' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain('issues');
  });

  it('rate-limits AI routes per client', async () => {
    const app = makeApp();
    let lastStatus = 0;
    for (let index = 0; index < 31; index++) {
      const res = await app.inject({
        method: 'POST',
        url: '/ai/city-plan',
        payload: { description: 'ciudad con rio' },
      });
      lastStatus = res.statusCode;
    }
    expect(lastStatus).toBe(429);
  });

  it('sends baseline security headers', async () => {
    const res = await makeApp().inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });
});

describe('inference provider configuration', () => {
  it('routes the server key to a configured OpenAI-compatible provider', async () => {
    const { proposeCityPlan } = await import('../../modules/ai/service');
    const res = await makeApp({
      AI_API_KEY: 'provider-key',
      AI_BASE_URL: 'https://provider.example/v1',
      AI_MODEL: 'llama-test',
    }).inject({
      method: 'POST',
      url: '/ai/city-plan',
      payload: { description: 'ciudad con rio' },
    });
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(proposeCityPlan)).toHaveBeenLastCalledWith(
      'ciudad con rio',
      {
        userKey: 'provider-key',
        baseUrl: 'https://provider.example/v1',
        model: 'llama-test',
      },
    );
  });
});
