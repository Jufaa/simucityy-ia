import { expect, it } from 'vitest';
import * as THREE from 'three';
import { generateWorld, sampleWorldHeight } from './world-model';
import {
  createWorldLayer,
  DEFAULT_WORLD_CAMERA_VIEW,
  worldCameraPose,
} from './world-layer';
import type { CityResponse } from './city-types';
import { DistrictSimulation } from './district-simulation';
import { generateCityScenario } from '../../../backend/src/modules/cities/city-scenario-generator';
import { createReliefCity } from './terrain-view';

it('opens the scene on the metropolitan overview by default', () => {
  expect(DEFAULT_WORLD_CAMERA_VIEW).toBe('world');
});

it('frames the metropolitan river horizontally from an east-side overview', () => {
  const city: CityResponse = {
    config: {
      widthInMeters: 1800,
      heightInMeters: 1500,
      streetSpacingInMeters: 300,
    },
    terrain: { kind: 'flat', elevationInMeters: 25 },
    roads: [],
    blocks: [],
    buildings: [],
  };
  const world = generateWorld(city, 123),
    pose = worldCameraPose(world, 'world'),
    camera = new THREE.PerspectiveCamera(60, 16 / 9, 2, 18500);
  expect(pose.position[0]).toBeGreaterThan(city.config.widthInMeters);
  expect(pose.position[2]).toBeCloseTo(pose.target[2]);
  camera.position.set(...pose.position);
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld(true);
  const bankStart = new THREE.Vector3(
      city.config.widthInMeters / 2,
      25,
      0,
    ).project(camera),
    bankEnd = new THREE.Vector3(
      city.config.widthInMeters / 2,
      25,
      city.config.heightInMeters,
    ).project(camera);
  expect(Math.abs(bankEnd.x - bankStart.x)).toBeGreaterThan(
    Math.abs(bankEnd.y - bankStart.y) * 2,
  );
});

it('keeps the entire railway visibly above sampled land elevation', () => {
  const city: CityResponse = {
    config: {
      widthInMeters: 200,
      heightInMeters: 200,
      streetSpacingInMeters: 50,
    },
    terrain: { kind: 'flat', elevationInMeters: 25 },
    roads: [],
    blocks: [],
    buildings: [],
  };
  const world = generateWorld(city, 123),
    layer = createWorldLayer(world),
    rail = layer.group.getObjectByName('world-rail');
  expect(rail).toBeDefined();
  const steel: THREE.Mesh[] = [];
  rail!.traverse((object) => {
    if (object instanceof THREE.Mesh && object.name.startsWith('rail-steel-'))
      steel.push(object);
  });
  expect(steel.length).toBeGreaterThan(0);
  for (const track of steel)
    expect(track.position.y + 0.25).toBeGreaterThan(
      sampleWorldHeight(world, track.position.x, track.position.z),
    );
  layer.dispose();
});

it('scales contextual port silhouettes and batches woodland trees at metropolitan size', () => {
  const city: CityResponse = {
    config: {
      widthInMeters: 1800,
      heightInMeters: 1500,
      streetSpacingInMeters: 300,
    },
    terrain: { kind: 'flat', elevationInMeters: 25 },
    roads: [],
    blocks: [],
    buildings: [],
  };
  const world = generateWorld(city, 123),
    layer = createWorldLayer(world),
    ship = layer.group.getObjectByName('port-ship') as THREE.Mesh,
    treeBelt = layer.group.getObjectByName('world-tree-belt');
  ship.geometry.computeBoundingBox();
  expect(
    ship.geometry.boundingBox!.max.x - ship.geometry.boundingBox!.min.x,
  ).toBeGreaterThan(250);
  expect(treeBelt).toBeDefined();
  const instances: THREE.InstancedMesh[] = [];
  treeBelt!.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) instances.push(object);
  });
  expect(instances.map((mesh) => mesh.count)).toEqual([
    world.trees.length,
    world.trees.length,
  ]);
  layer.dispose();
});

