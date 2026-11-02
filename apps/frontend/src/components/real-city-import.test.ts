import { describe, expect, it } from 'vitest';
import {
  buildDemGrid,
  elementsFromGeoJson,
  filterElementsToBbox,
  flatDemGrid,
} from './real-city-import';
import { createRealCity } from './real-city-model';
import { bboxAroundCenter } from './map-projection';

const plan = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { kind: 'building', levels: 5 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2.162, 41.394],
            [2.163, 41.394],
            [2.163, 41.395],
            [2.162, 41.395],
            [2.162, 41.394],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { highway: 'primary' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [2.161, 41.3945],
          [2.165, 41.3945],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { kind: 'park' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2.164, 41.396],
            [2.165, 41.396],
            [2.165, 41.397],
            [2.164, 41.397],
            [2.164, 41.396],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [2.162, 41.394] },
    },
  ],
};

describe('elementsFromGeoJson', () => {
  it('maps polygons and lines to tagged ways with bounds', () => {
    const parsed = elementsFromGeoJson(plan);
    expect(parsed.featureCount).toBe(4);
    expect(parsed.skippedCount).toBe(1);
    expect(parsed.elements).toHaveLength(3);
    expect(parsed.elements[0]!.tags).toMatchObject({
      building: 'yes',
      'building:levels': '5',
    });
    expect(parsed.elements[1]!.tags).toMatchObject({ highway: 'primary' });
    expect(parsed.elements[2]!.tags).toMatchObject({ leisure: 'park' });
    expect(parsed.bounds.south).toBeCloseTo(41.394, 6);
    expect(parsed.bounds.east).toBeCloseTo(2.165, 6);
  });

  it('rejects empty or local-coordinate content', () => {
    expect(() =>
      elementsFromGeoJson({ type: 'FeatureCollection', features: [] }),
    ).toThrow();
    expect(() =>
      elementsFromGeoJson({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { kind: 'building' },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [500, 0],
                  [500, 500],
                  [0, 0],
                ],
              ],
            },
          },
        ],
      }),
    ).toThrow(/WGS84/);
  });
});

describe('plan zone filtering and DEM grids', () => {
  it('keeps roads and only in-bbox buildings/parks', () => {
    const parsed = elementsFromGeoJson(plan);
    const kept = filterElementsToBbox(parsed.elements, {
      south: 41.3935,
      west: 2.1615,
      north: 41.3955,
      east: 2.1635,
    });
    expect(kept).toHaveLength(2);
    expect(kept.some((e) => e.tags?.building)).toBe(true);
    expect(kept.some((e) => e.tags?.leisure)).toBe(false);
  });

  it('builds DEM axes that the converter accepts, flat or sampled', () => {
    const bbox = { south: 41.39, west: 2.16, north: 41.392, east: 2.162 };
    const flat = flatDemGrid(bbox, 20);
    expect(flat.source).toBe('plan-flat-elevation-0');
    expect(flat.elevationsInMeters.flat().every((v) => v === 0)).toBe(true);
    const sloped = buildDemGrid(
      bbox,
      20,
      (lat) => (lat - 41.39) * 1000,
      'test',
    );
    expect(sloped.elevationsInMeters.at(-1)![0]).toBeGreaterThan(
      sloped.elevationsInMeters[0]![0]!,
    );
  });

  it('accepts selection squares whose side is a near-exact cell multiple', () => {
    // Regression: rounding DEM axes to 0.1 m used to duplicate the final
    // coordinate when the projected side landed a hair above 1000 m.
    const parsed = elementsFromGeoJson(plan);
    const centre = {
      lat: (parsed.bounds.south + parsed.bounds.north) / 2,
      lon: (parsed.bounds.west + parsed.bounds.east) / 2,
    };
    const bbox = bboxAroundCenter(centre, 1000);
    const dem = flatDemGrid(bbox, 20);
    const ys = dem.yCoordinates;
    expect(ys.every((value, i) => i === 0 || value > ys[i - 1]!)).toBe(true);
    const { city } = createRealCity({
      name: 'Plan cuadrado',
      bbox,
      elements: filterElementsToBbox(parsed.elements, bbox),
      dem,
    });
    expect(city.buildings.length).toBeGreaterThan(0);
  });

  it('turns a cropped plan plus flat DEM into a simulable city', () => {
    const parsed = elementsFromGeoJson(plan);
    const bbox = {
      south: 41.3938,
      west: 2.1612,
      north: 41.3952,
      east: 2.1638,
    };
    const { city } = createRealCity({
      name: 'Plan de prueba',
      bbox,
      elements: filterElementsToBbox(parsed.elements, bbox),
      dem: flatDemGrid(bbox, 20),
    });
    expect(city.buildings).toHaveLength(1);
    expect(city.buildings[0]!.heightInMeters).toBe(15);
    expect(city.roadGraph!.edges!.length).toBeGreaterThan(0);
    expect(city.citizens!.length).toBeGreaterThan(0);
  });
});
