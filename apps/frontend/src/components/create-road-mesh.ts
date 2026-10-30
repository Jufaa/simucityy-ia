import * as THREE from 'three';
import type { Road } from './city-types';
import { createChunkedInstances } from './instanced-chunks';

/** Visual road width only; the simulation still consumes centerlines. */
export function createRoadMesh(
  road: Road,
  groundElevationInMeters: number,
  material: THREE.MeshStandardMaterial,
  widthInMeters = 6,
) {
  const dx = road.end.x - road.start.x;
  const dz = road.end.y - road.start.y;
  const length = Math.hypot(dx, dz);
  const thickness = 0.05;
  const geometry = new THREE.BoxGeometry(length, thickness, widthInMeters);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;

  mesh.position.set(
    (road.start.x + road.end.x) / 2,
    groundElevationInMeters + thickness / 2 + 0.01,
    (road.start.y + road.end.y) / 2,
  );
  mesh.rotation.y = -Math.atan2(dz, dx);
  return mesh;
}

/**
 * Roads are instanced in spatial chunks (one draw call per visible chunk).
 * On relief terrain drapeSurfaceLayer merges each chunk into a draped mesh.
 */
export function createRoadLayer(
  roads: Road[],
  groundElevationInMeters: number,
  material: THREE.MeshStandardMaterial,
  widthInMeters = 6,
): THREE.Group {
  const thickness = 0.05;
  // Chunked by midpoint so off-screen road stretches are frustum-culled.
  const group = createChunkedInstances({
    name: 'roads',
    geometry: new THREE.BoxGeometry(1, 1, 1),
    material,
    placements: roads.map((road) => {
      const dx = road.end.x - road.start.x;
      const dz = road.end.y - road.start.y;
      return {
        position: new THREE.Vector3(
          (road.start.x + road.end.x) / 2,
          groundElevationInMeters + thickness / 2 + 0.01,
          (road.start.y + road.end.y) / 2,
        ),
        scale: new THREE.Vector3(Math.hypot(dx, dz), thickness, widthInMeters),
        yaw: -Math.atan2(dz, dx),
      };
    }),
    receiveShadow: true,
  });
  group.userData.roadIds = roads.map((road) => road.id);
  return group;
}
