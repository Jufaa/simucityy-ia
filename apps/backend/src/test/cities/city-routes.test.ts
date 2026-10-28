import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';
import { loadConfig } from '../../config/env';
import { cityScenarioSchema } from '../../modules/cities/city.schema';
import { generateCityScenario } from '../../modules/cities/city-scenario-generator';

// Keep the unrelated Meta/SQLite boundary out of these city HTTP tests.
vi.mock('../../modules/ai/routes', () => ({ registerAiRoutes: vi.fn() }));

const apps: FastifyInstance[] = [];
function makeApp() {
  const app = buildApp(
    loadConfig({ LOG_LEVEL: 'silent', BYOK_MASTER_KEY: '00'.repeat(32) }),
  );
  apps.push(app);
  return app;
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
const payload = {
  config: {
    widthInMeters: 100,
    heightInMeters: 100,
    streetSpacingInMeters: 50,
    seed: 42,
  },
  terrain: { kind: 'flat' as const, elevationInMeters: 0 },
};
const url = '/api/v1/cities/generate';

describe('POST /api/v1/cities/generate', () => {
  it('accepts versioned urban details only on district requests', async () => {
    const app = makeApp();
    const response = await app.inject({
      method: 'POST',
      url,
      payload: { ...payload, layout: 'district', detailLevel: 'urban' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().generatorVersion).toBe('1.2.0');
    expect(response.json().district.urban.amenities.length).toBeGreaterThan(0);
    const invalid = await app.inject({
      method: 'POST',
      url,
      payload: { ...payload, detailLevel: 'urban' },
    });
    expect(invalid.statusCode).toBe(400);
  });
  it('accepts the opt-in district layout while keeping the legacy request supported', async () => {
    const response = await makeApp().inject({
      method: 'POST',
      url,
      payload: { ...payload, layout: 'district' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().config.layout).toBe('district');
    expect(response.json().district.parks.length).toBeGreaterThan(0);
  });
  it('returns the actual validated generator result, deterministically and without caching', async () => {
    const app = makeApp();
    const first = await app.inject({ method: 'POST', url, payload });
    const second = await app.inject({ method: 'POST', url, payload });
    expect(first.statusCode).toBe(200);
    expect(first.headers['content-type']).toContain('application/json');
    expect(first.headers['cache-control']).toBe('no-store');
    expect(cityScenarioSchema.parse(first.json())).toEqual(
      generateCityScenario(payload),
    );
    expect(first.body).toBe(second.body);
  });

  it('accepts custom settings and resolves omitted optional settings', async () => {
    const app = makeApp();
    const custom = await app.inject({
      method: 'POST',
      url,
      payload: {
        ...payload,
        populationCount: 100,
        terrainCellSizeInMeters: 20,
        buildingMarginInMeters: 3,
        minBuildingHeightInMeters: 8,
        maxBuildingHeightInMeters: 20,
      },
    });
    expect(custom.statusCode).toBe(200);
    expect(custom.json().config).toMatchObject({
      populationCount: 100,
      buildingMarginInMeters: 3,
      terrainCellSizeInMeters: 20,
    });
    const defaults = await app.inject({
      method: 'POST',
      url,
      payload: {
        config: {
          widthInMeters: 100,
          heightInMeters: 100,
          streetSpacingInMeters: 50,
        },
        terrain: payload.terrain,
      },
    });
    expect(defaults.statusCode).toBe(200);
    expect(defaults.json().config).toMatchObject({
      seed: 1,
      populationCount: 200,
    });
  });

  it.each([
    {},
    { ...payload, extra: true },
    { ...payload, config: { ...payload.config, widthInMeters: 0 } },
    { ...payload, config: { ...payload.config, seed: -1 } },
    { ...payload, config: { ...payload.config, streetSpacingInMeters: 0 } },
    { ...payload, populationCount: 301 },
    { ...payload, terrain: { kind: 'unknown', elevationInMeters: 0 } },
  ])(
    'rejects invalid request shape or values with the shared error contract',
    async (body) => {
      const response = await makeApp().inject({
        method: 'POST',
        url,
        payload: body,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toMatchObject({
        code: 'VALIDATION_ERROR',
        requestId: expect.any(String),
      });
    },
  );

  it.each([
    { ...payload, buildingMarginInMeters: 25 },
    { ...payload, minBuildingHeightInMeters: 20, maxBuildingHeightInMeters: 5 },
    { ...payload, terrainCellSizeInMeters: 0.001 },
    { ...payload, config: { ...payload.config, widthInMeters: 100000 } },
  ])('maps bounded domain rejections to 400 rather than 500', async (body) => {
    const response = await makeApp().inject({
      method: 'POST',
      url,
      payload: body,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatchObject({
      code: 'INVALID_CITY_CONFIGURATION',
      requestId: expect.any(String),
    });
    expect(response.body).not.toContain('stack');
  });

  it('preserves malformed JSON, payload limits, health, CORS and missing-route behavior', async () => {
    const app = makeApp();
    const malformed = await app.inject({
      method: 'POST',
      url,
      payload: '{',
      headers: { 'content-type': 'application/json' },
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe('BAD_REQUEST');
    const oversized = await app.inject({
      method: 'POST',
      url,
      payload: { ...payload, extra: 'x'.repeat(65536) },
    });
    expect(oversized.statusCode).toBe(413);
    expect(oversized.json().error.code).toBe('PAYLOAD_TOO_LARGE');
    const allowed = await app.inject({
      method: 'POST',
      url,
      payload,
      headers: { origin: 'http://localhost:3000' },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    const blocked = await app.inject({
      method: 'POST',
      url,
      payload,
      headers: { origin: 'https://untrusted.example' },
    });
    expect(blocked.statusCode).toBe(403);
    const health = await app.inject('/health');
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({
      status: 'ok',
      service: 'simulicity-api',
      version: '0.1.0',
    });
    expect((await app.inject('/api/v1/cities')).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
  });
});
