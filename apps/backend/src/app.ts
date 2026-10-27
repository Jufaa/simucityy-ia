import Fastify from 'fastify';
import { healthSchema } from '@simulicity/shared';
import { registerErrorHandlers } from './common/errors';
import { loadConfig, type ApiConfig } from './config/env';
import { registerCors } from './plugins/cors';

export function buildApp(config: ApiConfig = loadConfig(process.env)) {
  const app = Fastify({
    bodyLimit: 64 * 1024,
    logger:
      config.logLevel === 'silent'
        ? false
        : {
            level: config.logLevel,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
                'body.apiKey',
                'body.api_key',
                'body.token',
              ],
              censor: '[REDACTED]',
            },
            serializers: {
              req(request) {
                return {
                  method: request.method,
                  url: request.url.split('?')[0] ?? '',
                  hostname: request.hostname,
                };
              },
            },
          },
  });
  registerErrorHandlers(app);
  registerCors(app, config);
  app.get('/health', () =>
    healthSchema.parse({
      status: 'ok',
      service: 'simulicity-api',
      version: '0.1.0',
    }),
  );
  return app;
}
