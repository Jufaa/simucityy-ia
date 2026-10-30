import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createBuildingLayer } from './urban-building-layer';
import { countChunkInstances } from './instanced-chunks';
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
  const roofs = layer.getObjectByName('building-roofs')!;
  expect(countChunkInstances(roofs)).toBe(1);
  const storefronts = layer.getObjectByName('building-storefronts')!;
  expect(countChunkInstances(storefronts)).toBe(1);
  expect(layer.getObjectByName('balcony-slabs')).toBeInstanceOf(THREE.Group);
  // The per-building marker preserves id lookup and base height.
  expect(layer.getObjectByName('house')!.position.y).toBeCloseTo(25);
  const facades = layer.getObjectByName('building-facade-sand')!;
  const facadeIds: string[] = [];
  facades.traverse((object) => {
    if (object instanceof THREE.InstancedMesh)
      facadeIds.push(...(object.userData.buildingIds as string[]));
  });
  expect(facadeIds.sort()).toEqual(['apartment', 'house', 'shop']);
  const bounds = new THREE.Box3().setFromObject(layer);
  expect(bounds.max.y).toBeCloseTo(37);
  expect(bounds.min.y).toBeCloseTo(25);
  expect(city).toEqual(before);
});

it('chunks instances spatially instead of creating meshes per building', () => {
  const makeCity = (count: number): CityResponse => ({
    config: {
      widthInMeters: 1000,
      heightInMeters: 1000,
      streetSpacingInMeters: 50,
    },
    terrain: { kind: 'flat', elevationInMeters: 25 },
    buildings: Array.from({ length: count }, (_, index) => ({
      id: `b-${index}`,
      minCorner: { x: (index % 12) * 20, y: Math.floor(index / 12) * 20 },
      maxCorner: {
        x: (index % 12) * 20 + 10,
        y: Math.floor(index / 12) * 20 + 12,
      },
      heightInMeters: 12,
      architecture: {
        style: (['house', 'apartment', 'shop'] as const)[index % 3]!,
        floors: 3,
        roof: index % 3 === 0 ? ('gable' as const) : ('flat' as const),
        roofRiseInMeters: index % 3 === 0 ? 2 : 0,
        facade: (['sand', 'brick', 'stone'] as const)[index % 3]!,
        entranceSide: 'north' as const,
        balconyDepthInMeters: index % 3 === 1 ? 0.8 : 0,
      },
    })),
    roads: [],
    blocks: [],
  });
  const meshCount = (layer: THREE.Group) => {
    let total = 0;
    layer.traverse((object) => {
      if (object instanceof THREE.Mesh) total++;
    });
    return total;
  };
  const small = createBuildingLayer(makeCity(3));
  const large = createBuildingLayer(makeCity(120));
  // Instances are preserved; meshes scale with 120 m spatial chunks,
  // never with the 120 individual buildings.
  expect(countChunkInstances(large)).toBeGreaterThan(120);
  expect(meshCount(large)).toBeLessThan(120);
  expect(meshCount(large)).toBeGreaterThan(meshCount(small));
});
