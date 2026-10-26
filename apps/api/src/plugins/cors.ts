import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import type { ApiConfig } from '../config/env';
import { ApiError } from '../common/errors';

export function registerCors(app: FastifyInstance, config: ApiConfig): void {
  app.register(cors, {
    origin(origin, callback) {
      if (origin === undefined || config.corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(
          new ApiError(
            403,
            'ORIGIN_NOT_ALLOWED',
            'Browser origin is not allowed.',
          ),
          false,
        );
      }
    },
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    maxAge: 600,
  });
}
