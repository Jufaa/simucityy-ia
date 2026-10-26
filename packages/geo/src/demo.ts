import { normalizeGeoJSON } from './converters/geojson';
/** Fictional footprints and heights near Miami, NOT real OSM buildings. */
export const demoBuildings = normalizeGeoJSON({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        id: 'demo-a',
        height: 24,
        provenance: 'synthetic',
        source: 'Hand-authored demo',
        license: 'CC0-1.0',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-80.192, 25.762],
            [-80.1917, 25.762],
            [-80.1917, 25.7623],
            [-80.192, 25.7623],
            [-80.192, 25.762],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        id: 'demo-b',
        height: 42,
        provenance: 'synthetic',
        source: 'Hand-authored demo',
        license: 'CC0-1.0',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-80.1915, 25.7615],
            [-80.1912, 25.7615],
            [-80.1912, 25.7618],
            [-80.1915, 25.7618],
            [-80.1915, 25.7615],
          ],
        ],
      },
    },
  ],
});
