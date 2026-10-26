import type { SimulationMetrics } from '@simulicity/shared';
import type { WorldState } from '../world/types';
export function getMetrics(world: WorldState): SimulationMetrics {
  return {
    elapsedSeconds: world.elapsedSeconds,
    steps: world.steps,
    populationCount: world.citizens.length,
    buildingCount: world.buildings.length,
    affectedBuildings: null,
    evacuatedPeople: null,
  };
}
