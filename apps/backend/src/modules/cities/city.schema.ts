import { z } from 'zod';
import { scenarioIssues } from './scenario-validation';

const identifier = z
  .string()
  .min(1)
  .refine(
    (value) => value === value.trim(),
    'IDs must not contain surrounding whitespace.',
  );

export const pointSchema = z.strictObject({
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
});

export const roadSchema = z.strictObject({
  id: identifier,
  start: pointSchema,
  end: pointSchema,
});

const rectangleSchema = z.strictObject({
  id: identifier,
  minCorner: pointSchema,
  maxCorner: pointSchema,
});

const positiveArea = (rectangle: z.infer<typeof rectangleSchema>) =>
  rectangle.maxCorner.x > rectangle.minCorner.x &&
  rectangle.maxCorner.y > rectangle.minCorner.y;

export const blockSchema = rectangleSchema.refine(positiveArea, {
  message: 'Rectangle must have positive area.',
  path: ['maxCorner'],
});
export const buildingSchema = rectangleSchema
  .extend({
    heightInMeters: z.number().finite().positive(),
    blockId: identifier.optional(),
    parcelId: identifier.optional(),
    use: z.enum(['residential', 'commercial']).optional(),
  })
  .refine(positiveArea, {
    message: 'Rectangle must have positive area.',
    path: ['maxCorner'],
  });

export const cityScenarioConfigSchema = z
  .strictObject({
    layout: z.enum(['grid', 'district']).optional(),
    widthInMeters: z.number().finite().positive(),
    heightInMeters: z.number().finite().positive(),
    streetSpacingInMeters: z.number().finite().positive(),
    seed: z.number().int().min(0).max(4294967295),
    buildingMarginInMeters: z.number().finite().nonnegative(),
    minBuildingHeightInMeters: z.number().finite().positive(),
    maxBuildingHeightInMeters: z.number().finite().positive(),
    terrainCellSizeInMeters: z.number().finite().positive(),
    populationCount: z.number().int().min(0).max(300),
  })
  // agrega una regla entre campos path indica cual debe aparecer señalado cuando falla la validacion
  .refine(
    (config) =>
      config.maxBuildingHeightInMeters >= config.minBuildingHeightInMeters,
    {
      message: 'Maximum building height must be at least the minimum height.',
      path: ['maxBuildingHeightInMeters'],
    },
  );

export const terrainSchema = z.strictObject({
  kind: z.literal('flat'),
  elevationInMeters: z.number().finite(),
});

const id = z
  .string()
  .min(1)
  .refine(
    (value) => value === value.trim(),
    'IDs must not contain surrounding whitespace.',
  );
const roadNodeSchema = pointSchema.extend({ id });
const roadEdgeSchema = z.strictObject({
  id,
  roadId: id,
  from: id,
  to: id,
  lengthInMeters: z.number().finite().positive(),
  bidirectional: z.literal(true),
});

export const cityScenarioSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    generatorVersion: identifier,
    source: z.literal('procedural'),
    config: cityScenarioConfigSchema,
    terrain: terrainSchema,
    roads: z.array(roadSchema).min(1).max(1000),
    blocks: z.array(blockSchema).max(2500),
    buildings: z.array(buildingSchema).max(2500),
    roadGraph: z.strictObject({
      nodes: z.array(roadNodeSchema).min(2).max(12000),
      edges: z.array(roadEdgeSchema).max(24000),
    }),
    buildingAccess: z
      .array(z.strictObject({ buildingId: id, nodeId: id }))
      .max(2500),
    terrainGrid: z.strictObject({
      source: z.literal('synthetic'),
      xCoordinates: z
        .array(z.number().finite().nonnegative())
        .min(2)
        .max(10000),
      yCoordinates: z
        .array(z.number().finite().nonnegative())
        .min(2)
        .max(10000),
      elevationsInMeters: z
        .array(z.array(z.number().finite()).max(10000))
        .max(10000),
    }),
    shelters: z
      .array(
        z.strictObject({
          id,
          nodeId: id,
          capacity: z.number().int().positive(),
          active: z.boolean(),
        }),
      )
      .min(2)
      .max(100),
    citizens: z
      .array(
        z.strictObject({
          id,
          homeBuildingId: id,
          nodeId: id,
          position: pointSchema,
          mobilityFactor: z.number().finite().positive().max(1),
          reactionDelayInSeconds: z.number().finite().nonnegative(),
          status: z.literal('normal'),
        }),
      )
      .max(300),
    district: z
      .strictObject({
        roadWidthInMeters: z.number().finite().positive(),
        sidewalkWidthInMeters: z.number().finite().positive(),
        parcels: z
          .array(
            rectangleSchema
              .extend({
                blockId: identifier,
                kind: z.enum(['residential', 'commercial', 'park']),
              })
              .refine(positiveArea),
          )
          .max(2500),
        parks: z
          .array(
            rectangleSchema
              .extend({ blockId: identifier })
              .refine(positiveArea),
          )
          .max(625),
        sidewalks: z
          .array(
            rectangleSchema
              .extend({ blockId: identifier })
              .refine(positiveArea),
          )
          .max(2500),
      })
      .optional(),
  })
  .strict()
  .superRefine((scenario, context) => {
    for (const message of scenarioIssues(scenario))
      context.addIssue({ code: 'custom', message });
  });
