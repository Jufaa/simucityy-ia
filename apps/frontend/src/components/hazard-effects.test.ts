import { expect, it, vi } from 'vitest';
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
  tsunami.setWaveFront(120, 1.5);
  tsunami.animate(0.5, true);
  expect(wave.visible).toBe(true);
  expect(wave.position.x).toBeGreaterThan(-20);
  expect(wave.position.x).toBeLessThanOrEqual(120);
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

it('fire flames follow actual local impact arrival and freeze/reset without reallocating buffers', () => {
  const city = demoCity();
  const assessment = assessStructuralDamage(scenarioOf(city), 'fire', {
    seed: city.config.seed ?? 123,
  });
  const layer = createHazardEffects(city, 'fire', assessment);
  const flames = layer.group.getObjectByName(
    'fire-flames',
  ) as THREE.InstancedMesh;
  const smoke = layer.group.getObjectByName(
    'fire-smoke',
  ) as THREE.InstancedMesh;
  expect(flames).toBeInstanceOf(THREE.InstancedMesh);
  const buffer = flames.instanceMatrix;
  layer.update(
    assessment.buildings.map((damage) => buildingImpactAt(damage, 'fire', 0)),
    [],
  );
  layer.animate(0.1, true, 0);
  expect(flames.count).toBe(0);
  const onset = Math.min(
    ...assessment.buildings.map(
      (damage) => damage.impactStartTimeInSeconds ?? Infinity,
    ),
  );
  layer.update(
    assessment.buildings.map((damage) =>
      buildingImpactAt(damage, 'fire', onset + 20),
    ),
    [],
  );
  layer.animate(0.1, true, onset + 20);
  expect(flames.count).toBeGreaterThan(0);
  expect(flames.count + smoke.count).toBeLessThanOrEqual(512);
  const first = Array.from(flames.instanceMatrix.array);
  layer.animate(0.2, false, onset + 30);
  layer.animate(NaN, true, onset + 40);
  expect(Array.from(flames.instanceMatrix.array)).toEqual(first);
  layer.animate(0.1, true, onset + 21);
  expect(flames.instanceMatrix).toBe(buffer);
  expect(Array.from(flames.instanceMatrix.array)).not.toEqual(first);
  layer.reset();
  expect(flames.count).toBe(0);
  expect(smoke.count).toBe(0);
  layer.group.traverse((object) => {
    if (object.name.startsWith('hazard-damaged:'))
      expect(object.visible).toBe(false);
  });
  layer.dispose();
});

it('tornado uses simulation time for a bounded moving funnel and owns resources exactly once', () => {
  const city = demoCity();
  const assessment = assessStructuralDamage(scenarioOf(city), 'tornado');
  const layer = createHazardEffects(city, 'tornado', assessment);
  const funnel = layer.group.getObjectByName(
    'tornado-funnel',
  ) as THREE.InstancedMesh;
  const debris = layer.group.getObjectByName(
    'tornado-flying-debris',
  ) as THREE.InstancedMesh;
  expect(funnel).toBeInstanceOf(THREE.InstancedMesh);
  layer.animate(0.1, true, 29);
  expect(funnel.visible).toBe(false);
  layer.animate(0.1, true, 100);
  expect(funnel.visible).toBe(true);
  const first = Array.from(funnel.instanceMatrix.array);
  layer.animate(0.1, false, 130);
  expect(Array.from(funnel.instanceMatrix.array)).toEqual(first);
  layer.animate(0.1, true, 130);
  expect(Array.from(funnel.instanceMatrix.array)).not.toEqual(first);
  expect(funnel.count + debris.count).toBeLessThanOrEqual(512);
  layer.animate(0.1, true, 211);
  expect(funnel.visible).toBe(false);
  const resources = new Set<{ dispose(): void }>();
  layer.group.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) {
      resources.add(object);
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        resources.add(material);
    }
  });
  const spies = [...resources].map((resource) => vi.spyOn(resource, 'dispose'));
  layer.reset();
  expect(funnel.visible).toBe(false);
  layer.dispose();
  layer.dispose();
  spies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
  expect(layer.group.children).toHaveLength(0);
});

it.each(['fire', 'tornado'] as const)(
  'projects a recreated paused %s arm at absolute event time without advancing clocks',
  (hazard) => {
    const city = demoCity();
    const assessment = assessStructuralDamage(scenarioOf(city), hazard);
    const impacts = assessment.buildings.map((item) =>
      buildingImpactAt(item, hazard, 120),
    );
    const active = createHazardEffects(city, hazard, assessment);
    active.update(impacts, []);
    active.animate(0.1, true, 120);
    const paused = createHazardEffects(city, hazard, assessment);
    paused.update(impacts, []);
    paused.setSimulationTime(120);
    const name = hazard === 'fire' ? 'fire-flames' : 'tornado-funnel';
    const a = active.group.getObjectByName(name) as THREE.InstancedMesh;
    const b = paused.group.getObjectByName(name) as THREE.InstancedMesh;
    expect(b.count).toBeGreaterThan(0);
    expect(b.count).toBe(a.count);
    expect(b.visible).toBe(a.visible);
    expect(Array.from(b.instanceMatrix.array)).toEqual(
      Array.from(a.instanceMatrix.array),
    );
    const before = Array.from(b.instanceMatrix.array);
    paused.animate(0.25, false, 140);
    expect(Array.from(b.instanceMatrix.array)).toEqual(before);
    active.dispose();
    paused.dispose();
  },
);
