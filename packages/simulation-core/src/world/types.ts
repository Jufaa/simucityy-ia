import type {
  Building,
  Citizen,
  Road,
  Scenario,
  Shelter,
  Terrain,
} from '@simulicity/shared';
export interface WorldState {
  scenario: Scenario;
  elapsedSeconds: number;
  steps: number;
  buildings: Building[];
  citizens: Citizen[];
  roads: Road[];
  shelters: Shelter[];
  terrain: Terrain[];
}
