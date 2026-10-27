//TODO: qedo de antes esto es importante

import { afterEach, describe, expect, it } from 'vitest';
import { healthSchema } from '@simulicity/shared';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
import { loadConfig } from './config/env';

const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

const apps: FastifyInstance[] = [];
function makeApp() {
  const app = buildApp(loadConfig({ LOG_LEVEL: 'silent' }));
  apps.push(app);
  return app;
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('API foundation', () => {
  it('reports liveness without a database or model key', async () => {
    const response = await makeApp().inject('/health');
    expect(response.statusCode).toBe(200);
    expect(healthSchema.parse(response.json())).toEqual({
      status: 'ok',
      service: 'simulicity-api',
      version: '0.1.0',
    });
  });
  it.each([
    { method: 'GET' as const, url: '/api/v1/cities' },
    { method: 'GET' as const, url: '/api/v1/cities/miami-demo' },
    { method: 'GET' as const, url: '/api/v1/scenarios' },
    { method: 'POST' as const, url: '/api/v1/scenarios', payload: {} },
    { method: 'POST' as const, url: '/api/v1/simulations', payload: {} },
    { method: 'GET' as const, url: '/api/v1/simulations/future-run' },
    { method: 'POST' as const, url: '/api/v1/ai/analyze', payload: {} },
  ])('does not register a product route: $method $url', async (request) => {
    const response = await makeApp().inject(request);
    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Route not found.',
      requestId: expect.any(String),
    });
  });
  it('returns a consistent not-found error', async () => {
    const app = makeApp();
    for (const url of ['/api/v1/cities/unknown', '/missing']) {
      const response = await app.inject(url);
      expect(response.statusCode).toBe(404);
      expect(apiErrorSchema.parse(response.json()).error.code).toBe(
        'NOT_FOUND',
      );
    }
  });
  it('keeps basic request validation errors', async () => {
    const app = makeApp();
    app.post('/test-input', (request) =>
      z.object({ name: z.string() }).parse(request.body),
    );
    const response = await app.inject({
      method: 'POST',
      url: '/test-input',
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe(
      'VALIDATION_ERROR',
    );
  });
  it('permits only configured browser origins', async () => {
    const app = makeApp();
    const allowed = await app.inject({
      url: '/health',
      headers: { origin: 'http://localhost:3000' },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    const denied = await app.inject({
      url: '/health',
      headers: { origin: 'https://untrusted.example' },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    expect(apiErrorSchema.parse(denied.json()).error.code).toBe(
      'ORIGIN_NOT_ALLOWED',
    );
  });
  it('supports permitted preflight requests without browser credentials', async () => {
    const response = await makeApp().inject({
      method: 'OPTIONS',
      url: '/health',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'POST',
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(
      response.headers['access-control-allow-credentials'],
    ).toBeUndefined();
  });
  it('returns consistent malformed JSON and payload limit errors', async () => {
    const app = makeApp();
    app.post('/test-input', () => ({ ok: true }));
    const malformed = await app.inject({
      method: 'POST',
      url: '/test-input',
      headers: { 'content-type': 'application/json' },
      payload: '{',
    });
    expect(malformed.statusCode).toBe(400);
    expect(apiErrorSchema.parse(malformed.json()).error.code).toBe(
      'BAD_REQUEST',
    );
    const large = await app.inject({
      method: 'POST',
      url: '/test-input',
      payload: { scenarioId: 'demo', question: 'x'.repeat(66000) },
    });
    expect(large.statusCode).toBe(413);
    expect(apiErrorSchema.parse(large.json()).error.code).toBe(
      'PAYLOAD_TOO_LARGE',
    );
  });
  it('does not leak internal error messages', async () => {
    const app = makeApp();
    app.get('/test-failure', () => {
      throw new Error('secret-internal-detail');
    });
    const response = await app.inject('/test-failure');
    expect(response.statusCode).toBe(500);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe(
      'INTERNAL_ERROR',
    );
    expect(response.body).not.toContain('secret-internal-detail');
  });
});

describe('API configuration', () => {
  it('works without optional integrations', () => {
    expect(loadConfig({})).toMatchObject({ host: '127.0.0.1', port: 4000 });
  });
  it('rejects wildcard, credentials, paths and non-HTTP browser origins', () => {
    for (const origin of [
      '*',
      'null',
      'http://user:password@example.com',
      'http://example.com/path',
      'file:///tmp/app',
      'https://example.com/',
    ]) {
      expect(() => loadConfig({ CORS_ORIGINS: origin })).toThrow(
        'Invalid API configuration',
      );
    }
  });
  it('validates port and log level without printing values', () => {
    expect(() => loadConfig({ PORT: 'secret-invalid-port' })).toThrow(
      'Invalid API configuration',
    );
    expect(() => loadConfig({ LOG_LEVEL: 'secret-invalid-level' })).toThrow(
      'Invalid API configuration',
    );
    try {
      loadConfig({ PORT: 'secret-invalid-port' });
    } catch (error) {
      expect(String(error)).not.toContain('secret-invalid-port');
    }
  });
});
