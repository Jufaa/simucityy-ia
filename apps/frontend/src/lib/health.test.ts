import { describe, expect, it, vi } from 'vitest';
import { checkApiHealth } from './health';

const health = { status: 'ok', service: 'simulicity-api', version: '0.1.0' };

describe('Next.js to Fastify health communication', () => {
  it('returns only a validated health response', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ ...health, privateValue: 'never forward' }),
      );
    const response = await checkApiHealth(fetcher, 'http://127.0.0.1:4000');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(health);
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:4000/health',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });
  it.each([
    () => Promise.reject(new Error('connection refused')),
    () => Promise.resolve(Response.json({ status: 'not the API contract' })),
    () => Promise.resolve(new Response('unavailable', { status: 503 })),
  ])(
    'reports unavailable backends without leaking their response',
    async (fetcher) => {
      const response = await checkApiHealth(fetcher, 'http://127.0.0.1:4000');
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        error: {
          code: 'API_UNAVAILABLE',
          message: 'The API health check is unavailable.',
        },
      });
    },
  );
  it('rejects invalid server configuration without making a request', async () => {
    const fetcher = vi.fn();
    const response = await checkApiHealth(fetcher, 'file:///etc/passwd');
    expect(response.status).toBe(502);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
