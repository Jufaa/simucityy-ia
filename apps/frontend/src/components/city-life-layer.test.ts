import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createCityLifeLayer } from './city-life-layer';
import { generateCityLife } from './city-life-model';
import type { CityResponse } from './city-types';
import { sampleTerrainHeight } from './terrain-view';

it('grounds upright batched geometry and releases every owned resource exactly once', () => {
  const city: CityResponse = {
    config: {
      widthInMeters: 160,
      heightInMeters: 130,
      streetSpacingInMeters: 73,
      seed: 42,
    },
    terrain: { kind: 'flat', elevationInMeters: 12 },
    roads: [{ id: 'road', start: { x: 0, y: 65 }, end: { x: 160, y: 65 } }],
    blocks: [],
    buildings: [],
    district: {
      roadWidthInMeters: 6,
      sidewalkWidthInMeters: 2,
      parks: [],
      sidewalks: [],
    },
  };
  city.terrainGrid = {
    source: 'test',
    xCoordinates: [0, 160],
    yCoordinates: [0, 130],
    elevationsInMeters: [
      [10, 14],
      [12, 16],
    ],
  };
  const before = structuredClone(city);
  const model = generateCityLife(city);
  for (const item of model.items)
    expect(item.ground).toBe(sampleTerrainHeight(city, item.x, item.z));
  const { group, dispose } = createCityLifeLayer(city, model);
  expect(group.children.length).toBeGreaterThan(0);
  expect(group.children.every((m) => m instanceof THREE.InstancedMesh)).toBe(
    true,
  );
  const wheels = group.getObjectByName(
    'city-life-wheels',
  ) as THREE.InstancedMesh;
  expect(wheels).toBeDefined();
  const matrix = new THREE.Matrix4();
  wheels.getMatrixAt(0, matrix);
  const firstVehicle = model.items.find((item) =>
    ['car', 'taxi', 'van', 'bus'].includes(item.kind),
  )!;
  expect(matrix.elements[13]).toBeCloseTo(firstVehicle.ground + 0.4);
  expect(matrix.elements[1]).toBe(0);
  expect(matrix.elements[9]).toBe(0);
  expect(group.getObjectByName('city-life-windows')).toBeDefined();
  const resources = new Set<{ dispose(): void }>();
  group.traverse((o) => {
    if (o instanceof THREE.InstancedMesh) {
      resources.add(o);
      resources.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        resources.add(m);
    }
  });
  const spies = [...resources].map((resource) => vi.spyOn(resource, 'dispose'));
  dispose();
  dispose();
  spies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
  expect(city).toEqual(before);
});

it('owns empty-layer geometry cleanup without inventing scene objects', () => {
  const city: CityResponse = {
    config: {
      widthInMeters: 10,
      heightInMeters: 10,
      streetSpacingInMeters: 10,
    },
    terrain: { kind: 'flat', elevationInMeters: 0 },
    roads: [],
    blocks: [],
    buildings: [],
  };
  const layer = createCityLifeLayer(city, generateCityLife(city));
  expect(layer.group.children).toHaveLength(0);
  expect(() => {
    layer.dispose();
    layer.dispose();
  }).not.toThrow();
});
