import { expect, it } from 'vitest';
import * as THREE from 'three';
import { generateWorld, sampleWorldHeight } from './world-model';
import { createWorldLayer, worldCameraPose } from './world-layer';
import type { CityResponse } from './city-types';
import { DistrictSimulation } from './district-simulation';
import { generateCityScenario } from '../../../backend/src/modules/cities/city-scenario-generator';
import { createReliefCity } from './terrain-view';

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
    if (o instanceof THREE.Mesh) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        materials.add(m);
    }
  });
  const disposed: number[] = [];
  for (const g of geometries) {
    const i = disposed.length;
    disposed.push(0);
    g.addEventListener('dispose', () => (disposed[i] = (disposed[i] ?? 0) + 1));
  }
  layer.dispose();
  expect(disposed.every((n) => n === 1)).toBe(true);
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
