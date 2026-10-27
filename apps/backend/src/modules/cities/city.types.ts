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
