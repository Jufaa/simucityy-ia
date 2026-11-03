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
  /** Local view/simulation metadata, not part of the saved or HTTP generation contract. */
  profile?: RoadProfile;
}

export interface RoadProfile {
  kind: 'avenue' | 'local' | 'alley';
  widthInMeters: number;
  sidewalkWidthInMeters: number;
  motorVehiclesAllowed: boolean;
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
  /** Inspectable local placement rules; not part of backend or saved scenarios. */
  layout?: BuildingLayout;
  /** Optional local rendering pose; min/max corners conservatively contain the rotated shape. */
  presentation?: {
    widthInMeters: number;
    depthInMeters: number;
    yawInRadians: number;
  };
  use?: 'residential' | 'commercial';
  /** Landmark hint from source tags: standout buildings render exact/1:1. */
  landmark?:
    'religious' | 'cathedral' | 'health' | 'stadium' | 'civic' | 'monument';
  /** Silhouette hint for landmark monuments: human figure vs obelisk. */
  monumentShape?: 'figure' | 'obelisk';
  /** Real 3D parts (OSM building:part) with measured heights, rendering only. */
  parts?: BuildingPart[];
  /** True only for clearly-labelled synthetic infill, never source data. */
  synthetic?: boolean;
  /** Exact local footprint (x/y metres) when known, e.g. imported real buildings. Rendering metadata; hazard bounds stay min/max. */
  footprint?: Point[];
  /** Courtyard holes inside the footprint, same coordinate space. */
  footprintHoles?: Point[][];
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

export interface BuildingPart {
  footprint: Point[];
  heightInMeters: number;
  minHeightInMeters: number;
}

export interface BuildingLayout {
  neighborhoodId: string;
  archetype:
    | 'compact-house'
    | 'elongated-house'
    | 'slim-apartment'
    | 'wide-apartment'
    | 'wide-shop'
    | 'compact-shop';
  roadSetbackInMeters: number;
  buildingGapInMeters: number;
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

/** Provenance for a city converted from real geographic data; local view metadata only. */
export interface RealCityMetadata {
  name: string;
  bbox: { south: number; west: number; north: number; east: number };
  attribution: string;
  osmTimestamp?: string;
  demSource: string;
  demCellSizeInMeters: number;
  measuredBuildingHeights: number;
  estimatedBuildingHeights: number;
  /** Houses invented by the opt-in infill (never presented as real data). */
  syntheticBuildings: number;
  /** Buildings classified as landmarks (churches, hospitals, stadiums...). */
  landmarkBuildings: number;
}

export interface CityResponse {
  organic?: OrganicGeography;
  /** Set only for cities converted from real OSM + DEM data by real-city-model. */
  real?: RealCityMetadata;
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
