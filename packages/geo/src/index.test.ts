import { describe, expect, it } from 'vitest';
import { demoCity } from '@simulicity/shared';
import {
  toLocal,
  toGeographic,
  normalizeGeoJSON,
  demoBuildings,
} from './index';
describe('geospatial boundary', () => {
  it('round trips degrees to local metres near the origin', () => {
    const p = { ...demoCity.center, longitude: -80.19, latitude: 25.762 };
    const local = toLocal(p, demoCity.center);
    expect(local.crs).toBe('local-meters');
    const result = toGeographic(local, demoCity.center);
    expect(result.longitude).toBeCloseTo(p.longitude, 8);
    expect(result.latitude).toBeCloseTo(p.latitude, 8);
  });
  it('validates polygons and rejects invalid coordinates', () => {
    expect(normalizeGeoJSON(demoBuildings).features).toHaveLength(2);
    expect(() =>
      normalizeGeoJSON({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [200, 100] },
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      normalizeGeoJSON({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 1],
                ],
              ],
            },
          },
        ],
      }),
    ).toThrow();
  });
  it('rejects singular polar projections', () => {
    expect(() =>
      toLocal(demoCity.center, { ...demoCity.center, latitude: 90 }),
    ).toThrow();
  });
});
