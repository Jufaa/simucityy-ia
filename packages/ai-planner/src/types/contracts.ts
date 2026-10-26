import type { AIIntervention } from '@simulicity/shared';
export interface PlannerRequest {
  scenarioId: string;
  question: string;
}
export interface PlannerResponse {
  summary: string;
  interventions: AIIntervention[];
}
export interface PlannerProvider {
  readonly available: boolean;
  analyze(request: PlannerRequest): Promise<PlannerResponse>;
}
