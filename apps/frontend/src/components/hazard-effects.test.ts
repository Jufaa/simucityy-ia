import { expect, it } from 'vitest';
import * as THREE from 'three';
import { assessStructuralDamage, buildingImpactAt } from '@simulicity/hazards';
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

it('marks earthquake damage, then rubble and debris when buildings collapse', () => {
  const city = demoCity();
  const before = JSON.stringify(city);
  const assessment = assessStructuralDamage(scenarioOf(city), 'earthquake');
  const layer = createHazardEffects(city, 'earthquake', assessment);
  expect(layer.group.getObjectByName('earthquake-cracks')).toBeTruthy();
  // Al inicio nada derrumbado: sin escombros visibles.
  layer.update(
    assessment.buildings.map((item) => buildingImpactAt(item, 'earthquake', 0)),
    [],
  );
  for (const item of assessment.buildings)
    expect(
      layer.group.getObjectByName(`hazard-rubble:${item.buildingId}`),
    ).toBeUndefined();
  // Al final del evento aparecen daño, derrumbes y calles cortadas.
  layer.update(
    assessment.buildings.map((item) =>
      buildingImpactAt(item, 'earthquake', 3600),
    ),
    assessment.blockedRoadEdgeIds,
  );
  for (const item of assessment.buildings) {
    if (item.collapsed)
      expect(
        layer.group.getObjectByName(`hazard-rubble:${item.buildingId}`)
          ?.visible,
      ).toBe(true);
    else if (item.damaged)
      expect(
        layer.group.getObjectByName(`hazard-damaged:${item.buildingId}`)
          ?.visible,
      ).toBe(true);
  }
  for (const edgeId of assessment.blockedRoadEdgeIds)
    expect(
      layer.group.getObjectByName(`hazard-debris:${edgeId}`)?.visible,
    ).toBe(true);
  // Los escombros crecen con la animación.
  const collapsed = assessment.buildings.find((item) => item.collapsed);
  if (collapsed) {
    const pile = layer.group.getObjectByName(
      `hazard-rubble:${collapsed.buildingId}`,
    )!;
    const initial = pile.scale.x;
    layer.animate(0.45, true);
    expect(pile.scale.x).toBeGreaterThan(initial);
  }
  expect(JSON.stringify(city)).toBe(before);
  layer.dispose();
  expect(layer.group.children).toHaveLength(0);
});

it('animates wind streaks only while running and the tsunami wave follows the solver front', () => {
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
  const surface = tsunami.group.getObjectByName('tsunami-wave-surface')!;
  // La ola ya no es una caja: es una superficie curvada con espuma.
  expect(surface).toBeInstanceOf(THREE.Mesh);
  expect((surface as THREE.Mesh).geometry).not.toBeInstanceOf(
    THREE.BoxGeometry,
  );
  expect(tsunami.group.getObjectByName('tsunami-foam')).toBeTruthy();
  expect(wave.visible).toBe(false);
  // Perfil desigual: el frente avanza más por el sur que por el norte,
  // como cuando los edificios frenan unas filas del solver más que otras.
  const heightInMeters = city.config.heightInMeters;
  tsunami.setWaveProfile([
    {
      zInMeters: 0,
      frontXInMeters: 140,
      depthInMeters: 1.5,
      speedInMetersPerSecond: 2,
    },
    {
      zInMeters: heightInMeters / 2,
      frontXInMeters: 120,
      depthInMeters: 1.2,
      speedInMetersPerSecond: 1.5,
    },
    {
      zInMeters: heightInMeters,
      frontXInMeters: 60,
      depthInMeters: 0.9,
      speedInMetersPerSecond: 1,
    },
  ]);
  // La ola entra con inercia (resorte): hacen falta varios frames para que
  // el frente recorra la costa hasta su objetivo.
  for (let frame = 0; frame < 120; frame++) tsunami.animate(1 / 30, true);
  expect(wave.visible).toBe(true);
  const positions = (surface as THREE.Mesh).geometry.getAttribute('position');
  let maxX = -Infinity,
    minX = Infinity;
  for (let i = 0; i < positions.count; i++) {
    maxX = Math.max(maxX, positions.getX(i));
    minX = Math.min(minX, positions.getX(i));
  }
  // La superficie se dobla: no todos los tramos llegan al mismo frente.
  expect(maxX).toBeGreaterThan(100);
  expect(maxX - minX).toBeGreaterThan(30);
  tsunami.reset();
  expect(wave.visible).toBe(false);
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
