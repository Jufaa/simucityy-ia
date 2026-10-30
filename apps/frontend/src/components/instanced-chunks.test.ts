import { expect, it } from 'vitest';
import * as THREE from 'three';
import {
  countChunkInstances,
  createChunkedInstances,
  type InstancePlacement,
} from './instanced-chunks';

const placement = (x: number, z: number): InstancePlacement => ({
  position: new THREE.Vector3(x, 0, z),
  scale: new THREE.Vector3(2, 2, 2),
});

it('partitions instances into spatial chunks with tight bounds', () => {
  const group = createChunkedInstances({
    name: 'things',
    geometry: new THREE.BoxGeometry(1, 1, 1),
    material: new THREE.MeshBasicMaterial(),
    placements: [placement(5, 5), placement(10, 5), placement(500, 400)],
    chunkSizeInMeters: 60,
  });
  expect(group.children).toHaveLength(2);
  expect(countChunkInstances(group)).toBe(3);
  const radii = group.children.map(
    (child) => (child as THREE.InstancedMesh).boundingSphere!.radius,
  );
  // No chunk spans the whole 500 m spread.
  expect(Math.max(...radii)).toBeLessThan(60);
});

it('frustum-culls chunks outside the camera view', () => {
  const group = createChunkedInstances({
    name: 'things',
    geometry: new THREE.BoxGeometry(1, 1, 1),
    material: new THREE.MeshBasicMaterial(),
    placements: [placement(0, 0), placement(500, 0)],
    chunkSizeInMeters: 60,
  });
  group.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 10, 40);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    ),
  );
  const visible = group.children.map((child) =>
    frustum.intersectsObject(child),
  );
  expect(visible).toEqual([true, false]);
});

it('keeps per-instance uv scales and ids aligned after chunking', () => {
  const group = createChunkedInstances({
    name: 'facades',
    geometry: new THREE.BoxGeometry(1, 1, 1),
    material: new THREE.MeshBasicMaterial(),
    placements: [placement(5, 5), placement(500, 5)],
    uvScales: [1, 2, 3, 4, 5, 6],
    ids: ['a', 'b'],
  });
  const byId = new Map<string, number[]>();
  group.traverse((object) => {
    if (!(object instanceof THREE.InstancedMesh)) return;
    const attribute = object.geometry.getAttribute('instanceUvScale');
    (object.userData.buildingIds as string[]).forEach((id, i) =>
      byId.set(id, [attribute.getX(i), attribute.getY(i), attribute.getZ(i)]),
    );
  });
  expect(byId.get('a')).toEqual([1, 2, 3]);
  expect(byId.get('b')).toEqual([4, 5, 6]);
});
