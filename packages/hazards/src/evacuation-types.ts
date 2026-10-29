import type { Point, RoadGraph } from './types';

export interface EvacuationCitizenInput {
  id: string;
  homeBuildingId: string;
  nodeId: string;
  position: Point;
  mobilityFactor: number;
  reactionDelayInSeconds: number;
}

export interface EvacuationShelterInput {
  id: string;
  nodeId: string;
  capacity: number;
  active: boolean;
}

export interface EvacuationScenario {
  roadGraph: RoadGraph;
  citizens: readonly EvacuationCitizenInput[];
  shelters: readonly EvacuationShelterInput[];
}

export type EvacuationStatus =
  | 'waiting'
  | 'evacuating'
  | 'evacuated'
  | 'stranded'
  /** Atrapado en su edificio derrumbado: no puede salir ni ser evacuado. */
  | 'trapped';

export interface EvacuationSnapshot {
  readonly elapsedTimeInSeconds: number;
  readonly citizens: readonly {
    readonly id: string;
    readonly position: Point;
    readonly status: EvacuationStatus;
    readonly shelterId: string | null;
    readonly currentEdgeId: string | null;
  }[];
  readonly shelters: readonly {
    readonly shelterId: string;
    readonly capacity: number;
    readonly occupancy: number;
    readonly reserved: number;
  }[];
  readonly evacuatedCount: number;
  readonly strandedCount: number;
  readonly trappedCount: number;
  readonly waitingCount: number;
  readonly completionTimeInSeconds: number | null;
}
