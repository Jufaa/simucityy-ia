import type { WorldState } from '../world/types';
/** Implementations must use injected seeded randomness, never Math.random or wall clocks. */
export interface HazardSystem {
  initialize(world: WorldState): void;
  update(world: WorldState, deltaTime: number): void;
}
export type HazardFactory = (random: () => number) => HazardSystem;
