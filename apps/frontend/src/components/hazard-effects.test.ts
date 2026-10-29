import { expect, it } from 'vitest';
import * as THREE from 'three';
import { assessStructuralDamage } from '@simulicity/hazards';
import { createDemoCompatibleScenario } from '../../../../packages/hazards/src/defaults';
import type { CityResponse } from './city-types';
import { createCityAtmosphere } from './city-atmosphere';
import { createHazardEffects } from './hazard-effects';

function demoCity(): CityResponse {
  const scenario = createDemoCompatibleScenario(200, 200, 25);
  return {
    config: {
      widthInMeters: 200,
      heightInMeters: 200,
      streetSpacingInMeters: 50,
      seed: 123,
    },
    terrain: {
      kind: 'flat',
      elevationInMeters: scenario.terrain.elevationInMeters,
    },
    terrainGrid: scenario.terrainGrid,
    roads: [],
    blocks: [],
    buildings: scenario.buildings.map((building) => ({ ...building })),
    roadGraph: {
      nodes: scenario.roadGraph.nodes.map((node) => ({ ...node })),
      edges: scenario.roadGraph.edges.map((edge) => ({ ...edge })),
    },
    citizens: [],
    shelters: [],
  };
}

function scenarioOf(city: CityResponse) {
  return {
    terrain: city.terrain,
    terrainGrid: city.terrainGrid!,
    roadGraph: {
      nodes: city.roadGraph!.nodes,
      edges: city.roadGraph!.edges!,
    },
    buildings: city.buildings,
  };
}

it('marks earthquake damage, debris and cracks without changing the city', () => {
  const city = demoCity();
  const before = JSON.stringify(city);
  const assessment = assessStructuralDamage(scenarioOf(city), 'earthquake');
  const layer = createHazardEffects(city, 'earthquake', assessment);
  expect(layer.group.getObjectByName('earthquake-cracks')).toBeTruthy();
  for (const id of assessment.damagedBuildingIds)
    expect(layer.group.getObjectByName(`hazard-damaged:${id}`)).toBeTruthy();
  if (assessment.blockedRoadEdgeIds.length)
    expect(layer.group.getObjectByName('hazard-debris')).toBeTruthy();
  expect(JSON.stringify(city)).toBe(before);
  layer.dispose();
  expect(layer.group.children).toHaveLength(0);
});

it('animates wind streaks only while running and resets the tsunami wave', () => {
  const city = demoCity();
  const scenario = scenarioOf(city);
  const wind = createHazardEffects(
    city,
    'strong-wind',
    assessStructuralDamage(scenario, 'strong-wind'),
  );
  const streaks = wind.group.getObjectByName(
    'wind-streaks',
  ) as THREE.LineSegments;
  const initial = Array.from(streaks.geometry.getAttribute('position').array);
  wind.animate(0.2, false);
  expect(Array.from(streaks.geometry.getAttribute('position').array)).toEqual(
    initial,
  );
  wind.animate(0.2, true);
  expect(
    Array.from(streaks.geometry.getAttribute('position').array),
  ).not.toEqual(initial);
  wind.dispose();

  const tsunami = createHazardEffects(
    city,
    'tsunami',
    assessStructuralDamage(scenario, 'tsunami'),
  );
  const wave = tsunami.group.getObjectByName('tsunami-wave')!;
  const startX = wave.position.x;
  tsunami.animate(0.5, true);
  expect(wave.position.x).toBeGreaterThan(startX);
  tsunami.reset();
  expect(wave.position.x).toBe(startX);
  tsunami.dispose();
});

it('builds a gradient sky dome with drifting clouds that dispose cleanly', () => {
  const atmosphere = createCityAtmosphere({ x: 100, z: 100 }, 500, 'storm');
  const sky = atmosphere.group.getObjectByName('sky-dome') as THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshBasicMaterial
  >;
  expect(sky.material.side).toBe(THREE.BackSide);
  expect(sky.geometry.getAttribute('color').count).toBe(
    sky.geometry.getAttribute('position').count,
  );
  const clouds = atmosphere.group.getObjectByName(
    'clouds',
  ) as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4();
  clouds.getMatrixAt(0, matrix);
  atmosphere.animate(1);
  const moved = new THREE.Matrix4();
  clouds.getMatrixAt(0, moved);
  expect(moved.equals(matrix)).toBe(false);
  atmosphere.dispose();
  expect(atmosphere.group.children).toHaveLength(0);
});
