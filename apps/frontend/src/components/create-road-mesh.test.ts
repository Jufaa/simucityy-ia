import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createRoadLayer, createRoadMesh } from './create-road-mesh';
import { countChunkInstances } from './instanced-chunks';
import type { Road } from './city-types';

it('uses each road profile for both individual and batched pavement widths', () => {
  const material = new THREE.MeshStandardMaterial();
  const roads: Road[] = [12, 8, 4].map((widthInMeters, i) => ({
    id: `profile-${i}`,
    start: { x: 0, y: 20 * i },
    end: { x: 50, y: 20 * i },
    profile: {
      kind: i === 0 ? 'avenue' : i === 1 ? 'local' : 'alley',
      widthInMeters,
      sidewalkWidthInMeters: 2,
      motorVehiclesAllowed: i !== 2,
    },
  }));
  for (const road of roads) {
    const mesh = createRoadMesh(road, 0, material, 6);
    expect(mesh.geometry.parameters.depth).toBe(road.profile!.widthInMeters);
    mesh.geometry.dispose();
  }
  const layer = createRoadLayer(roads, 0, material, 6);
  const widths: number[] = [];
  layer.traverse((object) => {
    if (!(object instanceof THREE.InstancedMesh)) return;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, matrix);
      widths.push(new THREE.Vector3().setFromMatrixScale(matrix).z);
    }
    object.geometry.dispose();
    object.dispose();
  });
  expect(widths.sort((a, b) => a - b)).toEqual([4, 8, 12]);
  material.dispose();
});

it.each([
  { id: 'horizontal', start: { x: 0, y: 50 }, end: { x: 100, y: 50 } },
  { id: 'vertical', start: { x: 50, y: 0 }, end: { x: 50, y: 100 } },
])(
  'renders $id as a six-metre road above terrain with unchanged endpoints',
  (road) => {
    const before = structuredClone(road);
    const material = new THREE.MeshStandardMaterial();
    const mesh = createRoadMesh(road, 25, material);
    expect(mesh.geometry.parameters).toMatchObject({
      width: 100,
      height: 0.3,
      depth: 6,
    });
    // The deep skirt drops below terrain; the driving top stays at +0.06.
    expect(mesh.position.y + 0.15).toBeCloseTo(25.06);
    for (const [offset, point] of [
      [-50, road.start],
      [50, road.end],
    ] as const) {
      const end = new THREE.Vector3(offset, 0, 0)
        .applyEuler(mesh.rotation)
        .add(mesh.position);
      expect(end.x).toBeCloseTo(point.x);
      expect(end.z).toBeCloseTo(point.y);
    }
    expect(mesh.material).toBe(material);
    expect(mesh.receiveShadow).toBe(true);
    expect(road).toEqual(before);
    mesh.geometry.dispose();
    material.dispose();
  },
);

it('renders roads as spatially chunked instances', () => {
  const material = new THREE.MeshStandardMaterial();
  const roads = Array.from({ length: 40 }, (_, index) => ({
    id: `road-${index}`,
    start: { x: index * 10, y: 0 },
    end: { x: index * 10, y: 50 },
  }));
  const layer = createRoadLayer(roads, 25, material);
  expect(layer.userData.roadIds).toEqual(roads.map((road) => road.id));
  expect(countChunkInstances(layer)).toBe(40);
  // 400 m of roads span several chunks, each independently cullable.
  let chunks = 0;
  const centersX: number[] = [];
  layer.traverse((object) => {
    if (!(object instanceof THREE.InstancedMesh)) return;
    chunks++;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, matrix);
      centersX.push(matrix.elements[12]!);
    }
    object.geometry.dispose();
    object.dispose();
  });
  expect(chunks).toBeGreaterThan(1);
  expect(centersX).toContain(20);
  material.dispose();
});

