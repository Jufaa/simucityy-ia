import type { FastifyInstance } from 'fastify';
import { analyzeSchema } from '@simulicity/shared';
import { unavailable } from '../../common/errors';

export function registerAiRoutes(app: FastifyInstance): void {
  app.post('/api/v1/ai/analyze', (request) => {
    analyzeSchema.parse(request.body);
    return unavailable('Meta AI analysis');
  });
}
