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

it('adds a representative spire to religious buildings in both render paths', () => {
  const boxChurch = {
    id: 'box-church',
    minCorner: { x: 20, y: 20 },
    maxCorner: { x: 38, y: 34 },
    heightInMeters: 21,
    landmark: 'religious' as const,
    architecture,
  };
  const layer = createBuildingLayer(flatCity([boxChurch]));
  const spireIds: string[] = [];
  layer.getObjectByName('building-spires')!.traverse((object) => {
    if (object instanceof THREE.InstancedMesh)
      spireIds.push(...(object.userData.buildingIds as string[]));
  });
  expect(spireIds).toEqual(['box-church']);

  const footprintChurch = {
    id: 'footprint-church',
    minCorner: { x: 20, y: 20 },
    maxCorner: { x: 50, y: 50 },
    heightInMeters: 29,
    landmark: 'religious' as const,
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
  };
  const footprintLayer = createBuildingLayer(flatCity([footprintChurch]));
  const group = footprintLayer.getObjectByName('footprint:footprint-church')!;
  // Walls, caps, the spire and its cross finial.
  expect(group.children).toHaveLength(4);
  const bounds = new THREE.Box3().setFromObject(group);
  expect(bounds.max.y).toBeGreaterThan(25 + 29 + 6);
});

it('renders landmarks exact with 3D parts, hospital cross and stadium floodlights', () => {
  const basilica = {
    id: 'basilica',
    minCorner: { x: 20, y: 20 },
    maxCorner: { x: 50, y: 50 },
    heightInMeters: 24,
    landmark: 'religious' as const,
    presentation: { widthInMeters: 30, depthInMeters: 30, yawInRadians: 0 },
    footprint: [
      { x: 20, y: 20 },
      { x: 50, y: 20 },
      { x: 50, y: 50 },
      { x: 20, y: 50 },
    ],
    parts: [
      {
        footprint: [
          { x: 32, y: 32 },
          { x: 38, y: 32 },
          { x: 38, y: 38 },
          { x: 32, y: 38 },
        ],
        heightInMeters: 60,
        minHeightInMeters: 24,
      },
    ],
    architecture,
  };
  const hospital = {
    id: 'hospital-central',
    minCorner: { x: 80, y: 20 },
    maxCorner: { x: 100, y: 38 },
    heightInMeters: 18,
    landmark: 'health' as const,
    architecture,
  };
  const stadium = {
    id: 'stadium',
    minCorner: { x: 120, y: 20 },
    maxCorner: { x: 170, y: 60 },
    heightInMeters: 16,
    landmark: 'stadium' as const,
    presentation: { widthInMeters: 50, depthInMeters: 40, yawInRadians: 0 },
    footprint: [
      { x: 120, y: 20 },
      { x: 170, y: 20 },
      { x: 170, y: 60 },
      { x: 120, y: 60 },
    ],
    architecture,
  };
  const city = flatCity([basilica, hospital, stadium]);
  const layer = createBuildingLayer(city);
  // Even a plain rectangular stadium footprint renders exact (landmark).
  const stadiumGroup = layer.getObjectByName('footprint:stadium')!;
  expect(stadiumGroup).toBeInstanceOf(THREE.Group);
  // Walls + caps + 4 floodlight poles + 4 heads.
  expect(stadiumGroup.children.length).toBeGreaterThanOrEqual(10);
  const basilicaGroup = layer.getObjectByName('footprint:basilica')!;
  const basilicaBounds = new THREE.Box3().setFromObject(basilicaGroup);
  // The tower part reaches its real 60 m plus its tapered pinnacle cap
  // and the cross finial on top of it.
  expect(basilicaBounds.max.y).toBeCloseTo(25 + 60 + 9.6 + 4);
  // Box-rendered hospital still gets its red-cross roof marker, and the
  // marker participates in collapse transforms.
  const marker = layer.getObjectByName('marker:hospital-central')!;
  expect(marker).toBeInstanceOf(THREE.Group);
  expect(marker.children).toHaveLength(3);
  const collapse = attachBuildingCollapse(layer, city);
  collapse('hospital-central', 1);
  expect(marker.scale.y).toBeLessThan(0.5);
  collapse('hospital-central', 0);
  expect(marker.scale.y).toBe(1);
});

it('renders a monument as plinth plus tapered figure at its real height', () => {
  const statue = {
    id: 'statue',
    minCorner: { x: 20, y: 20 },
    maxCorner: { x: 80, y: 80 },
    heightInMeters: 10,
    landmark: 'monument' as const,
    presentation: { widthInMeters: 60, depthInMeters: 60, yawInRadians: 0 },
    footprint: [
      { x: 20, y: 20 },
      { x: 80, y: 20 },
      { x: 80, y: 80 },
      { x: 20, y: 80 },
    ],
    parts: [
      {
        footprint: [
          { x: 35, y: 35 },
          { x: 65, y: 35 },
          { x: 65, y: 65 },
          { x: 35, y: 65 },
        ],
        heightInMeters: 47,
        minHeightInMeters: 10,
      },
      {
        // The figure itself: floating in the upper half, 47-93 m.
        footprint: [
          { x: 45, y: 45 },
          { x: 55, y: 45 },
          { x: 55, y: 55 },
          { x: 45, y: 55 },
        ],
        heightInMeters: 93,
        minHeightInMeters: 47,
      },
    ],
    architecture,
  };
  const layer = createBuildingLayer(flatCity([statue]));
  const group = layer.getObjectByName('footprint:statue')!;
  const figure = layer.getObjectByName('monument-figure:statue')!;
  expect(figure).toBeInstanceOf(THREE.Mesh);
  // A raised torch arm with an emissive flame finishes the figure.
  expect(layer.getObjectByName('monument-torch:statue')).toBeInstanceOf(
    THREE.Mesh,
  );
  const bounds = new THREE.Box3().setFromObject(group);
  // Flat base at terrain 25 m; the flame lands near the real 93 m top.
  expect(bounds.max.y).toBeGreaterThan(25 + 93);
  expect(bounds.max.y).toBeLessThan(25 + 98);
  // The plinth does not become a solid 93 m block: the tallest geometry
  // is only the narrow figure plus its arm.
  const figureBounds = new THREE.Box3().setFromObject(figure);
  expect(figureBounds.max.x - figureBounds.min.x).toBeLessThan(18);
});

