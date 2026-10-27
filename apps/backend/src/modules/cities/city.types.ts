export interface CityConfig {
  widthInMeters: number;
  heightInMeters: number;
  streetSpacingInMeters: number;
  seed?: number;
}
export const GENERATOR_VERSION = '1.0.0';

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
}

export type TerrainKind = 'flat';

export interface TerrainConfig {
  kind: TerrainKind;
  elevationInMeters: number;
}

export interface CityScenarioConfig extends CityConfig {
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
}
