import { describe, expect, it } from 'vitest';
import {
  bboxAroundCenter,
  latLonToWorldPixels,
  metersPerPixel,
  worldPixelsToLatLon,
} from './map-projection';
import { projectedExtentInMeters } from './real-city-model';

describe('map projection', () => {
  it('round-trips lat/lon through world pixels', () => {
    const point = { lat: 41.3955, lon: 2.164 };
    const roundTripped = worldPixelsToLatLon(
      latLonToWorldPixels(point, 16),
      16,
    );
    expect(roundTripped.lat).toBeCloseTo(point.lat, 8);
    expect(roundTripped.lon).toBeCloseTo(point.lon, 8);
  });

  it('moves east and south in pixel space', () => {
    const origin = latLonToWorldPixels({ lat: 41.4, lon: 2.16 }, 15);
    const east = latLonToWorldPixels({ lat: 41.4, lon: 2.17 }, 15);
    const south = latLonToWorldPixels({ lat: 41.39, lon: 2.16 }, 15);
    expect(east.x).toBeGreaterThan(origin.x);
    expect(south.y).toBeGreaterThan(origin.y);
    expect(metersPerPixel(41.4, 15)).toBeGreaterThan(3);
    expect(metersPerPixel(41.4, 15)).toBeLessThan(4);
  });

  it('builds a bbox whose projected extent matches the requested side', () => {
    const bbox = bboxAroundCenter({ lat: 41.3955, lon: 2.164 }, 1000);
    const extent = projectedExtentInMeters(bbox);
    expect(extent.widthInMeters).toBeCloseTo(1000, 0);
    expect(extent.heightInMeters).toBeCloseTo(1000, 0);
    expect(() => bboxAroundCenter({ lat: Number.NaN, lon: 0 }, 100)).toThrow(
      RangeError,
    );
  });
});
