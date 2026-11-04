import type { RandomCityProfile } from './random-city-profile';
import { createRandomCityProfile } from './random-city-profile';

/** Plan proposed by the Meta model (or the deterministic fallback). */
export interface AiCityPlan {
  name: string;
  summary: string;
  seed: number;
  mode: 'district' | 'city';
  profile: RandomCityProfile;
}

export interface AiCityPlanResult extends AiCityPlan {
  source: 'meta' | 'fallback';
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

/**
 * Deterministic no-AI plan: same text always yields the same city, and
 * obvious cues in the request still shape the profile. Used whenever the
 * Meta API is unreachable so the demo never breaks.
 */
export function fallbackCityPlan(
  description: string,
  seed: number,
): AiCityPlanResult {
  const profile = createRandomCityProfile(seed);
  const text = description.toLowerCase();
  const lowRise = /bajo|bajos|baja|low/.test(text);
  const tall = /alto|altos|torre|rascacielo|skyscraper/.test(text);
  const wideRiver = /rio|rí­o|river/.test(text);
  const manyParks = /parque|verde|park|green/.test(text);
  const dense = /denso|dense|muchos edificios/.test(text);
  return {
    name: 'Ciudad generada sin IA',
    summary:
      'Plan deterministico de respaldo: la IA no respondio y se uso el generador local con la misma semilla.',
    seed,
    mode: /grande|large|ciudad grande/.test(text) ? 'city' : 'district',
    source: 'fallback',
    profile: {
      buildingTarget: dense ? 190 : profile.buildingTarget,
      parkTarget: manyParks ? 7 : profile.parkTarget,
      heightScale: lowRise ? 0.7 : tall ? 1.35 : profile.heightScale,
      lakeScale: profile.lakeScale,
      riverWidthScale: wideRiver ? 1.15 : profile.riverWidthScale,
    },
  };
}

export async function requestAiCityPlan(
  description: string | null,
  seed: number,
): Promise<AiCityPlanResult> {
  try {
    const response = await fetch(`${API_URL}/ai/city-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { plan: AiCityPlan };
    return { ...data.plan, source: 'meta' };
  } catch {
    return fallbackCityPlan(description ?? '', seed);
  }
}
