// Espejo del JSON que devuelve GET /city del backend (A).
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

export interface CityResponse {
  config: CityConfig;
  terrain: TerrainConfig;
  roads: Road[];
  blocks: Block[];
  buildings: Building[];
}