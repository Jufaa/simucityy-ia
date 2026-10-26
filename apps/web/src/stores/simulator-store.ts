import { create } from 'zustand';
import type { Hazard } from '@simulicity/shared';

type SimulatorUiState = {
  hazard: Hazard['kind'];
  cityQuery: string;
  setHazard: (hazard: Hazard['kind']) => void;
  setCityQuery: (query: string) => void;
};
// UI state only: the simulation engine owns simulation state, never this store.
export const useSimulatorStore = create<SimulatorUiState>((set) => ({
  hazard: 'flood',
  cityQuery: '',
  setHazard: (hazard) => set({ hazard }),
  setCityQuery: (cityQuery) => set({ cityQuery }),
}));
