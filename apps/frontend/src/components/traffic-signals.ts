import type { CityResponse } from './city-types';

export type SignalAxis = 'north-south' | 'east-west';
export type SignalColor = 'red' | 'amber' | 'green';

/** Diagonal approaches use their dominant axis, with a deterministic tie break. */
export const signalAxis = (dx: number, dz: number): SignalAxis =>
  Math.abs(dx) >= Math.abs(dz) ? 'east-west' : 'north-south';

/** A bounded 28-second cycle with two-second amber and all-red clearance. */
export function signalStateAt(
  nodeId: string,
  elapsedSeconds: number,
  seed = 1,
): Readonly<Record<SignalAxis, SignalColor>> {
  let hash = seed >>> 0;
  for (let i = 0; i < nodeId.length; i++)
    hash = Math.imul(hash ^ nodeId.charCodeAt(i), 16777619) >>> 0;
  const time = Number.isFinite(elapsedSeconds)
    ? Math.max(0, elapsedSeconds)
    : 0;
  const phase = (time + (hash % 28)) % 28;
  return {
    'north-south': phase < 10 ? 'green' : phase < 12 ? 'amber' : 'red',
    'east-west':
      phase >= 14 && phase < 24
        ? 'green'
        : phase >= 24 && phase < 26
          ? 'amber'
          : 'red',
  };
}

/** Only real graph junctions are controlled; subdivisions and dead ends stay unsignalled. */
export function signalJunctionIds(city: CityResponse): ReadonlySet<string> {
  const neighbors = new Map<string, Set<string>>();
  for (const edge of city.roadGraph?.edges ?? []) {
    for (const [from, to] of [
      [edge.from, edge.to],
      [edge.to, edge.from],
    ]) {
      if (!from || !to) continue;
      const adjacent = neighbors.get(from) ?? new Set<string>();
      adjacent.add(to);
      neighbors.set(from, adjacent);
    }
  }
  return new Set(
    [...neighbors]
      .filter(([, adjacent]) => adjacent.size >= 3)
      .map(([id]) => id),
  );
}

export function signalLensColor(
  active: SignalColor,
  lens: SignalColor,
): number {
  return active === lens
    ? { red: 0xef493b, amber: 0xf4b83e, green: 0x39c779 }[lens]
    : { red: 0x34110e, amber: 0x30260e, green: 0x10291a }[lens];
}
