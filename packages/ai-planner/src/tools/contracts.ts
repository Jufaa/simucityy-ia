import { z } from 'zod';
import {
  geographicSchema,
  simulationMetricsSchema,
  citySchema,
  roadSchema,
  scenarioSchema,
} from '@simulicity/shared';
const id = z.string().min(1).max(100);
const scenario = z.object({ scenarioId: id }).strict();
// Tool contracts only: dispatch requires an approved implementation injected by the backend.
export const toolCallSchema = z.discriminatedUnion('name', [
  z
    .object({
      name: z.literal('getCityState'),
      arguments: z.object({ cityId: id }).strict(),
    })
    .strict(),
  z
    .object({ name: z.literal('getSimulationMetrics'), arguments: scenario })
    .strict(),
  z
    .object({ name: z.literal('getBlockedRoads'), arguments: scenario })
    .strict(),
  z
    .object({
      name: z.literal('createScenarioVariant'),
      arguments: z
        .object({ scenarioId: id, name: z.string().min(1).max(120) })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal('addShelter'),
      arguments: z
        .object({
          scenarioId: id,
          position: geographicSchema,
          capacity: z.number().int().min(1).max(100000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal('modifyDrainage'),
      arguments: z
        .object({
          scenarioId: id,
          buildingId: id,
          capacityCubicMetersPerSecond: z.number().finite().min(0).max(1000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal('runSimulation'),
      arguments: z
        .object({ scenarioId: id, steps: z.number().int().min(1).max(3600) })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal('compareScenarios'),
      arguments: z.object({ scenarioIds: z.array(id).min(2).max(5) }).strict(),
    })
    .strict(),
]);
export type PlannerToolCall = z.infer<typeof toolCallSchema>;
export function validateToolCall(value: unknown): PlannerToolCall {
  return toolCallSchema.parse(value);
}
export const toolResults = {
  getCityState: citySchema,
  getSimulationMetrics: simulationMetricsSchema,
  getBlockedRoads: z.array(roadSchema),
  createScenarioVariant: scenarioSchema,
};
export interface ToolBudget {
  maxCalls: number;
  maxSimulationSteps: number;
  timeoutMilliseconds: number;
}
export interface ControlledToolExecutor {
  /** Backend must enforce cumulative budget, timeout, cancellation and human approval for mutations. No eval/shell. */
  execute(
    call: PlannerToolCall,
    budget: Readonly<ToolBudget>,
    signal: AbortSignal,
  ): Promise<unknown>;
}
