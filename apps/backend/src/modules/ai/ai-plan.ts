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

/** What the simulator knows about one citizen; the model may only narrate these facts. */
export const citizenContextSchema = z.strictObject({
  status: z.enum(['waiting', 'evacuating', 'evacuated', 'stranded', 'trapped']),
  hazardKind: z.string().min(1).max(40),
  shelterAssigned: z.boolean(),
  elapsedMinutes: z.number().min(0).max(10080),
});

export type CitizenContext = z.infer<typeof citizenContextSchema>;

export const citizenReplySchema = z.strictObject({
  text: z.string().min(1).max(600),
});

export type CitizenReply = z.infer<typeof citizenReplySchema>;

/** Measured outcome handed to the report writer; never model-invented. */
export const reportContextSchema = z.strictObject({
  zoneLabel: z.string().min(1).max(120),
  hazardLabel: z.string().min(1).max(80),
  score: z.number().int().min(0).max(100),
  evacuated: z.number().int().nonnegative(),
  totalPeople: z.number().int().nonnegative(),
  trapped: z.number().int().nonnegative(),
  exposedBuildings: z.number().int().nonnegative(),
  damagedBuildings: z.number().int().nonnegative(),
  maxWaterDepthInMeters: z.number().nonnegative(),
  recommendations: z.array(z.string().min(1).max(240)).max(8),
});

export type ReportContext = z.infer<typeof reportContextSchema>;

export const emergencyReportSchema = z.strictObject({
  report: z.string().min(1).max(3000),
});

export type EmergencyReport = z.infer<typeof emergencyReportSchema>;
