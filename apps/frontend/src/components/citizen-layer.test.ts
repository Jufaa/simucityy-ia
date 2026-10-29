import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createCitizenLayer } from './citizen-layer';
import { sampleTerrainHeight } from './terrain-view';
import type { CityResponse } from './city-types';
import type { EvacuationSnapshot } from '@simulicity/hazards';

it('places citizens on shared terrain, changes status color and disposes its resources', () => {
  const city: CityResponse = {
    config: {
      widthInMeters: 20,
      heightInMeters: 20,
      streetSpacingInMeters: 10,
    },
    terrain: { kind: 'flat', elevationInMeters: 25 },
    roads: [],
    blocks: [],
    buildings: [],
    terrainGrid: {
      xCoordinates: [0, 20],
      yCoordinates: [0, 20],
      elevationsInMeters: [
        [25, 27],
        [25, 27],
      ],
    },
  };
  const layer = createCitizenLayer(city, 1);
  const snapshot: EvacuationSnapshot = {
    elapsedTimeInSeconds: 1,
    citizens: [
      {
        id: 'c',
        position: { x: 10, y: 10 },
        status: 'evacuating',
        shelterId: 's',
        currentEdgeId: null,
      },
    ],
    shelters: [],
    evacuatedCount: 0,
    strandedCount: 0,
    waitingCount: 0,
    completionTimeInSeconds: null,
  };
  layer.update(snapshot);
  const body = layer.group.getObjectByName(
    'evacuation-citizens',
  ) as THREE.InstancedMesh;
  expect(body.count).toBe(1);
  const matrix = new THREE.Matrix4();
  body.getMatrixAt(0, matrix);
  expect(new THREE.Vector3().setFromMatrixPosition(matrix).y).toBeCloseTo(
    sampleTerrainHeight(city, 10, 10) + 1.35,
  );
  const color = new THREE.Color();
  body.getColorAt(0, color);
  layer.update({
    ...snapshot,
    citizens: [{ ...snapshot.citizens[0]!, status: 'stranded' }],
  });
  const after = new THREE.Color();
  body.getColorAt(0, after);
  expect(after.equals(color)).toBe(false);
  let disposed = 0;
  body.geometry.addEventListener('dispose', () => disposed++);
  layer.dispose();
  expect(disposed).toBe(1);
});

it('accepts plain ID/position entities without behavior or evacuation metrics', () => {
  const city: CityResponse = {
    config: {
      widthInMeters: 20,
      heightInMeters: 20,
      streetSpacingInMeters: 10,
    },
    terrain: { kind: 'flat', elevationInMeters: 25 },
    roads: [],
    blocks: [],
    buildings: [],
  };
  const layer = createCitizenLayer(city, 1),
    state = { citizens: [{ id: 'idle-person', position: { x: 5, y: 5 } }] },
    before = JSON.stringify(state);
  layer.update(state);
  const body = layer.group.getObjectByName(
    'evacuation-citizens',
  ) as THREE.InstancedMesh;
  const color = new THREE.Color();
  body.getColorAt(0, color);
  expect(color.getHex()).toBe(0xe0aa3e);
  const first = new THREE.Matrix4();
  body.getMatrixAt(0, first);
  layer.update(state);
  const second = new THREE.Matrix4();
  body.getMatrixAt(0, second);
  expect(second.equals(first)).toBe(true);
  expect(JSON.stringify(state)).toBe(before);
  layer.dispose();
});

const animationCity: CityResponse = {
  config: {
    widthInMeters: 100,
    heightInMeters: 100,
    streetSpacingInMeters: 20,
  },
  terrain: { kind: 'flat', elevationInMeters: 0 },
  roads: [],
  blocks: [],
  buildings: [],
};

