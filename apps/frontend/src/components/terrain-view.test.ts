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
  buildingGroundRangeInMeters,
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
  let topClearance = -Infinity;
  for (let i = 0; i < positions.count; i++) {
    const p = new THREE.Vector3()
      .fromBufferAttribute(positions, i)
      .applyMatrix4(road.matrixWorld);
    // The road skirt intentionally drops below terrain; its top surface
    // must still clear the ground everywhere.
    const clearance = p.y - sampleTerrainHeight(city, p.x, p.z);
    topClearance = Math.max(topClearance, clearance);
    expect(clearance).toBeGreaterThanOrEqual(-0.25);
  }
  expect(topClearance).toBeGreaterThanOrEqual(0.05);
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

it('clears interior DEM spikes under real-city buildings instead of sinking them', () => {
  // Terrarium/SRTM city DEMs carry building-height spikes: a peak inside
  // the footprint must raise the pad even when all four corners are low.
  const building = {
    id: 'spike-house',
    minCorner: { x: 40, y: 40 },
    maxCorner: { x: 60, y: 60 },
    heightInMeters: 9,
    architecture: {
      style: 'house' as const,
      floors: 3,
      roof: 'gable' as const,
      roofRiseInMeters: 2,
      facade: 'sand' as const,
      entranceSide: 'south' as const,
      balconyDepthInMeters: 0,
    },
  };
  const city: CityResponse = {
    config: {
      widthInMeters: 100,
      heightInMeters: 100,
      streetSpacingInMeters: 50,
    },
    terrain: { kind: 'flat', elevationInMeters: 10 },
    real: {
      name: 'test',
      bbox: { south: 0, west: 0, north: 0.001, east: 0.001 },
      attribution: 'test',
      demSource: 'test-dem',
      demCellSizeInMeters: 50,
      measuredBuildingHeights: 0,
      estimatedBuildingHeights: 0,
      syntheticBuildings: 0,
      landmarkBuildings: 0,
    },
    roads: [],
    blocks: [],
    buildings: [building],
    terrainGrid: {
      source: 'test-dem',
      xCoordinates: [0, 50, 100],
      yCoordinates: [0, 50, 100],
      elevationsInMeters: [
        [10, 10, 10],
        [10, 30, 10],
        [10, 10, 10],
      ],
    },
  };
  const range = buildingGroundRangeInMeters(city, building);
  expect(range.maxInMeters).toBe(30);
  expect(range.minInMeters).toBeLessThan(30);
  expect(buildingBaseHeight(city, building)).toBe(30);
  const layer = createBuildingLayer(city);
  expect(layer.getObjectByName('spike-house')!.position.y).toBe(30);
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
