import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createDistrictLayer } from './create-district-layer';
import type { CityResponse } from './city-types';

it('renders parks, sidewalks and shelter locations from the scenario without changing it', () => {
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
      parks: [
        { id: 'park', minCorner: { x: 6, y: 6 }, maxCorner: { x: 44, y: 44 } },
      ],
      sidewalks: [
        {
          id: 'sidewalk',
          minCorner: { x: 3, y: 3 },
          maxCorner: { x: 47, y: 5 },
        },
      ],
    },
    roadGraph: { nodes: [{ id: 'node', x: 50, y: 0 }] },
    shelters: [{ id: 'shelter', nodeId: 'node', active: true }],
  };
  const before = structuredClone(city);
  const group = createDistrictLayer(city);
  expect(group.children.map(({ name }) => name)).toEqual([
    'district-parks',
    'district-sidewalks',
    'district-shelters',
  ]);
  const centerX = (name: string) => {
    const mesh = group.getObjectByName(name) as THREE.InstancedMesh;
    expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
    expect(mesh.count).toBe(1);
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(0, matrix);
    return matrix.elements[12];
  };
  expect(centerX('district-parks')).toBe(25);
  expect(
    (group.getObjectByName('district-parks') as THREE.InstancedMesh).userData
      .ids,
  ).toEqual(['park']);
  const shelters = group.getObjectByName(
    'district-shelters',
  ) as THREE.InstancedMesh;
  const shelterMatrix = new THREE.Matrix4();
  shelters.getMatrixAt(0, shelterMatrix);
  expect(shelterMatrix.elements[12]).toBe(50);
  expect(shelterMatrix.elements[14]).toBe(0);
  expect(city).toEqual(before);
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
  });
});
