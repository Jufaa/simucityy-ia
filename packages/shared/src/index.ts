import { z } from 'zod';

// Geographic coordinates are degrees, [longitude, latitude], WGS84 (EPSG:4326).
export const geographicSchema = z.object({
  crs: z.literal('EPSG:4326'),
  longitude: z.number().finite().min(-180).max(180),
  latitude: z.number().finite().min(-90).max(90),
});
export type GeographicCoordinate = z.infer<typeof geographicSchema>;
// Local tangent plane: metres, x east, y north, z up relative to scenario origin.
export const localCoordinateSchema = z.object({
  crs: z.literal('local-meters'),
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});
export type LocalCoordinate = z.infer<typeof localCoordinateSchema>;
export const provenanceSchema = z.object({
  kind: z.enum(['observed', 'derived', 'synthetic']),
  source: z.string().min(1),
  license: z.string().min(1),
  notes: z.string().optional(),
});
export type Provenance = z.infer<typeof provenanceSchema>;
const base = { id: z.string().min(1), provenance: provenanceSchema };
export const citySchema = z.object({
  ...base,
  name: z.string().min(1),
  country: z.string().min(1),
  center: geographicSchema,
});
export type City = z.infer<typeof citySchema>;
export const buildingSchema = z.object({
  ...base,
  footprint: z.array(geographicSchema).min(4),
  heightMeters: z.number().nonnegative().nullable(),
  heightProvenance: provenanceSchema.nullable(),
  occupancy: z.number().int().nonnegative().nullable(),
  occupancyProvenance: provenanceSchema.nullable(),
});
export type Building = z.infer<typeof buildingSchema>;
export const roadSchema = z.object({
  ...base,
  geometry: z.array(geographicSchema).min(2),
  blocked: z.boolean(),
});
export type Road = z.infer<typeof roadSchema>;
export const terrainSchema = z.object({
  ...base,
  position: geographicSchema,
  elevationMeters: z.number().finite().nullable(),
  verticalDatum: z.string().nullable(),
});
export type Terrain = z.infer<typeof terrainSchema>;
export const citizenSchema = z.object({
  ...base,
  position: localCoordinateSchema,
  status: z.enum(['idle', 'evacuating', 'sheltered']),
});
export type Citizen = z.infer<typeof citizenSchema>;
export const shelterSchema = z.object({
  ...base,
  position: geographicSchema,
  capacity: z.number().int().nonnegative(),
});
export type Shelter = z.infer<typeof shelterSchema>;
export const hazardKindSchema = z.enum([
  'flood',
  'earthquake',
  'fire',
  'tornado',
]);
export const hazardSchema = z.object({
  ...base,
  kind: hazardKindSchema,
  enabled: z.boolean(),
});
export type Hazard = z.infer<typeof hazardSchema>;
export const scenarioSchema = z.object({
  ...base,
  name: z.string().min(1).max(120),
  cityId: z.string().min(1),
  origin: geographicSchema,
  seed: z.number().int().min(0).max(4294967295),
  hazards: z.array(hazardSchema),
  demo: z.boolean(),
});
export type Scenario = z.infer<typeof scenarioSchema>;
export const simulationMetricsSchema = z.object({
  elapsedSeconds: z.number().nonnegative(),
  steps: z.number().int().nonnegative(),
  populationCount: z.number().int().nonnegative(),
  buildingCount: z.number().int().nonnegative(),
  affectedBuildings: z.number().int().nonnegative().nullable(),
  evacuatedPeople: z.number().int().nonnegative().nullable(),
});
export type SimulationMetrics = z.infer<typeof simulationMetricsSchema>;
export const simulationRunSchema = z.object({
  id: z.string(),
  scenarioId: z.string(),
  status: z.enum(['ready', 'running', 'paused']),
  metrics: simulationMetricsSchema,
});
export type SimulationRun = z.infer<typeof simulationRunSchema>;
export const aiInterventionSchema = z.object({
  id: z.string(),
  scenarioId: z.string(),
  description: z.string(),
  tool: z.string(),
  status: z.enum(['proposed', 'approved', 'rejected']),
});
export type AIIntervention = z.infer<typeof aiInterventionSchema>;
export const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('simulicity-api'),
  version: z.string(),
});
export type Health = z.infer<typeof healthSchema>;
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
export const idParamsSchema = z.object({ id: z.string().min(1).max(100) });
export const createScenarioSchema = scenarioSchema.omit({
  id: true,
  provenance: true,
  demo: true,
});
export const createSimulationSchema = z
  .object({ scenarioId: z.string().min(1) })
  .strict();
export const analyzeSchema = z
  .object({
    scenarioId: z.string().min(1),
    question: z.string().min(1).max(2000),
  })
  .strict();

export const demoProvenance: Provenance = {
  kind: 'synthetic',
  source: 'Simulicity IA hand-authored demo',
  license: 'CC0-1.0',
  notes: 'Not imported or measured. Never use for emergency planning.',
};
export const demoCity: City = citySchema.parse({
  id: 'miami-demo',
  name: 'Miami',
  country: 'United States',
  center: { crs: 'EPSG:4326', longitude: -80.1918, latitude: 25.7617 },
  provenance: demoProvenance,
});
export const demoScenario: Scenario = scenarioSchema.parse({
  id: 'miami-empty-demo',
  name: 'Miami · empty demo',
  cityId: demoCity.id,
  origin: demoCity.center,
  seed: 42,
  hazards: [],
  demo: true,
  provenance: demoProvenance,
});
