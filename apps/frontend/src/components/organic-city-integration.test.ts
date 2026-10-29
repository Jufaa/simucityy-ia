import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createOrganicCity, waterSurfaceAt } from './organic-city-model';
import { sampleRoadSurfaceHeight, bridgeAtPoint } from './road-surface';
import { createOrganicCityLayer } from './organic-city-layer';
import { organicFloodEnvironment } from './organic-flood-environment';
import { sampleTerrainHeight, createCityGround } from './terrain-view';
import { createCitizenLayer } from './citizen-layer';
import { DistrictSimulation } from './district-simulation';
import { createStaticPopulation } from './static-population';
import { generateCityLife } from './city-life-model';
import type { CityResponse } from './city-types';
import { EvacuationEngine } from '@simulicity/hazards';

const source: CityResponse = {
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

it('keeps the bridge road surface and rendered walkers above the water without raising the bed', () => {
  const { city, geography } = createOrganicCity(source, 123);
  const bridge = geography.bridges[0]!;
  const p = {
    x: (bridge.start.x + bridge.end.x) / 2,
    y: (bridge.start.y + bridge.end.y) / 2,
  };
  expect(waterSurfaceAt(geography, p)).toBeDefined();
  expect(sampleTerrainHeight(city, p.x, p.y)).toBeLessThan(
    geography.lake.level,
  );
  expect(bridgeAtPoint(city, p.x, p.y)?.id).toBe(bridge.id);
  expect(sampleRoadSurfaceHeight(city, p.x, p.y)).toBe(
    bridge.deckElevationInMeters,
  );
  const layer = createCitizenLayer(city, 1);
  layer.update({
    citizens: [{ id: 'crossing', position: p, status: 'evacuating' }],
  });
  const mesh = layer.group.getObjectByName(
    'evacuation-citizens',
  ) as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(0, matrix);
  expect(matrix.elements[13]).toBeCloseTo(bridge.deckElevationInMeters + 1.35);
  layer.dispose();
  expect(sampleRoadSurfaceHeight(source, 5, 5)).toBe(25);
});

it('renders clipped permanent water and a separate bridge deck, and disposes owned resources once', () => {
  const { city, geography } = createOrganicCity(source, 123);
  const before = JSON.stringify(city);
  const layer = createOrganicCityLayer(city);
  const water = layer.group.getObjectByName('organic-water') as THREE.Mesh;
  expect(water).toBeDefined();
  const positions = water.geometry.getAttribute('position');
  expect(positions.count).toBeGreaterThan(0);
  for (let i = 0; i < positions.count; i++) {
    expect(positions.getY(i)).toBeCloseTo(geography.lake.level);
    expect(
      sampleTerrainHeight(city, positions.getX(i), positions.getZ(i)),
    ).toBeLessThanOrEqual(geography.lake.level + 1e-4);
  }
  expect(layer.group.getObjectByName('bridge:organic-bridge')).toBeDefined();
  let disposed = 0;
  water.geometry.addEventListener('dispose', () => disposed++);
  layer.animate(0.1);
  layer.dispose();
  layer.dispose();
  expect(disposed).toBe(1);
  expect(JSON.stringify(city)).toBe(before);
});

it('keeps idle people on dry streets or the bridge and excludes static street props from water', () => {
  const { city, geography } = createOrganicCity(source, 123);
  const people = createStaticPopulation(city);
  expect(people.length).toBe(200);
  for (const p of people) {
    expect(
      waterSurfaceAt(geography, p.position) === undefined ||
        bridgeAtPoint(city, p.position.x, p.position.y) !== undefined,
    ).toBe(true);
    expect(
      sampleRoadSurfaceHeight(city, p.position.x, p.position.y),
    ).toBeGreaterThan(geography.lake.level);
  }
  for (const prop of generateCityLife(city).items) {
    expect(waterSurfaceAt(geography, { x: prop.x, y: prop.z })).toBeUndefined();
    expect(bridgeAtPoint(city, prop.x, prop.z)).toBeUndefined();
  }
});

it('feeds bridge and permanent levels into both matched flood arms while reset preserves bridge clearance', () => {
  const { city, geography } = createOrganicCity(source, 123);
  const before = JSON.stringify(city);
  const environment = organicFloodEnvironment(city);
  const bridge = geography.bridges[0]!;
  expect(environment.roadDeckElevationsInMeters?.[bridge.edgeIds[0]!]).toBe(
    bridge.deckElevationInMeters,
  );
  expect(
    Object.keys(environment.permanentWaterSurfaceElevationsInMeters ?? {})
      .length,
  ).toBeGreaterThan(0);
  const simulation = new DistrictSimulation({
    ...city,
    citizens: createStaticPopulation(city),
  });
  for (const arm of ['before', 'after'] as const) {
    simulation.selectArm(arm);
    expect(simulation.snapshot.blockedRoadEdgeIds).not.toContain(
      bridge.edgeIds[0],
    );
  }
  simulation.start();
  simulation.advance(1);
  simulation.reset();
  expect(simulation.snapshot.blockedRoadEdgeIds).not.toContain(
    bridge.edgeIds[0],
  );
  expect(JSON.stringify(city)).toBe(before);
  expect(organicFloodEnvironment(source)).toEqual({});
});

it('actually routes a person across the lake on the connected bridge edge', () => {
  const { city, geography } = createOrganicCity(source, 123);
  const bridge = geography.bridges[0]!;
  const edge = city.roadGraph!.edges!.find((e) => e.id === bridge.edgeIds[0])!;
  const engine = new EvacuationEngine({
    roadGraph: { nodes: city.roadGraph!.nodes, edges: city.roadGraph!.edges! },
    citizens: [
      {
        id: 'cross-bank',
        homeBuildingId: city.buildings[0]!.id,
        nodeId: edge.from,
        position: { ...bridge.start },
        mobilityFactor: 1,
        reactionDelayInSeconds: 0,
      },
    ],
    shelters: [
      { id: 'opposite-bank', nodeId: edge.to, active: true, capacity: 1 },
    ],
  });
  const crossing = engine.advance(edge.lengthInMeters / 2 / 1.2, []);
  expect(crossing.citizens[0]!.currentEdgeId).toBe(edge.id);
  expect(crossing.citizens[0]!.status).toBe('evacuating');
  const p = crossing.citizens[0]!.position;
  expect(waterSurfaceAt(geography, p)).toBeDefined();
  expect(sampleRoadSurfaceHeight(city, p.x, p.y)).toBe(
    bridge.deckElevationInMeters,
  );
  expect(engine.advance(edge.lengthInMeters / 1.2, []).evacuatedCount).toBe(1);
});

it('uses the actual Scene ground mesh for organic relief and flat basins without a covering plane', () => {
  const material = new THREE.MeshStandardMaterial();
  for (const relief of [true, false]) {
    const { city, geography } = createOrganicCity(source, 123, { relief });
    const ground = createCityGround(city, material);
    expect(ground.rotation.x).toBe(0);
    expect(ground.position.toArray()).toEqual([0, 0, 0]);
    ground.geometry.computeBoundingBox();
    expect(ground.geometry.boundingBox!.min.y).toBeLessThan(
      geography.lake.level,
    );
    expect(ground.geometry.getAttribute('position').count).toBe(
      city.terrainGrid!.xCoordinates.length *
        city.terrainGrid!.yCoordinates.length,
    );
    ground.geometry.dispose();
  }
  const legacy = createCityGround(source, material);
  legacy.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(legacy);
  expect(bounds.min.y).toBeCloseTo(25);
  expect(bounds.max.y).toBeCloseTo(25);
  legacy.geometry.dispose();
  material.dispose();
});
