import * as THREE from 'three';
import type { Road } from './city-types';

/** Visual road width only; the simulation still consumes centerlines. */
export function createRoadMesh(
  road: Road,
  groundElevationInMeters: number,
  material: THREE.MeshStandardMaterial,
) {
  const dx = road.end.x - road.start.x;
  const dz = road.end.y - road.start.y;
  const length = Math.hypot(dx, dz);
  const thickness = 0.05;
  const geometry = new THREE.BoxGeometry(length, thickness, 6);
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(
    (road.start.x + road.end.x) / 2,
    groundElevationInMeters + thickness / 2 + 0.01,
    (road.start.y + road.end.y) / 2,
  );
  mesh.rotation.y = -Math.atan2(dz, dx);
  return mesh;
}
