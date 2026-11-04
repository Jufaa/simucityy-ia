import type { FastifyInstance } from 'fastify';

/**
 * Minimal in-memory abuse protection for a demo API that fronts a paid
 * provider. Buckets are per client IP and route class, fixed-window,
 * and reset with the process. Behind a proxy every client shares the
 * proxy IP unless Fastify trustProxy is configured for that deployment;
 * the limits are deliberately generous for a live demo while still
 * stopping scripted draining of the server's Meta key.
 */
const WINDOW_MS = 60_000;

const RULES: { prefix: string; limit: number }[] = [
  { prefix: '/ai/keys', limit: 10 },
  { prefix: '/ai/', limit: 30 },
  { prefix: '/api/v1/cities/generate', limit: 30 },
];

interface Bucket {
  count: number;
  resetAt: number;
}

export function registerSecurity(app: FastifyInstance): void {
  const buckets = new Map<string, Bucket>();

  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'OPTIONS') return;
    const rule = RULES.find((candidate) =>
      request.url.startsWith(candidate.prefix),
    );
    if (!rule) return;
    const now = Date.now();
    if (buckets.size > 10_000) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
    }
    const key = `${request.ip}:${rule.prefix}`;
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return;
    }
    bucket.count += 1;
    if (bucket.count > rule.limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((bucket.resetAt - now) / 1000),
      );
      return reply
        .header('Retry-After', String(retryAfterSeconds))
        .code(429)
        .send({
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Try again in a few seconds.',
            requestId: request.id,
          },
        });
    }
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    return payload;
  });
}
