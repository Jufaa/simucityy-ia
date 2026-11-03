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

/**
 * Derives the readable event timeline from sampled frames: first water,
 * first blocked road, exposure thresholds, evacuation milestones and the
 * first trapped citizen. Pure and deterministic over the samples given.
 */
export function buildEventLog(
  samples: readonly EventSample[],
): TimelineEvent[] {
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
      push('water', sample.elapsedSeconds, 'Aparece el agua en las calles');
    if (sample.blockedRoads > 0)
      push('blocked', sample.elapsedSeconds, 'Primera calle bloqueada');
    if (sample.exposedBuildings > 0)
      push(
        'exposed',
        sample.elapsedSeconds,
        'Primer edificio expuesto al agua',
      );
    if (sample.trapped > 0)
      push('trapped', sample.elapsedSeconds, 'Primera persona atrapada');
    if (sample.totalCitizens > 0) {
      const ratio = sample.evacuated / sample.totalCitizens;
      for (const step of [0.25, 0.5, 0.75, 1]) {
        if (ratio >= step)
          push(
            `evac-${step}`,
            sample.elapsedSeconds,
            `${Math.round(step * 100)}% de las personas evacuadas`,
          );
      }
    }
  }
  return events;
}
