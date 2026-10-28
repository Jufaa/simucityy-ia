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
  use?: 'residential' | 'commercial';
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
  district?: {
    roadWidthInMeters: number;
    sidewalkWidthInMeters: number;
    parks: Block[];
    sidewalks: Block[];
  };
  roadGraph?: { nodes: (Point & { id: string })[] };
  shelters?: { id: string; nodeId: string; active: boolean }[];
}
