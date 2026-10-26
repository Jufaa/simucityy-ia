import type { FastifyInstance } from 'fastify';
import {
  createScenarioSchema,
  demoScenario,
  scenarioSchema,
} from '@simulicity/shared';
import { unavailable } from '../../common/errors';

export function registerScenarioRoutes(app: FastifyInstance): void {
  app.get('/api/v1/scenarios', () => [scenarioSchema.parse(demoScenario)]);
  app.post('/api/v1/scenarios', (request) => {
    createScenarioSchema.parse(request.body);
    return unavailable('Scenario persistence');
  });
}
