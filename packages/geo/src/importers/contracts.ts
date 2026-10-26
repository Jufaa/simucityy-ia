import type { GeographicCoordinate, Road, Terrain } from '@simulicity/shared';
import type { NormalizedGeoJSON } from '../converters/geojson';
export interface GeoBounds {
  southwest: GeographicCoordinate;
  northeast: GeographicCoordinate;
}
/** No default implementation: import must be explicit, bounded, cancellable, and respect OSM attribution/rate limits. */
export interface OpenStreetMapImporter {
  importArea(
    bounds: GeoBounds,
    signal: AbortSignal,
  ): Promise<NormalizedGeoJSON>;
}
export interface ElevationProvider {
  sample(
    points: GeographicCoordinate[],
    signal: AbortSignal,
  ): Promise<Terrain[]>;
}
export interface RoadGraph {
  nodes: { id: string; position: GeographicCoordinate }[];
  edges: { from: string; to: string; roadId: string; lengthMeters: number }[];
}
export interface RoadGraphBuilder {
  build(roads: readonly Road[]): RoadGraph;
}
