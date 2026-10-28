import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createUrbanDetailLayer } from './urban-detail-layer';
import type { CityResponse } from './city-types';

it('uses scenario paths, trees and road markings through instanced geometry', () => {
  const city: CityResponse = {
    config: {
      widthInMeters: 100,
      heightInMeters: 100,
      streetSpacingInMeters: 50,
    },
    terrain: { kind: 'flat', elevationInMeters: 25 },
    roads: [],
    blocks: [],
    buildings: [],
    district: {
      roadWidthInMeters: 6,
      sidewalkWidthInMeters: 2,
      parks: [],
      sidewalks: [],
      urban: {
        yards: [],
        parkPaths: [
          {
            id: 'path',
            parkId: 'park',
            kind: 'path',
            minCorner: { x: 10, y: 10 },
            maxCorner: { x: 20, y: 12 },
          },
        ],
        amenities: [
          {
            id: 'tree',
            parkId: 'park',
            kind: 'tree',
            position: { x: 25, y: 25 },
            radiusInMeters: 1.5,
            rotation: 0,
          },
        ],
        streetDetails: [
          {
            id: 'paint',
            sourceId: 'road',
            kind: 'crosswalk',
            minCorner: { x: 1, y: 1 },
            maxCorner: { x: 2, y: 6 },
          },
        ],
      },
    },
  };
  const before = structuredClone(city);
  const layer = createUrbanDetailLayer(city);
  for (const name of ['park-paths', 'tree-crowns', 'street-crosswalk'])
    expect(layer.getObjectByName(name)).toBeInstanceOf(THREE.InstancedMesh);
  expect(city).toEqual(before);
});
