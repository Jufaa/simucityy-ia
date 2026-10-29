import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createDemoCompatibleScenario } from '../../../../packages/hazards/src/defaults';
import { FloodSimulation } from './flood-simulation';
import { createFloodLayer } from './flood-layer';

it('renders water at cell elevations and marks exact blocked edges and exposed building IDs', () => {
  const city = createDemoCompatibleScenario(100, 100, 25);
  const before = structuredClone(city);
  const simulation = new FloodSimulation(city);
  const layer = createFloodLayer(city, simulation.cells);
  layer.update(simulation.snapshot);
  const water = layer.group.getObjectByName(
    'flood-water',
  ) as THREE.InstancedMesh;
  expect(water.count).toBe(0);
  simulation.start();
  simulation.advance(25);
  layer.update(simulation.snapshot);
  expect(water.count).toBe(simulation.cells.length);
  const matrix = new THREE.Matrix4();
  water.getMatrixAt(0, matrix);
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  matrix.decompose(position, new THREE.Quaternion(), scale);
  expect(position.y + scale.y / 2).toBeCloseTo(
    simulation.snapshot.waterDepthInMeters[0]!,
  );
  for (const id of simulation.snapshot.blockedRoadEdgeIds)
    expect(layer.group.getObjectByName(`flood-road:${id}`)?.visible).toBe(true);
  for (const id of simulation.snapshot.exposedBuildingIds)
    expect(layer.group.getObjectByName(`flood-building:${id}`)?.visible).toBe(
      true,
    );
  simulation.reset();
  layer.update(simulation.snapshot);
  expect(water.count).toBe(0);
  expect(
    layer.group.children
      .filter((child) => child !== water)
      .every((child) => !child.visible),
  ).toBe(true);
  expect(city).toEqual(before);
  layer.dispose();
});

it('marks only the affected segment of a shared road at nonzero terrain elevation', () => {
  const base = createDemoCompatibleScenario(100, 100, 25);
  const city = {
    ...base,
    terrain: { ...base.terrain, elevationInMeters: 25 },
    terrainGrid: {
      ...base.terrainGrid,
      elevationsInMeters: base.terrainGrid.elevationsInMeters.map((row) =>
        row.map(() => 25),
      ),
    },
  };
  const simulation = new FloodSimulation(city);
  const layer = createFloodLayer(city, simulation.cells);
  simulation.start();
  simulation.advance(25);
  layer.update({
    ...simulation.snapshot,
    roadEdges: simulation.snapshot.roadEdges.map((edge, index) => ({
      ...edge,
      blocked: index === 0,
    })),
    exposedBuildingIds: [city.buildings[0]!.id],
  });
  expect(
    layer.group.getObjectByName('flood-road:edge-west-center')?.visible,
  ).toBe(true);
  expect(
    layer.group.getObjectByName('flood-road:edge-center-east')?.visible,
  ).toBe(false);
  expect(
    layer.group.getObjectByName(`flood-building:${city.buildings[1]!.id}`)
      ?.visible,
  ).toBe(false);
  const water = layer.group.getObjectByName(
    'flood-water',
  ) as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4();
  water.getMatrixAt(0, matrix);
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  matrix.decompose(position, new THREE.Quaternion(), scale);
  expect(position.y + scale.y / 2).toBeCloseTo(
    25 + simulation.snapshot.maxWaterDepthInMeters,
  );
  layer.dispose();
});

it('animates water highlights without altering depth and resets their phase', () => {
  const city = createDemoCompatibleScenario(100, 100, 25);
  const simulation = new FloodSimulation(city);
  const layer = createFloodLayer(city, simulation.cells);
  simulation.start();
  simulation.advance(1);
  layer.update(simulation.snapshot);
  const water = layer.group.getObjectByName(
    'flood-water',
  ) as THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  const matrix = new THREE.Matrix4();
  water.getMatrixAt(0, matrix);
  const before = matrix.clone();
  expect(water.material.normalMap).not.toBeNull();
  layer.animate(0.1);
  expect(water.material.normalMap!.offset.length()).toBeGreaterThan(0);
  water.getMatrixAt(0, matrix);
  expect(matrix.equals(before)).toBe(true);
  simulation.reset();
  layer.update(simulation.snapshot);
  expect(water.material.normalMap!.offset.length()).toBe(0);
  layer.dispose();
});

it('only enables vertex alpha on the reconstructed surface, not uncolored flat boxes', () => {
  const city = createDemoCompatibleScenario(100, 100, 25);
  const simulation = new FloodSimulation(city);
  for (const obstacles of [false, true]) {
    const layer = createFloodLayer(city, simulation.cells, obstacles);
    const water = layer.group.getObjectByName(
      'flood-water',
    ) as THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
    expect(water.material.vertexColors).toBe(obstacles);
    layer.dispose();
  }
});