it('supports explicit widths for the organic road and shoulder geometry', () => {
  const material = new THREE.MeshStandardMaterial();
  const mesh = createRoadMesh(
    { id: 'diagonal', start: { x: 0, y: 0 }, end: { x: 30, y: 40 } },
    2.2,
    material,
    8,
  );
  expect(mesh.geometry.parameters.depth).toBe(8);
  expect(mesh.geometry.parameters.width).toBe(50);
  mesh.geometry.dispose();
  material.dispose();
});

it('adds sidewalks and crosswalks without junction plates when a sidewalk material is given', () => {
  const material = new THREE.MeshStandardMaterial();
  const concrete = new THREE.MeshStandardMaterial({ color: 0xc1c5c7 });
  // Graph segments meet at the junction node, as in converted OSM data.
  const roads = [
    { id: 'w', start: { x: 0, y: 50 }, end: { x: 50, y: 50 } },
    { id: 'e', start: { x: 50, y: 50 }, end: { x: 100, y: 50 } },
    { id: 's', start: { x: 50, y: 0 }, end: { x: 50, y: 50 } },
    { id: 'n', start: { x: 50, y: 50 }, end: { x: 50, y: 100 } },
  ];
  const layer = createRoadLayer(roads, 25, material, 8, concrete);
  expect(layer.getObjectByName('road-sidewalks')).toBeInstanceOf(THREE.Group);
  expect(layer.getObjectByName('road-junction-asphalt')).toBeUndefined();
  expect(layer.getObjectByName('road-junction-sidewalks')).toBeUndefined();
  const crosswalks = layer.getObjectByName('road-crosswalks')!;
  let stripes = 0;
  crosswalks.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) stripes += object.count;
  });
  expect(stripes).toBe(16); // 4 arms x 4 bars at the single 4-way junction
  const plain = createRoadLayer(roads, 25, material, 6);
  expect(plain.getObjectByName('road-sidewalks')).toBeUndefined();
});

it('keeps crosswalks off straight intermediate nodes', () => {
  const material = new THREE.MeshStandardMaterial();
  const concrete = new THREE.MeshStandardMaterial();
  const roads = [
    { id: 'a', start: { x: 0, y: 0 }, end: { x: 50, y: 0 } },
    { id: 'b', start: { x: 50, y: 0 }, end: { x: 100, y: 0 } },
  ];
  const layer = createRoadLayer(roads, 25, material, 6, concrete);
  expect(layer.getObjectByName('road-junction-asphalt')).toBeUndefined();
  expect(layer.getObjectByName('road-crosswalks')).toBeUndefined();
});

it('clusters crosswalks from intersections closer than 40 m', () => {
  const material = new THREE.MeshStandardMaterial();
  const concrete = new THREE.MeshStandardMaterial();
  const arms = (cx: number, prefix: string) => [
    { id: `${prefix}w`, start: { x: cx - 40, y: 0 }, end: { x: cx, y: 0 } },
    { id: `${prefix}e`, start: { x: cx, y: 0 }, end: { x: cx + 40, y: 0 } },
    { id: `${prefix}s`, start: { x: cx, y: -40 }, end: { x: cx, y: 0 } },
    { id: `${prefix}n`, start: { x: cx, y: 0 }, end: { x: cx, y: 40 } },
  ];
  const layer = createRoadLayer(
    [...arms(0, 'a'), ...arms(10, 'b')],
    25,
    material,
    8,
    concrete,
  );
  let stripes = 0;
  layer.getObjectByName('road-crosswalks')!.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) stripes += object.count;
  });
  expect(stripes).toBe(16);
});

it('skips crosswalks on arms narrower than 7.5 m', () => {
  const material = new THREE.MeshStandardMaterial();
  const concrete = new THREE.MeshStandardMaterial();
  const roads = [
    { id: 'w', start: { x: 0, y: 50 }, end: { x: 50, y: 50 } },
    { id: 'e', start: { x: 50, y: 50 }, end: { x: 100, y: 50 } },
    { id: 's', start: { x: 50, y: 0 }, end: { x: 50, y: 50 } },
    { id: 'n', start: { x: 50, y: 50 }, end: { x: 50, y: 100 } },
  ];
  const layer = createRoadLayer(roads, 25, material, 6, concrete);
  expect(layer.getObjectByName('road-crosswalks')).toBeUndefined();
  expect(layer.getObjectByName('road-junction-asphalt')).toBeUndefined();
});

