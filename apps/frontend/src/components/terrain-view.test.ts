import { expect, it } from 'vitest';
import * as THREE from 'three';
import { generateCityScenario } from '../../../backend/src/modules/cities/city-scenario-generator';
import { FloodSimulation } from './flood-simulation';
import type { CityResponse } from './city-types';
import { createBuildingLayer } from './urban-building-layer';
import { createRoadMesh } from './create-road-mesh';
import {
  createReliefCity,
  createTerrainGeometry,
  sampleTerrainHeight,
  drapeSurfaceLayer,
  buildingBaseHeight,
} from './terrain-view';
import { createFloodLayer } from './flood-layer';

const makeCity = (): CityResponse =>
  JSON.parse(
    JSON.stringify(
      generateCityScenario({
        layout: 'district',
        detailLevel: 'urban',
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

it('derives deterministic relief without changing the source city and accumulates more water downhill', () => {
  const original = makeCity();
  const before = JSON.stringify(original);
  const city = createReliefCity(original);
  expect(city.terrainProfile).toBe('basin');
  expect(createReliefCity(original)).toEqual(city);
  expect(sampleTerrainHeight(city, 100, 100)).toBeLessThan(
    sampleTerrainHeight(city, 0, 0),
  );
  const simulation = new FloodSimulation({
    ...city,
    terrainGrid: city.terrainGrid!,
    roadGraph: { nodes: city.roadGraph!.nodes, edges: city.roadGraph!.edges! },
  });
  simulation.start();
  simulation.advance(24);
  const cells = simulation.cells;
  const lowest = cells.reduce(
    (best, cell, i) =>
      cell.groundElevationInMeters < cells[best]!.groundElevationInMeters
        ? i
        : best,
    0,
  );
  const highest = cells.reduce(
    (best, cell, i) =>
      cell.groundElevationInMeters > cells[best]!.groundElevationInMeters
        ? i
        : best,
    0,
  );
  expect(simulation.snapshot.waterDepthInMeters[lowest]!).toBeGreaterThan(
    simulation.snapshot.waterDepthInMeters[highest]!,
  );
  expect(
    simulation.snapshot.balance.volumeBalanceErrorInCubicMeters,
  ).toBeLessThan(1e-6);
  expect(JSON.stringify(original)).toBe(before);
  simulation.reset();
  expect(simulation.snapshot.maxWaterDepthInMeters).toBe(0);
});

it('uses the same heights for ground, draped streets and building foundations, preserving flat geometry', () => {
  const flat = makeCity();
  const city = createReliefCity(flat);
  const ground = createTerrainGeometry(city);
  const points = ground.getAttribute('position');
  for (let i = 0; i < points.count; i++)
    expect(points.getY(i)).toBeCloseTo(
      sampleTerrainHeight(city, points.getX(i), points.getZ(i)),
      4,
    );
  const road = createRoadMesh(
    { id: 'cross', start: { x: 0, y: 100 }, end: { x: 200, y: 100 } },
    25,
    new THREE.MeshStandardMaterial(),
  );
  drapeSurfaceLayer(road, city);
  road.updateMatrixWorld(true);
  const positions = road.geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const p = new THREE.Vector3()
      .fromBufferAttribute(positions, i)
      .applyMatrix4(road.matrixWorld);
    expect(p.y - sampleTerrainHeight(city, p.x, p.z)).toBeGreaterThanOrEqual(
      0.009,
    );
  }
  const buildings = createBuildingLayer(city);
  for (const building of city.buildings)
    expect(buildings.getObjectByName(building.id)!.position.y).toBeCloseTo(
      buildingBaseHeight(city, building),
    );
  const flatRoad = createRoadMesh(
    flat.roads[0]!,
    25,
    new THREE.MeshStandardMaterial(),
  );
  const before = flatRoad.geometry.clone();
  drapeSurfaceLayer(flatRoad, flat);
  expect(flatRoad.geometry.getAttribute('position').array).toEqual(
    before.getAttribute('position').array,
  );
});

it('clips visible relief water to wet terrain and clears its surface on reset', () => {
  const city = createReliefCity(makeCity());
  const input = {
    ...city,
    terrainGrid: city.terrainGrid!,
    roadGraph: { nodes: city.roadGraph!.nodes, edges: city.roadGraph!.edges! },
  };
  const simulation = new FloodSimulation(input);
  const layer = createFloodLayer(input, simulation.cells);
  simulation.start();
  simulation.advance(12);
  layer.update(simulation.snapshot);
  const surface = layer.group.getObjectByName('flood-surface') as THREE.Mesh;
  expect(surface.visible).toBe(true);
  expect(surface.geometry.drawRange.count).toBeGreaterThan(0);
  const points = surface.geometry.getAttribute('position');
  for (let i = 0; i < surface.geometry.drawRange.count; i++)
    expect(points.getY(i) + 0.0001).toBeGreaterThanOrEqual(
      sampleTerrainHeight(city, points.getX(i), points.getZ(i)),
    );
  simulation.reset();
  layer.update(simulation.snapshot);
  expect(surface.visible).toBe(false);
  layer.dispose();
});
