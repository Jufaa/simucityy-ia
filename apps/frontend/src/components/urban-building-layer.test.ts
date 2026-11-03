import { expect, it } from 'vitest';
import * as THREE from 'three';
import {
  attachBuildingCollapse,
  createBuildingLayer,
  footprintIsComplex,
} from './urban-building-layer';
import { countChunkInstances } from './instanced-chunks';
import type { CityResponse } from './city-types';

const flatCity = (buildings: CityResponse['buildings']): CityResponse => ({
  config: {
    widthInMeters: 200,
    heightInMeters: 200,
    streetSpacingInMeters: 50,
  },
  terrain: { kind: 'flat', elevationInMeters: 25 },
  buildings,
  roads: [],
  blocks: [],
});

const architecture = {
  style: 'apartment' as const,
  floors: 4,
  roof: 'flat' as const,
  roofRiseInMeters: 0,
  facade: 'stone' as const,
  entranceSide: 'south' as const,
  balconyDepthInMeters: 0,
};

it('renders distinct architecture while keeping the roof inside the declared total height', () => {
  const buildings = (['house', 'apartment', 'shop'] as const).map(
    (style, index) => ({
      id: style,
      minCorner: { x: index * 20, y: 0 },
      maxCorner: { x: index * 20 + 10, y: 12 },
      heightInMeters: 12,
      architecture: {
        style,
        floors: 3,
        roof: style === 'house' ? ('gable' as const) : ('flat' as const),
        roofRiseInMeters: style === 'house' ? 2 : 0,
        facade: 'sand' as const,
        entranceSide: 'north' as const,
        balconyDepthInMeters: style === 'apartment' ? 0.8 : 0,
      },
    }),
  );
  const city: CityResponse = {
    config: {
      widthInMeters: 100,
      heightInMeters: 100,
      streetSpacingInMeters: 50,
    },
    terrain: { kind: 'flat', elevationInMeters: 25 },
    buildings,
    roads: [],
    blocks: [],
  };
  const before = structuredClone(city);
  const layer = createBuildingLayer(city);
  const roofs = layer.getObjectByName('building-roofs')!;
  expect(countChunkInstances(roofs)).toBe(1);
  const storefronts = layer.getObjectByName('building-storefronts')!;
  expect(countChunkInstances(storefronts)).toBe(1);
  expect(layer.getObjectByName('balcony-slabs')).toBeInstanceOf(THREE.Group);
  // The per-building marker preserves id lookup and base height.
  expect(layer.getObjectByName('house')!.position.y).toBeCloseTo(25);
  const facades = layer.getObjectByName('building-facade-sand')!;
  const facadeIds: string[] = [];
  facades.traverse((object) => {
    if (object instanceof THREE.InstancedMesh)
      facadeIds.push(...(object.userData.buildingIds as string[]));
  });
  expect(facadeIds.sort()).toEqual(['apartment', 'house', 'shop']);
  const bounds = new THREE.Box3().setFromObject(layer);
  expect(bounds.max.y).toBeCloseTo(37);
  expect(bounds.min.y).toBeCloseTo(25);
  expect(city).toEqual(before);
});