it('seals shared nodes with an asphalt infill bounded by the carriageway', () => {
  const material = new THREE.MeshStandardMaterial();
  const concrete = new THREE.MeshStandardMaterial();
  const roads = [
    { id: 'w', start: { x: 0, y: 50 }, end: { x: 50, y: 50 } },
    { id: 'e', start: { x: 50, y: 50 }, end: { x: 100, y: 50 } },
    { id: 's', start: { x: 50, y: 0 }, end: { x: 50, y: 50 } },
    { id: 'n', start: { x: 50, y: 50 }, end: { x: 50, y: 100 } },
  ];
  const layer = createRoadLayer(roads, 25, material, 8, concrete);
  const infill = layer.getObjectByName('road-junction-infill') as THREE.Mesh;
  expect(infill).toBeInstanceOf(THREE.Mesh);
  const positions = infill.geometry.getAttribute('position');
  expect(positions.count).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < positions.count; i++) {
    // Hull corners never leave the 8 m carriageway cross at the node.
    expect(Math.abs(positions.getX(i) - 50)).toBeLessThanOrEqual(4.01);
    expect(Math.abs(positions.getZ(i) - 50)).toBeLessThanOrEqual(4.01);
    expect(positions.getY(i)).toBeCloseTo(25.065);
  }
  infill.geometry.dispose();
});

it('shortens sidewalk slabs so they stop before junctions', () => {
  const material = new THREE.MeshStandardMaterial();
  const concrete = new THREE.MeshStandardMaterial();
  const roads = [
    { id: 'w', start: { x: 0, y: 50 }, end: { x: 50, y: 50 } },
    { id: 'e', start: { x: 50, y: 50 }, end: { x: 100, y: 50 } },
    { id: 's', start: { x: 50, y: 0 }, end: { x: 50, y: 50 } },
    { id: 'n', start: { x: 50, y: 50 }, end: { x: 50, y: 100 } },
  ];
  const layer = createRoadLayer(roads, 25, material, 8, concrete);
  const lengths: number[] = [];
  layer.getObjectByName('road-sidewalks')!.traverse((object) => {
    if (!(object instanceof THREE.InstancedMesh)) return;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, matrix);
      lengths.push(new THREE.Vector3().setFromMatrixScale(matrix).x);
    }
  });
  // 50 m segments lose half the 12 m corridor width at the junction end.
  expect(lengths.length).toBe(4);
  expect(lengths.every((length) => length <= 44.01)).toBe(true);
});

it('never paints a crosswalk inside a building footprint', () => {
  const material = new THREE.MeshStandardMaterial();
  const concrete = new THREE.MeshStandardMaterial();
  const roads = [
    { id: 'w', start: { x: 0, y: 50 }, end: { x: 50, y: 50 } },
    { id: 'e', start: { x: 50, y: 50 }, end: { x: 100, y: 50 } },
    { id: 's', start: { x: 50, y: 0 }, end: { x: 50, y: 50 } },
    { id: 'n', start: { x: 50, y: 50 }, end: { x: 50, y: 100 } },
  ];
  // Building covering the east arm's crosswalk centre (57.4, 50).
  const footprints = [
    { minCorner: { x: 54, y: 46 }, maxCorner: { x: 62, y: 54 } },
  ];
  const layer = createRoadLayer(roads, 25, material, 8, concrete, footprints);
  let stripes = 0;
  layer.getObjectByName('road-crosswalks')!.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) stripes += object.count;
  });
  expect(stripes).toBe(12); // 3 clear arms x 4 bars; east arm skipped
});
