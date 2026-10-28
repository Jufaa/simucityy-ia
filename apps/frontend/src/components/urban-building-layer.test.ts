import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createBuildingLayer } from './urban-building-layer';
import type { CityResponse } from './city-types';

it('renders distinct architecture while keeping the roof inside the declared total height', () => {
  const buildings = (['house', 'apartment', 'shop'] as const).map(
    (style, index) => ({
      id: style,
      minCorner: { x: index * 20, y: 0 },
      maxCorner: { x: index * 20 + 10, y: 12 },
      heightInMeters: 12,
      architecture: {
        style,
        floors: 3,
        roof: style === 'house' ? ('gable' as const) : ('flat' as const),
        roofRiseInMeters: style === 'house' ? 2 : 0,
        facade: 'sand' as const,
        entranceSide: 'north' as const,
        balconyDepthInMeters: style === 'apartment' ? 0.8 : 0,
      },
    }),
  );
  const city: CityResponse = {
    config: {
      widthInMeters: 100,
      heightInMeters: 100,
      streetSpacingInMeters: 50,
    },
    terrain: { kind: 'flat', elevationInMeters: 25 },
    buildings,
    roads: [],
    blocks: [],
  };
  const before = structuredClone(city);
  const layer = createBuildingLayer(city);
  expect(layer.getObjectByName('house:roof')).toBeDefined();
  expect(layer.getObjectByName('shop:storefront')).toBeDefined();
  expect(layer.getObjectByName('balcony-slabs')).toBeInstanceOf(
    THREE.InstancedMesh,
  );
  const house = layer.getObjectByName('house')!;
  const bounds = new THREE.Box3().setFromObject(house);
  expect(bounds.max.y).toBeCloseTo(37);
  expect(bounds.min.y).toBeCloseTo(25);
  expect(city).toEqual(before);
});