it('renders complex footprints as exact extrusions with holes, outside the instanced buckets', () => {
  const complex = {
    id: 'church',
    minCorner: { x: 20, y: 20 },
    maxCorner: { x: 50, y: 50 },
    heightInMeters: 24,
    presentation: { widthInMeters: 30, depthInMeters: 30, yawInRadians: 0 },
    footprint: [
      { x: 20, y: 20 },
      { x: 50, y: 20 },
      { x: 50, y: 35 },
      { x: 35, y: 35 },
      { x: 35, y: 50 },
      { x: 20, y: 50 },
    ],
    footprintHoles: [
      [
        { x: 24, y: 24 },
        { x: 30, y: 24 },
        { x: 30, y: 30 },
        { x: 24, y: 30 },
      ],
    ],
    architecture,
  };
  const simple = {
    id: 'block',
    minCorner: { x: 80, y: 20 },
    maxCorner: { x: 95, y: 35 },
    heightInMeters: 12,
    presentation: { widthInMeters: 15, depthInMeters: 15, yawInRadians: 0 },
    footprint: [
      { x: 80, y: 20 },
      { x: 95, y: 20 },
      { x: 95, y: 35 },
      { x: 80, y: 35 },
    ],
    architecture,
  };
  expect(footprintIsComplex(complex)).toBe(true);
  expect(footprintIsComplex(simple)).toBe(false);
  const layer = createBuildingLayer(flatCity([complex, simple]));
  const footprintGroup = layer.getObjectByName('footprint:church')!;
  expect(footprintGroup).toBeInstanceOf(THREE.Group);
  expect(footprintGroup.children).toHaveLength(2);
  const bounds = new THREE.Box3().setFromObject(footprintGroup);
  expect(bounds.max.y).toBeCloseTo(25 + 24);
  expect(bounds.min.x).toBeCloseTo(20);
  // The L-shape notch stays empty: no geometry reaches the missing quadrant.
  expect(bounds.max.x).toBeCloseTo(50);
  const facadeIds: string[] = [];
  layer.getObjectByName('building-facade-stone')!.traverse((object) => {
    if (object instanceof THREE.InstancedMesh)
      facadeIds.push(...(object.userData.buildingIds as string[]));
  });
  expect(facadeIds).toEqual(['block']);
});

it('collapses instanced buildings and footprint groups, restoring exact transforms at zero', () => {
  const building = {
    id: 'tower',
    minCorner: { x: 20, y: 20 },
    maxCorner: { x: 35, y: 35 },
    heightInMeters: 30,
    architecture,
  };
  const city = flatCity([building]);
  const layer = createBuildingLayer(city);
  const collapse = attachBuildingCollapse(layer, city);
  const facade = layer.getObjectByName('building-facade-stone')!;
  let mesh: THREE.InstancedMesh | undefined;
  facade.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) mesh = object;
  });
  const before = new THREE.Matrix4();
  mesh!.getMatrixAt(0, before);
  collapse('tower', 1);
  const fallen = new THREE.Matrix4();
  mesh!.getMatrixAt(0, fallen);
  expect(fallen.elements).not.toEqual(before.elements);
  // Caps travel with the facade: they carry building ids now too.
  let capsMesh: THREE.InstancedMesh | undefined;
  layer.traverse((object) => {
    if (
      object instanceof THREE.InstancedMesh &&
      object.name.startsWith('building-caps') &&
      (object.userData.buildingIds as string[])?.includes('tower')
    )
      capsMesh = object;
  });
  expect(capsMesh).toBeDefined();
  const capsFallen = new THREE.Matrix4();
  capsMesh!.getMatrixAt(0, capsFallen);
  collapse('tower', 0);
  const restored = new THREE.Matrix4();
  mesh!.getMatrixAt(0, restored);
  expect(restored.elements).toEqual(before.elements);

  const complexCity = flatCity([
    {
      id: 'church',
      minCorner: { x: 20, y: 20 },
      maxCorner: { x: 50, y: 50 },
      heightInMeters: 24,
      presentation: { widthInMeters: 30, depthInMeters: 30, yawInRadians: 0 },
      footprint: [
        { x: 20, y: 20 },
        { x: 50, y: 20 },
        { x: 50, y: 35 },
        { x: 35, y: 35 },
        { x: 35, y: 50 },
        { x: 20, y: 50 },
      ],
      architecture,
    },
  ]);
  const complexLayer = createBuildingLayer(complexCity);
  const complexCollapse = attachBuildingCollapse(complexLayer, complexCity);
  const group = complexLayer.getObjectByName('footprint:church')!;
  complexCollapse('church', 1);
  expect(group.scale.y).toBeLessThan(0.5);
  expect(Math.abs(group.rotation.z)).toBeGreaterThan(0.05);
  complexCollapse('church', 0);
  expect(group.scale.y).toBe(1);
  expect(group.rotation.z).toBeCloseTo(0);
});

