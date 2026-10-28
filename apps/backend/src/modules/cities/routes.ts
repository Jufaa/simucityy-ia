import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../common/errors';
import { cityScenarioConfigSchema, terrainSchema } from './city.schema';
import { generateCityScenario } from './city-scenario-generator';

const fields = cityScenarioConfigSchema.shape;
const generationRequestSchema = z.strictObject({
  layout: z.enum(['grid', 'district']).optional(),
  detailLevel: z.enum(['basic', 'urban']).optional(),
  config: z.strictObject({
    widthInMeters: fields.widthInMeters,
    heightInMeters: fields.heightInMeters,
    streetSpacingInMeters: fields.streetSpacingInMeters,
    seed: fields.seed.optional(),
  }),
  terrain: terrainSchema,
  buildingMarginInMeters: fields.buildingMarginInMeters.optional(),
  minBuildingHeightInMeters: fields.minBuildingHeightInMeters.optional(),
  maxBuildingHeightInMeters: fields.maxBuildingHeightInMeters.optional(),
  terrainCellSizeInMeters: fields.terrainCellSizeInMeters.optional(),
  populationCount: fields.populationCount.optional(),
});

export function registerCityRoutes(app: FastifyInstance): void {
  app.post('/api/v1/cities/generate', async (request, reply) => {
    const input = generationRequestSchema.parse(request.body);
    const options: Parameters<typeof generateCityScenario>[0] = {
      config: { ...input.config, seed: input.config.seed ?? 1 },
      terrain: input.terrain,
    };
    if (input.layout !== undefined) options.layout = input.layout;
    if (input.detailLevel !== undefined)
      options.detailLevel = input.detailLevel;
    for (const field of [
      'buildingMarginInMeters',
      'minBuildingHeightInMeters',
      'maxBuildingHeightInMeters',
      'terrainCellSizeInMeters',
      'populationCount',
    ] as const) {
      const value = input[field];
      if (value !== undefined) options[field] = value;
    }
    try {
      const scenario = generateCityScenario(options);
      return reply.header('Cache-Control', 'no-store').code(200).send(scenario);
    } catch (error) {
      if (error instanceof RangeError) {
        const failure = new ApiError(
          400,
          'INVALID_CITY_CONFIGURATION',
          error.message,
        );
        failure.cause = error;
        throw failure;
      }
      throw error;
    }
  });
}