it('animates walking limbs in real frame time, faces movement and freezes when paused', () => {
  const layer = createCitizenLayer(animationCity, 1);
  const state = (x: number) => ({
    citizens: [
      { id: 'walker', position: { x, y: 10 }, status: 'evacuating' as const },
    ],
  });
  layer.update(state(10), 0.1);
  layer.update(state(11), 0.1);
  const leg = layer.group.getObjectByName(
    'evacuation-left-leg',
  ) as THREE.InstancedMesh;
  expect(leg).toBeDefined();
  const moving = new THREE.Matrix4();
  leg.getMatrixAt(0, moving);
  layer.update(state(11), 0);
  const paused = new THREE.Matrix4();
  leg.getMatrixAt(0, paused);
  expect(paused.elements).toEqual(moving.elements);
  layer.update(state(12), 0.1);
  const next = new THREE.Matrix4();
  leg.getMatrixAt(0, next);
  expect(next.elements).not.toEqual(moving.elements);
  const body = layer.group.getObjectByName(
    'evacuation-citizens',
  ) as THREE.InstancedMesh;
  const facing = new THREE.Matrix4();
  body.getMatrixAt(0, facing);
  const direction = new THREE.Vector3(0, 0, 1).transformDirection(facing);
  expect(direction.x).toBeCloseTo(1);
  layer.dispose();
});

it('keeps arrived people visible in distinct building-clear shelter slots without moving simulation data', () => {
  const city = {
    ...animationCity,
    buildings: [
      {
        id: 'b',
        minCorner: { x: 2, y: 2 },
        maxCorner: { x: 15, y: 15 },
        heightInMeters: 10,
      },
    ],
  };
  const layer = createCitizenLayer(city, 20);
  const state = {
    citizens: Array.from({ length: 20 }, (_, i) => ({
      id: `p-${i}`,
      position: { x: 0, y: 0 },
      status: 'evacuated' as const,
    })),
  };
  const before = JSON.stringify(state);
  layer.update(state, 0.1);
  const body = layer.group.getObjectByName(
    'evacuation-citizens',
  ) as THREE.InstancedMesh;
  expect(body.count).toBe(20);
  const positions = state.citizens.map((_, i) => {
    const matrix = new THREE.Matrix4();
    body.getMatrixAt(i, matrix);
    const p = new THREE.Vector3().setFromMatrixPosition(matrix);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.z).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(100);
    expect(p.z).toBeLessThanOrEqual(100);
    expect(p.x > 1 && p.x < 16 && p.z > 1 && p.z < 16).toBe(false);
    return `${p.x},${p.z}`;
  });
  expect(new Set(positions).size).toBe(20);
  expect(JSON.stringify(state)).toBe(before);
  layer.update(state, 0.1);
  const matrix = new THREE.Matrix4();
  body.getMatrixAt(0, matrix);
  expect(`${matrix.elements[12]},${matrix.elements[14]}`).toBe(positions[0]);
  layer.dispose();
});

it('stops the gait for blocked citizens and clears arrival slots when the clock resets', () => {
  const layer = createCitizenLayer(animationCity, 2);
  const person = (
    x: number,
    status: 'evacuating' | 'stranded' | 'evacuated' | 'waiting',
  ) => ({ id: 'person', position: { x, y: 20 }, status });
  layer.update(
    { elapsedTimeInSeconds: 1, citizens: [person(20, 'evacuating')] },
    0.1,
  );
  layer.update(
    { elapsedTimeInSeconds: 2, citizens: [person(21, 'evacuating')] },
    0.1,
  );
  layer.update(
    { elapsedTimeInSeconds: 3, citizens: [person(21, 'stranded')] },
    0.1,
  );
  const leg = layer.group.getObjectByName(
    'evacuation-left-leg',
  ) as THREE.InstancedMesh;
  const stopped = new THREE.Matrix4();
  leg.getMatrixAt(0, stopped);
  const rotation = new THREE.Quaternion();
  stopped.decompose(new THREE.Vector3(), rotation, new THREE.Vector3());
  const angles = new THREE.Euler().setFromQuaternion(rotation, 'YXZ');
  expect(angles.x).toBeCloseTo(0);
  layer.update(
    { elapsedTimeInSeconds: 4, citizens: [person(30, 'evacuated')] },
    0.1,
  );
  layer.update(
    { elapsedTimeInSeconds: 0, citizens: [person(20, 'waiting')] },
    0,
  );
  const body = layer.group.getObjectByName(
    'evacuation-citizens',
  ) as THREE.InstancedMesh;
  const reset = new THREE.Matrix4();
  body.getMatrixAt(0, reset);
  expect(reset.elements[12]).toBeCloseTo(20);
  expect(reset.elements[14]).toBeCloseTo(20);
  expect(new THREE.Euler().setFromRotationMatrix(reset, 'YXZ').y).toBeCloseTo(
    0,
  );
  layer.dispose();
});
