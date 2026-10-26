import type { FastifyInstance } from 'fastify';
import { citySchema, demoCity, idParamsSchema } from '@simulicity/shared';
import { ApiError } from '../../common/errors';

export function registerCityRoutes(app: FastifyInstance): void {
  app.get('/api/v1/cities', () => [citySchema.parse(demoCity)]);
  app.get('/api/v1/cities/:id', (request) => {
    const { id } = idParamsSchema.parse(request.params);
    if (id !== demoCity.id)
      throw new ApiError(
        404,
        'NOT_FOUND',
        'City not found in the local demo catalog.',
      );
    return citySchema.parse(demoCity);
  });
}
