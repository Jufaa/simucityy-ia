import * as THREE from 'three';
import type { Block, CityResponse } from './city-types';

/** Parks, sidewalks and shelters are instanced: one draw call per kind. */
export function createDistrictLayer(city: CityResponse): THREE.Group {
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const areas = (
    name: string,
    items: Block[],
    material: THREE.MeshStandardMaterial,
    thickness: number,
  ) => {
    if (!items.length) return;
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      material,
      items.length,
    );
    mesh.name = name;
    mesh.userData.ids = items.map((item) => item.id);
    mesh.receiveShadow = true;
    items.forEach((item, index) => {
      dummy.position.set(
        (item.minCorner.x + item.maxCorner.x) / 2,
        city.terrain.elevationInMeters + thickness / 2 + 0.01,
        (item.minCorner.y + item.maxCorner.y) / 2,
      );
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(
        item.maxCorner.x - item.minCorner.x,
        thickness,
        item.maxCorner.y - item.minCorner.y,
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  };
  if (city.district) {
    areas(
      'district-parks',
      city.district.parks,
      new THREE.MeshStandardMaterial({ color: 0x638d51, roughness: 1 }),
      0.03,
    );
    areas(
      'district-sidewalks',
      city.district.sidewalks,
      new THREE.MeshStandardMaterial({ color: 0xc1c5c7, roughness: 1 }),
      0.12,
    );
  }
  const nodes = new Map(city.roadGraph?.nodes.map((node) => [node.id, node]));
  const shelters = (city.shelters ?? []).filter(
    (shelter) => shelter.active && nodes.has(shelter.nodeId),
  );
  if (shelters.length) {
    const mesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(2, 2, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xffbd42, roughness: 0.7 }),
      shelters.length,
    );
    mesh.name = 'district-shelters';
    mesh.userData.ids = shelters.map((shelter) => shelter.id);
    shelters.forEach((shelter, index) => {
      const node = nodes.get(shelter.nodeId)!;
      dummy.position.set(node.x, city.terrain.elevationInMeters + 4, node.y);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
