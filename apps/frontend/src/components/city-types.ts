import type {
  EvacuationCitizenInput,
  RoadEdge,
  TerrainGrid,
} from '@simulicity/hazards';

// HTTP view of POST /api/v1/cities/generate. Extended district fields are optional.
// No importamos de @simulicity/api: el frontend solo depende del contrato HTTP.

export interface Point {
  x: number;
  y: number;
}

export interface Road {
  id: string;
  start: Point;
  end: Point;
}

export interface Block {
  id: string;
  minCorner: Point;
  maxCorner: Point;
}

export interface Building {
  id: string;
  minCorner: Point;
  maxCorner: Point;
  heightInMeters: number;
  /** Optional local rendering pose; min/max corners conservatively contain the rotated shape. */
  presentation?: {
    widthInMeters: number;
    depthInMeters: number;
    yawInRadians: number;
  };
  use?: 'residential' | 'commercial';
  architecture?: {
    style: 'house' | 'apartment' | 'shop';
    floors: number;
    roof: 'gable' | 'flat';
    roofRiseInMeters: number;
    facade: 'sand' | 'brick' | 'stone';
    entranceSide: 'north' | 'south' | 'east' | 'west';
    balconyDepthInMeters: number;
  };
}

export interface TerrainConfig {
  kind: 'flat';
  elevationInMeters: number;
}

export interface CityConfig {
  widthInMeters: number;
  heightInMeters: number;
  streetSpacingInMeters: number;
  seed?: number;
}

/** Local generation metadata only; never serialized through the saved-city contract. */
export interface OrganicGeography {
  seed: number;
  lake: { center: Point; radiusX: number; radiusZ: number; level: number };
  river: { points: Point[]; widthInMeters: number; level: number };
  bridges: {
    id: string;
    roadIds: string[];
    edgeIds: string[];
    start: Point;
    end: Point;
    deckElevationInMeters: number;
    widthInMeters: number;
  }[];
  neighborhoods: {
    id: string;
    name: string;
    kind: 'center' | 'residential' | 'commercial';
    center: Point;
    radiusX: number;
    radiusZ: number;
  }[];
}

export interface CityResponse {
  organic?: OrganicGeography;
  /** Local view-only relief; not part of the HTTP or saved scenario contract. */
  terrainProfile?: 'basin';
  config: CityConfig;
  terrain: TerrainConfig;
  roads: Road[];
  blocks: Block[];
  buildings: Building[];
  district?: {
    roadWidthInMeters: number;
    sidewalkWidthInMeters: number;
    parks: Block[];
    sidewalks: Block[];
    urban?: {
      yards: (Block & { buildingId: string })[];
      parkPaths: (Block & {
        parkId: string;
        kind: 'path' | 'plaza' | 'entrance';
      })[];
      amenities: {
        id: string;
        parkId: string;
        kind: 'tree' | 'bench' | 'lamp' | 'fountain';
        position: Point;
        rotation: number;
        radiusInMeters: number;
      }[];
      streetDetails: (Block & {
        sourceId: string;
        kind: 'curb' | 'crosswalk' | 'lane-marking' | 'building-access';
      })[];
    };
  };
  terrainGrid?: TerrainGrid;
  roadGraph?: { nodes: (Point & { id: string })[]; edges?: RoadEdge[] };
  citizens?: EvacuationCitizenInput[];
  shelters?: {
    id: string;
    nodeId: string;
    active: boolean;
    capacity?: number;
  }[];
}
