import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createRoadLayer, createRoadMesh } from './create-road-mesh';
import { countChunkInstances } from './instanced-chunks';

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
      height: 0.05,
      depth: 6,
    });
    expect(mesh.position.y - 0.025).toBeCloseTo(25.01);
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
