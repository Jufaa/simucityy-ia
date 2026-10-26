import type { FastifyInstance } from 'fastify';
import { createSimulationSchema, idParamsSchema } from '@simulicity/shared';
import { unavailable } from '../../common/errors';

export function registerSimulationRoutes(app: FastifyInstance): void {
  app.post('/api/v1/simulations', (request) => {
    createSimulationSchema.parse(request.body);
    return unavailable('Remote simulation execution');
  });
  app.get('/api/v1/simulations/:id', (request) => {
    idParamsSchema.parse(request.params);
    return unavailable('Simulation run storage');
  });
}
