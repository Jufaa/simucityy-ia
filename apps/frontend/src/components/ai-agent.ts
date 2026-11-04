/** Intervention agent client: the model proposes bounded levers, the simulator measures. */
export interface InterventionMetrics {
  evacuated: number;
  trapped: number;
  exposedBuildings: number;
  blockedRoadsPeak: number;
  maxWaterDepthInMeters: number;
}

export interface InterventionContext {
  hazardKind: string;
  objective: string;
  iteration: number;
  before: InterventionMetrics;
  after: InterventionMetrics | null;
  vulnerableExposed: number;
  vulnerableTotal: number;
  shelterOccupancy: number;
  shelterCapacity: number;
  currentDrains: number;
}

export interface InterventionPlan {
  drains: number;
  earlyWarning: boolean;
  reinforcement: boolean;
  done: boolean;
  rationale: string;
}

export interface InterventionResult extends InterventionPlan {
  source: 'meta' | 'fallback';
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

/**
 * Deterministic no-AI proposal derived only from measured metrics.
 * Used whenever the Meta API is unreachable so the demo never breaks.
 */
export function fallbackIntervention(
  context: InterventionContext,
): InterventionResult {
  const { before, after } = context;
  const measured = after ?? before;
  return {
    drains: Math.min(12, context.currentDrains + 4),
    earlyWarning: measured.trapped > 0,
    reinforcement: measured.exposedBuildings > 10,
    done: context.iteration >= 3,
    source: 'fallback',
    rationale: `Sin IA (respaldo local): con ${before.exposedBuildings} edificios expuestos, ${before.trapped} personas atrapadas y ${(before.maxWaterDepthInMeters * 100).toFixed(0)} cm de agua maxima medidos, se proponen hasta ${Math.min(12, context.currentDrains + 4)} drenajes en los puntos mas bajos.`,
  };
}

export async function requestInterventions(
  context: InterventionContext,
): Promise<InterventionResult> {
  try {
    const response = await fetch(`${API_URL}/ai/interventions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { plan: InterventionPlan };
    return { ...data.plan, source: 'meta' };
  } catch {
    return fallbackIntervention(context);
  }
}
