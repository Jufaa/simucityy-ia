import * as THREE from 'three';
import type { CityResponse } from './city-types';
import type { TrafficVehicle } from './city-traffic-model';
import { sampleRoadSurfaceHeight } from './road-surface';

/** Owns fixed-capacity GPU buffers; road surfaces remain simulation-independent. */
export function createCityTrafficLayer(city: CityResponse, capacity = 40) {
  const group = new THREE.Group();
  group.name = 'city-traffic';
  const count = Number.isFinite(capacity)
    ? Math.max(0, Math.min(40, Math.floor(capacity)))
    : 40;
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const round = new THREE.SphereGeometry(1, 8, 6);
  const resources = new Set<{ dispose(): void }>([cube, round]);
  const batch = (
    name: string,
    color: number,
    parts = 1,
    geometry: THREE.BufferGeometry = cube,
  ) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const mesh = new THREE.InstancedMesh(geometry, material, count * parts);
    mesh.name = `traffic-${name}`;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    // Dynamic matrices move across the city; don't retain a stale initial bound.
    mesh.frustumCulled = false;
    group.add(mesh);
    resources.add(material);
    resources.add(mesh);
    return mesh;
  };
  const body = batch('body', 0xffffff);
  const cabin = batch('cabin', 0x304856);
  const wheels = batch('wheels', 0x22282c, 4, round);
  const headlights = batch('headlights', 0xffe5a5, 2);
  const taillights = batch('taillights', 0xc74737, 2);
  const palette = [0x527789, 0xad5046, 0xcac9bc, 0xd3ac45, 0x537d68].map(
    (color) => new THREE.Color(color),
  );
  for (let i = 0; i < count; i++)
    body.setColorAt(
      i,
      palette[i % palette.length] ?? new THREE.Color(0x527789),
    );
  const transform = new THREE.Object3D();
  let disposed = false;
  return {
    group,
    update(vehicles: readonly TrafficVehicle[]) {
      if (disposed) return;
      const visible = Math.min(count, vehicles.length);
      body.count = cabin.count = visible;
      wheels.count = visible * 4;
      headlights.count = taillights.count = visible * 2;
      for (let i = 0; i < visible; i++) {
        const vehicle = vehicles[i];
        if (!vehicle) continue;
        const c = Math.cos(vehicle.headingRadians),
          s = Math.sin(vehicle.headingRadians);
        const ground =
          sampleRoadSurfaceHeight(city, vehicle.x, vehicle.z) + 0.12;
        const part = (
          mesh: THREE.InstancedMesh,
          index: number,
          x: number,
          y: number,
          z: number,
          sx: number,
          sy: number,
          sz: number,
        ) => {
          transform.position.set(
            vehicle.x + x * c + z * s,
            ground + y,
            vehicle.z - x * s + z * c,
          );
          transform.rotation.set(0, vehicle.headingRadians, 0);
          transform.scale.set(sx, sy, sz);
          transform.updateMatrix();
          mesh.setMatrixAt(index, transform.matrix);
        };
        part(body, i, 0, 0.65, 0, 4.2, 0.7, 1.6);
        part(cabin, i, -0.15, 1.15, 0, 2.5, 0.65, 1.4);
        for (let side = 0; side < 2; side++) {
          part(
            headlights,
            i * 2 + side,
            2.12,
            0.68,
            (side ? 1 : -1) * 0.5,
            0.04,
            0.22,
            0.3,
          );
          part(
            taillights,
            i * 2 + side,
            -2.12,
            0.68,
            (side ? 1 : -1) * 0.5,
            0.04,
            0.22,
            0.3,
          );
          for (let end = 0; end < 2; end++)
            part(
              wheels,
              i * 4 + side * 2 + end,
              (end ? 1 : -1) * 1.3,
              0.3,
              (side ? 1 : -1) * 0.8,
              0.32,
              0.32,
              0.16,
            );
        }
      }
      for (const mesh of [body, cabin, wheels, headlights, taillights])
        mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      resources.forEach((resource) => resource.dispose());
      group.clear();
    },
  };
}