it('renders permanent sea and lake on their own levels, preserves them through flood reset and disposes resources once', () => {
  const source: CityResponse = JSON.parse(
    JSON.stringify(
      generateCityScenario({
        config: {
          widthInMeters: 200,
          heightInMeters: 200,
          streetSpacingInMeters: 50,
          seed: 123,
        },
        terrain: { kind: 'flat', elevationInMeters: 25 },
        populationCount: 0,
      }),
    ),
  );
  const city = createReliefCity(source),
    model = generateWorld(city, 123),
    before = JSON.stringify(city);
  const layer = createWorldLayer(model);
  expect(layer.group.getObjectByName('world-port')).toBeDefined();
  expect(layer.group.getObjectByName('world-rail')).toBeDefined();
  expect(layer.group.getObjectByName('world-tree-belt')).toBeDefined();
  const treeInstances: THREE.InstancedMesh[] = [];
  layer.group.getObjectByName('world-tree-belt')!.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) treeInstances.push(object);
  });
  expect(treeInstances.length).toBeGreaterThanOrEqual(2);
  expect(treeInstances.reduce((total, mesh) => total + mesh.count, 0)).toBe(
    model.trees.length * 2,
  );
  expect(layer.group.getObjectByName('port-crane-0')).toBeDefined();
  expect(layer.group.getObjectByName('port-ship')).toBeDefined();
  for (const [name, level] of [
    ['sea', model.seaLevel],
    ['lake', model.lake.level],
  ] as const) {
    const mesh = layer.layers[name].children[0] as THREE.Mesh;
    const points = mesh.geometry.getAttribute('position');
    expect(points.count).toBeGreaterThan(0);
    for (let i = 0; i < points.count; i++) {
      expect(points.getY(i)).toBeCloseTo(level);
      expect(points.getY(i) + 0.0001).toBeGreaterThanOrEqual(
        sampleWorldHeight(model, points.getX(i), points.getZ(i)),
      );
    }
  }
  const simulation = new DistrictSimulation(city);
  simulation.start();
  simulation.advance(2);
  simulation.reset();
  expect(layer.layers.sea.children.length).toBe(1);
  expect(JSON.stringify(city)).toBe(before);
  const camera = worldCameraPose(model, 'world'),
    close = worldCameraPose(model, 'city');
  expect(camera.position[1]).toBeGreaterThan(close.position[1]);
  const materials = new Set<THREE.Material>(),
    geometries = new Set<THREE.BufferGeometry>();
  layer.group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        materials.add(m);
    }
  });
  const disposed: number[] = [];
  const disposedMaterials: number[] = [];
  const disposedInstances: number[] = [];
  for (const g of geometries) {
    const i = disposed.length;
    disposed.push(0);
    g.addEventListener('dispose', () => (disposed[i] = (disposed[i] ?? 0) + 1));
  }
  for (const material of materials) {
    const i = disposedMaterials.length;
    disposedMaterials.push(0);
    material.addEventListener('dispose', () => {
      disposedMaterials[i] = (disposedMaterials[i] ?? 0) + 1;
    });
  }
  for (const instance of treeInstances) {
    const i = disposedInstances.length;
    disposedInstances.push(0);
    instance.addEventListener('dispose', () => {
      disposedInstances[i] = (disposedInstances[i] ?? 0) + 1;
    });
  }
  layer.dispose();
  expect(disposed.every((n) => n === 1)).toBe(true);
  expect(disposedMaterials.every((n) => n === 1)).toBe(true);
  expect(disposedInstances.every((n) => n === 1)).toBe(true);
  expect(materials.size).toBeGreaterThan(0);
});

it('keeps all city ground corners inside the desktop city-camera viewport', () => {
  const city: CityResponse = {
    config: {
      widthInMeters: 500,
      heightInMeters: 500,
      streetSpacingInMeters: 50,
    },
    terrain: { kind: 'flat', elevationInMeters: 25 },
    roads: [],
    blocks: [],
    buildings: [],
  };
  const model = generateWorld(city, 123),
    pose = worldCameraPose(model, 'city');
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 2, 18500);
  camera.position.set(...pose.position);
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld(true);
  for (const x of [0, 500])
    for (const z of [0, 500]) {
      const point = new THREE.Vector3(x, 25, z).project(camera);
      expect(Math.abs(point.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(point.y)).toBeLessThanOrEqual(1);
    }
});
