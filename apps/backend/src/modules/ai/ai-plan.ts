import { z } from 'zod';

/**
 * Structured plans the Meta model may propose. Bounds mirror exactly what
 * the procedural generators accept (frontend RandomCityProfile and the
 * DistrictSimulation intervention limits): the model proposes, these
 * schemas decide what is buildable, and anything else is rejected.
 */
export const aiCityPlanSchema = z.strictObject({
  name: z.string().min(1).max(80),
  summary: z.string().min(1).max(400),
  seed: z.number().int().min(0).max(4294967295),
  mode: z.enum(['district', 'city']),
  profile: z.strictObject({
    buildingTarget: z.number().int().min(110).max(190),
    parkTarget: z.number().int().min(2).max(7),
    heightScale: z.number().min(0.65).max(1.4),
    lakeScale: z.number().min(0.8).max(1.1),
    riverWidthScale: z.number().min(0.8).max(1.15),
  }),
});

export type AiCityPlan = z.infer<typeof aiCityPlanSchema>;

export function parseAiCityPlan(raw: unknown): AiCityPlan {
  return aiCityPlanSchema.parse(raw);
}

/** One agent iteration: bounded levers the simulator already supports. */
export const interventionPlanSchema = z.strictObject({
  /** Extra drains placed automatically on the lowest terrain cells. */
  drains: z.number().int().min(0).max(12),
  earlyWarning: z.boolean(),
  reinforcement: z.boolean(),
  /** True when measured results are good enough; stops the loop. */
  done: z.boolean(),
  rationale: z.string().min(1).max(600),
});

export type InterventionPlan = z.infer<typeof interventionPlanSchema>;

export function parseInterventionPlan(raw: unknown): InterventionPlan {
  return interventionPlanSchema.parse(raw);
}

/** Measured simulator state handed to the agent; never model-invented. */
export const interventionContextSchema = z.strictObject({
  hazardKind: z.string().min(1).max(40),
  objective: z.string().min(1).max(200),
  iteration: z.number().int().min(1).max(3),
  before: z.strictObject({
    evacuated: z.number().int().nonnegative(),
    trapped: z.number().int().nonnegative(),
    exposedBuildings: z.number().int().nonnegative(),
    blockedRoadsPeak: z.number().int().nonnegative(),
    maxWaterDepthInMeters: z.number().nonnegative(),
  }),
  after: z
    .strictObject({
      evacuated: z.number().int().nonnegative(),
      trapped: z.number().int().nonnegative(),
      exposedBuildings: z.number().int().nonnegative(),
      blockedRoadsPeak: z.number().int().nonnegative(),
      maxWaterDepthInMeters: z.number().nonnegative(),
    })
    .nullable(),
  vulnerableExposed: z.number().int().nonnegative(),
  vulnerableTotal: z.number().int().nonnegative(),
  shelterOccupancy: z.number().int().nonnegative(),
  shelterCapacity: z.number().int().nonnegative(),
  currentDrains: z.number().int().min(0).max(12),
});

export type InterventionContext = z.infer<typeof interventionContextSchema>;
