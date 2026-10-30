import * as THREE from 'three';

export type InstancePlacement = {
  position: THREE.Vector3;
  scale: THREE.Vector3;
  yaw?: number;
};

export const CHUNK_SIZE_IN_METERS = 120;

/**
 * Splits static instances into a grid of InstancedMesh chunks with tight
 * bounds. Three.js frustum-culls whole InstancedMesh objects only, so one
 * city-wide mesh always renders; chunked meshes outside the camera frustum
 * (behind it, off-screen or beyond the far plane when zoomed) are skipped.
 */
export function createChunkedInstances({
  name,
  geometry,
  material,
  placements,
  chunkSizeInMeters = CHUNK_SIZE_IN_METERS,
  castShadow = false,
  receiveShadow = false,
  uvScales,
  ids,
}: {
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  placements: InstancePlacement[];
  chunkSizeInMeters?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Optional per-instance vec3 consumed by the facade UV shader. */
  uvScales?: number[] | undefined;
  ids?: string[] | undefined;
}): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  const cells = new Map<
    string,
    { placements: InstancePlacement[]; indexes: number[] }
  >();
  placements.forEach((placement, index) => {
    const key = `${Math.floor(placement.position.x / chunkSizeInMeters)},${Math.floor(placement.position.z / chunkSizeInMeters)}`;
    const cell = cells.get(key) ?? { placements: [], indexes: [] };
    cell.placements.push(placement);
    cell.indexes.push(index);
    cells.set(key, cell);
  });
  const dummy = new THREE.Object3D();
  for (const [key, cell] of cells) {
    const chunkGeometry = uvScales ? geometry.clone() : geometry;
    if (uvScales) {
      const scales = new Float32Array(cell.indexes.length * 3);
      cell.indexes.forEach((source, i) =>
        scales.set(uvScales.slice(source * 3, source * 3 + 3), i * 3),
      );
      chunkGeometry.setAttribute(
        'instanceUvScale',
        new THREE.InstancedBufferAttribute(scales, 3),
      );
    }
    const mesh = new THREE.InstancedMesh(
      chunkGeometry,
      material,
      cell.placements.length,
    );
    mesh.name = `${name}@${key}`;
    if (ids) mesh.userData.buildingIds = cell.indexes.map((i) => ids[i]);
    cell.placements.forEach((placement, index) => {
      dummy.position.copy(placement.position);
      dummy.scale.copy(placement.scale);
      dummy.rotation.set(0, placement.yaw ?? 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.frustumCulled = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}

/** Total instances across every chunk of a group built by createChunkedInstances. */
export function countChunkInstances(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) total += object.count;
  });
  return total;
}