it('gives cathedrals twin spired towers unless surveyed parts exist', () => {
  const cathedral = {
    id: 'lujan-like',
    minCorner: { x: 20, y: 20 },
    maxCorner: { x: 50, y: 80 },
    heightInMeters: 26,
    landmark: 'cathedral' as const,
    presentation: { widthInMeters: 30, depthInMeters: 60, yawInRadians: 0 },
    footprint: [
      { x: 20, y: 20 },
      { x: 50, y: 20 },
      { x: 50, y: 80 },
      { x: 20, y: 80 },
    ],
    architecture,
  };
  const layer = createBuildingLayer(flatCity([cathedral]));
  const towers = layer.getObjectByName('cathedral-towers:lujan-like')!;
  expect(towers).toBeInstanceOf(THREE.Group);
  expect(towers.children).toHaveLength(8);
  const bounds = new THREE.Box3().setFromObject(
    layer.getObjectByName('footprint:lujan-like')!,
  );
  // Nave 26 m + tower rise (23.4) + spire + cross, well above the nave.
  expect(bounds.max.y).toBeGreaterThan(25 + 26 + 18 + 8);

  const surveyed = {
    ...cathedral,
    id: 'sagrada-like',
    parts: [
      {
        footprint: [
          { x: 32, y: 32 },
          { x: 38, y: 32 },
          { x: 38, y: 38 },
          { x: 32, y: 38 },
        ],
        heightInMeters: 90,
        minHeightInMeters: 26,
      },
    ],
  };
  const surveyedLayer = createBuildingLayer(flatCity([surveyed]));
  // Surveyed towers win: no archetype towers, but the cross finial stays.
  expect(
    surveyedLayer.getObjectByName('cathedral-towers:sagrada-like'),
  ).toBeUndefined();
  expect(surveyedLayer.getObjectByName('cross:sagrada-like')).toBeInstanceOf(
    THREE.Group,
  );

  // Concave footprint whose front bbox corner is cut away (a tower there
  // would stand loose in the street): towers walk inside the footprint.
  const concave = {
    ...cathedral,
    id: 'concava',
    footprint: [
      { x: 35, y: 20 },
      { x: 50, y: 35 },
      { x: 50, y: 80 },
      { x: 20, y: 80 },
      { x: 20, y: 35 },
    ],
  };
  const concaveLayer = createBuildingLayer(flatCity([concave]));
  const concaveTowers = concaveLayer.getObjectByName(
    'cathedral-towers:concava',
  )!;
  expect(concaveTowers).toBeInstanceOf(THREE.Group);
  const shafts = concaveTowers.children.filter(
    (child, index) => index % 4 === 0,
  );
  // Local footprint x spans -15..15; the cut corner tower moved inward.
  expect(shafts[0]!.position.x).toBeGreaterThan(-15 + 1);
  expect(shafts[0]!.position.z).toBeGreaterThan(-30 + 1);
});

it('renders stadiums as an open bowl and obelisks with a pyramidion tip', () => {
  const stadium = {
    id: 'bowl',
    minCorner: { x: 20, y: 20 },
    maxCorner: { x: 70, y: 60 },
    heightInMeters: 16,
    landmark: 'stadium' as const,
    presentation: { widthInMeters: 50, depthInMeters: 40, yawInRadians: 0 },
    footprint: [
      { x: 20, y: 20 },
      { x: 70, y: 20 },
      { x: 70, y: 60 },
      { x: 20, y: 60 },
    ],
    architecture,
  };
  const obelisk = {
    id: 'obelisk',
    minCorner: { x: 120, y: 20 },
    maxCorner: { x: 127, y: 27 },
    heightInMeters: 18,
    landmark: 'monument' as const,
    monumentShape: 'obelisk' as const,
    presentation: { widthInMeters: 7, depthInMeters: 7, yawInRadians: 0 },
    footprint: [
      { x: 120, y: 20 },
      { x: 127, y: 20 },
      { x: 127, y: 27 },
      { x: 120, y: 27 },
    ],
    architecture,
  };
  const layer = createBuildingLayer(flatCity([stadium, obelisk]));
  // No flat roof slab over the bowl: pitch sits at 52% of the rim height.
  const pitch = layer.getObjectByName('stadium-pitch:bowl')!;
  expect(pitch).toBeInstanceOf(THREE.Mesh);
  layer.updateMatrixWorld(true);
  const pitchBounds = new THREE.Box3().setFromObject(pitch);
  expect(pitchBounds.max.y).toBeCloseTo(25 + 16 * 0.52);
  expect(layer.getObjectByName('stadium-bowl:bowl')).toBeInstanceOf(THREE.Mesh);
  // Obelisk: tapered shaft + pyramidion reaches exactly its 18 m, no more.
  const obeliskGroup = layer.getObjectByName('footprint:obelisk')!;
  const obeliskBounds = new THREE.Box3().setFromObject(obeliskGroup);
  expect(obeliskBounds.max.y).toBeCloseTo(25 + 18);
  expect(layer.getObjectByName('monument-torch:obelisk')).toBeUndefined();
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
