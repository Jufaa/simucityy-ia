/** One sampled frame of a running simulation, for the event timeline. */
export interface EventSample {
  elapsedSeconds: number;
  maxWaterDepthInMeters: number;
  blockedRoads: number;
  exposedBuildings: number;
  evacuated: number;
  trapped: number;
  totalCitizens: number;
}

export interface TimelineEvent {
  atSeconds: number;
  text: string;
}

const minute = (seconds: number) => `min ${Math.floor(seconds / 60)}`;

const TEXTS = {
  en: {
    water: 'Water appears in the streets',
    blocked: 'First street blocked',
    exposed: 'First building exposed to water',
    trapped: 'First person trapped',
    evacuated: (percent: number) => `${percent}% of people evacuated`,
  },
  es: {
    water: 'Aparece el agua en las calles',
    blocked: 'Primera calle bloqueada',
    exposed: 'Primer edificio expuesto al agua',
    trapped: 'Primera persona atrapada',
    evacuated: (percent: number) => `${percent}% de las personas evacuadas`,
  },
} as const;

/**
 * Derives the readable event timeline from sampled frames: first water,
 * first blocked road, exposure thresholds, evacuation milestones and the
 * first trapped citizen. Pure and deterministic over the samples given.
 */
export function buildEventLog(
  samples: readonly EventSample[],
  language: 'en' | 'es' = 'es',
): TimelineEvent[] {
  const texts = TEXTS[language];
  const events: TimelineEvent[] = [];
  const seen = new Set<string>();
  const push = (key: string, atSeconds: number, text: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    events.push({ atSeconds, text: `${minute(atSeconds)} — ${text}` });
  };
  const ordered = [...samples].sort(
    (a, b) => a.elapsedSeconds - b.elapsedSeconds,
  );
  for (const sample of ordered) {
    if (sample.maxWaterDepthInMeters > 0.01)
      push('water', sample.elapsedSeconds, texts.water);
    if (sample.blockedRoads > 0)
      push('blocked', sample.elapsedSeconds, texts.blocked);
    if (sample.exposedBuildings > 0)
      push('exposed', sample.elapsedSeconds, texts.exposed);
    if (sample.trapped > 0)
      push('trapped', sample.elapsedSeconds, texts.trapped);
    if (sample.totalCitizens > 0) {
      const ratio = sample.evacuated / sample.totalCitizens;
      for (const step of [0.25, 0.5, 0.75, 1]) {
        if (ratio >= step)
          push(
            `evac-${step}`,
            sample.elapsedSeconds,
            texts.evacuated(Math.round(step * 100)),
          );
      }
    }
  }
  return events;
}
