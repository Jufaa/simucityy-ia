export interface CityConfig {
  widthInMeters: number;
  heightInMeters: number;
  streetSpacingInMeters: number;
  seed?: number;
}
export const GENERATOR_VERSION = '1.0.0';
export const DISTRICT_GENERATOR_VERSION = '1.1.0';
export const URBAN_GENERATOR_VERSION = '1.2.0';

export interface BuildingArchitecture {
  style: 'house' | 'apartment' | 'shop';
  floors: number;
  roof: 'gable' | 'flat';
  roofRiseInMeters: number;
  facade: 'sand' | 'brick' | 'stone';
  entranceSide: 'north' | 'south' | 'east' | 'west';
  balconyDepthInMeters: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Road {
  id: string;
  start: Point;
  end: Point;
}

export interface City {
  config: CityConfig;
  roads: Road[];
}

//las manzanas, cuadras
export interface Block {
  id: string;
  minCorner: Point;
  maxCorner: Point;
}

//edificio
export interface Building {
  id: string;
  minCorner: Point;
  maxCorner: Point;
  heightInMeters: number;
  blockId?: string | undefined;
  parcelId?: string | undefined;
  use?: 'residential' | 'commercial' | undefined;
  architecture?: BuildingArchitecture | undefined;
}

export type TerrainKind = 'flat';

export interface TerrainConfig {
  kind: TerrainKind;
  elevationInMeters: number;
}

export interface CityScenarioConfig extends CityConfig {
  detailLevel?: 'basic' | 'urban' | undefined;
  layout?: 'grid' | 'district' | undefined;
  seed: number;
  buildingMarginInMeters: number;
  minBuildingHeightInMeters: number;
  maxBuildingHeightInMeters: number;
  terrainCellSizeInMeters: number;
  populationCount: number;
}

export interface RoadNode extends Point {
  id: string;
}
export interface RoadEdge {
  id: string;
  roadId: string;
  from: string;
  to: string;
  lengthInMeters: number;
  bidirectional: true;
}
export interface RoadGraph {
  nodes: RoadNode[];
  edges: RoadEdge[];
}
export interface BuildingAccess {
  buildingId: string;
  nodeId: string;
}
export interface Shelter {
  id: string;
  nodeId: string;
  capacity: number;
  active: boolean;
}
export interface Citizen {
  id: string;
  homeBuildingId: string;
  nodeId: string;
  position: Point;
  mobilityFactor: number;
  reactionDelayInSeconds: number;
  status: 'normal';
}
export interface TerrainGrid {
  xCoordinates: number[];
  yCoordinates: number[];
  elevationsInMeters: number[][];
  source: 'synthetic';
}

export interface Parcel extends Block {
  blockId: string;
  kind: 'residential' | 'commercial' | 'park';
}
export interface DistrictArea extends Block {
  blockId: string;
}
export interface DistrictData {
  roadWidthInMeters: number;
  sidewalkWidthInMeters: number;
  parcels: Parcel[];
  parks: DistrictArea[];
  sidewalks: DistrictArea[];
  urban?: UrbanDetails | undefined;
}

export interface ParkPath extends Block {
  parkId: string;
  kind: 'path' | 'plaza' | 'entrance';
}
export interface ParkAmenity {
  id: string;
  parkId: string;
  kind: 'tree' | 'bench' | 'lamp' | 'fountain';
  position: Point;
  rotation: number;
  radiusInMeters: number;
}
export interface StreetDetail extends Block {
  sourceId: string;
  kind: 'curb' | 'crosswalk' | 'lane-marking' | 'building-access';
}
export interface UrbanDetails {
  parkPaths: ParkPath[];
  amenities: ParkAmenity[];
  streetDetails: StreetDetail[];
  yards: (Block & { buildingId: string })[];
}

export interface CityScenario {
  schemaVersion: 1;
  generatorVersion: string;
  source: 'procedural';
  config: CityScenarioConfig;
  terrain: TerrainConfig;
  roads: Road[];
  blocks: Block[];
  buildings: Building[];
  roadGraph: RoadGraph;
  buildingAccess: BuildingAccess[];
  terrainGrid: TerrainGrid;
  shelters: Shelter[];
  citizens: Citizen[];
  district?: DistrictData | undefined;
}
