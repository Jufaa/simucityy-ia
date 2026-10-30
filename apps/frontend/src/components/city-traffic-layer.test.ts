import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { CityResponse } from './city-types';
import type { TrafficVehicle } from './city-traffic-model';
import { createCityTrafficLayer } from './city-traffic-layer';

const city: CityResponse = {
  config: {
    widthInMeters: 100,
    heightInMeters: 100,
    streetSpacingInMeters: 50,
  },
  terrain: { kind: 'flat', elevationInMeters: 3 },
  roads: [],
  blocks: [],
  buildings: [],
  organic: {
    seed: 1,
    lake: { center: { x: 20, y: 20 }, radiusX: 10, radiusZ: 10, level: 5 },
    river: {
      points: [
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ],
      widthInMeters: 10,
      level: 5,
    },
    bridges: [
      {
        id: 'bridge',
        roadIds: ['r'],
        edgeIds: ['e'],
        start: { x: 0, y: 50 },
        end: { x: 100, y: 50 },
        deckElevationInMeters: 12,
        widthInMeters: 6,
      },
    ],
    neighborhoods: [],
  },
};
const car: TrafficVehicle = {
  id: 'car',
  edgeId: 'e',
  roadId: 'r',
  laneId: 'e:f',
  distanceInMeters: 20,
  x: 20,
  z: 50.85,
  headingRadians: 0,
  speedInMetersPerSecond: 2,
};

it('updates bounded instance buffers on bridge deck instead of submerged terrain', () => {
  const initial = structuredClone(city);
  const layer = createCityTrafficLayer(city, 2);
  layer.update([
    car,
    { ...car, id: 'b', x: 40 },
    { ...car, id: 'overflow', x: 60 },
  ]);
  const body = layer.group.getObjectByName(
    'traffic-body',
  ) as THREE.InstancedMesh;
  expect(body).toBeInstanceOf(THREE.InstancedMesh);
  expect(body.count).toBe(2);
  const buffer = body.instanceMatrix;
  const matrix = new THREE.Matrix4();
  body.getMatrixAt(0, matrix);
  expect(matrix.elements[12]).toBeCloseTo(20);
  expect(matrix.elements[13]).toBeGreaterThan(12);
  expect(matrix.elements[13]).toBeLessThan(14);
  layer.update([{ ...car, x: 25 }]);
  expect(body.instanceMatrix).toBe(buffer);
  expect(body.count).toBe(1);
  body.getMatrixAt(0, matrix);
  expect(matrix.elements[12]).toBeCloseTo(25);
  layer.update([]);
  expect(body.count).toBe(0);
  expect(city).toEqual(initial);
  layer.dispose();
});

it('releases meshes, shared geometries and materials exactly once', () => {
  const layer = createCityTrafficLayer(city);
  const owned = new Set<{ dispose(): void }>();
  layer.group.traverse((object) => {
    if (!(object instanceof THREE.InstancedMesh)) return;
    owned.add(object);
    owned.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material])
      owned.add(material);
  });
  const spies = [...owned].map((resource) => vi.spyOn(resource, 'dispose'));
  expect(owned.size).toBeGreaterThan(0);
  layer.dispose();
  layer.dispose();
  layer.update([car]);
  expect(layer.group.children).toHaveLength(0);
  spies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
});