it('chunks instances spatially instead of creating meshes per building', () => {
  const makeCity = (count: number): CityResponse => ({
    config: {
      widthInMeters: 1000,
      heightInMeters: 1000,
      streetSpacingInMeters: 50,
    },
    terrain: { kind: 'flat', elevationInMeters: 25 },
    buildings: Array.from({ length: count }, (_, index) => ({
      id: `b-${index}`,
      minCorner: { x: (index % 12) * 20, y: Math.floor(index / 12) * 20 },
      maxCorner: {
        x: (index % 12) * 20 + 10,
        y: Math.floor(index / 12) * 20 + 12,
      },
      heightInMeters: 12,
      architecture: {
        style: (['house', 'apartment', 'shop'] as const)[index % 3]!,
        floors: 3,
        roof: index % 3 === 0 ? ('gable' as const) : ('flat' as const),
        roofRiseInMeters: index % 3 === 0 ? 2 : 0,
        facade: (['sand', 'brick', 'stone'] as const)[index % 3]!,
        entranceSide: 'north' as const,
        balconyDepthInMeters: index % 3 === 1 ? 0.8 : 0,
      },
    })),
    roads: [],
    blocks: [],
  });
  const meshCount = (layer: THREE.Group) => {
    let total = 0;
    layer.traverse((object) => {
      if (object instanceof THREE.Mesh) total++;
    });
    return total;
  };
  const small = createBuildingLayer(makeCity(3));
  const large = createBuildingLayer(makeCity(120));
  // Instances are preserved; meshes scale with 120 m spatial chunks,
  // never with the 120 individual buildings.
  expect(countChunkInstances(large)).toBeGreaterThan(120);
  expect(meshCount(large)).toBeLessThan(120);
  expect(meshCount(large)).toBeGreaterThan(meshCount(small));
});

it('tints facade instances per building and varies roof colours', () => {
  const buildings = Array.from({ length: 12 }, (_, index) => ({
    id: `tint-${index}`,
    minCorner: { x: index * 20, y: 0 },
    maxCorner: { x: index * 20 + 10, y: 12 },
    heightInMeters: 12,
    architecture: { ...architecture, facade: 'sand' as const },
  }));
  const layer = createBuildingLayer(flatCity(buildings));
  const tints = new Set<string>();
  layer.getObjectByName('building-facade-sand')!.traverse((object) => {
    if (!(object instanceof THREE.InstancedMesh)) return;
    expect(object.instanceColor).not.toBeNull();
    const color = new THREE.Color();
    for (let i = 0; i < object.count; i++) {
      object.getColorAt(i, color);
      tints.add(`${color.r.toFixed(3)},${color.g.toFixed(3)}`);
    }
  });
  expect(tints.size).toBeGreaterThan(3);
  const capMaterials = new Set<number>();
  layer.getObjectByName('building-caps')!.traverse((object) => {
    if (object instanceof THREE.Mesh)
      capMaterials.add(
        (object.material as THREE.MeshStandardMaterial).color.getHex(),
      );
  });
  expect(capMaterials.size).toBeGreaterThan(1);
});

it('scales exact-footprint wall UVs to the 3 m facade module', () => {
  const complex = {
    id: 'church',
    minCorner: { x: 20, y: 20 },
    maxCorner: { x: 50, y: 40 },
    heightInMeters: 24,
    footprint: [
      { x: 20, y: 20 },
      { x: 50, y: 20 },
      { x: 50, y: 40 },
      { x: 35, y: 40 },
      { x: 35, y: 30 },
      { x: 20, y: 30 },
    ],
    footprintHoles: [
      [
        { x: 24, y: 24 },
        { x: 30, y: 24 },
        { x: 30, y: 28 },
        { x: 24, y: 28 },
      ],
    ],
    architecture,
  };
  const layer = createBuildingLayer(flatCity([complex]));
  const group = layer.getObjectByName('footprint:church')!;
  const walls = group.children[0] as THREE.Mesh;
  const uv = walls.geometry.getAttribute('uv');
  expect(uv).toBeDefined();
  let maxU = 0;
  for (let i = 0; i < uv.count; i++)
    maxU = Math.max(maxU, Math.abs(uv.getX(i)));
  // Unscaled extrude UVs are metres (up to ~30); scaled they stay module-sized.
  expect(maxU).toBeLessThanOrEqual(11);
});
