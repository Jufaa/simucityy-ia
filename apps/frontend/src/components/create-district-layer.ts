import * as THREE from 'three';
import type { Block, CityResponse } from './city-types';

export function createDistrictLayer(city: CityResponse): THREE.Group {
  const group = new THREE.Group();
  const area = (
    item: Block,
    material: THREE.MeshStandardMaterial,
    thickness: number,
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        item.maxCorner.x - item.minCorner.x,
        thickness,
        item.maxCorner.y - item.minCorner.y,
      ),
      material,
    );
    mesh.name = item.id;
    mesh.position.set(
      (item.minCorner.x + item.maxCorner.x) / 2,
      city.terrain.elevationInMeters + thickness / 2 + 0.01,
      (item.minCorner.y + item.maxCorner.y) / 2,
    );
    group.add(mesh);
  };
  if (city.district) {
    const parkMaterial = new THREE.MeshStandardMaterial({
      color: 0x638d51,
      roughness: 1,
    });
    const sidewalkMaterial = new THREE.MeshStandardMaterial({
      color: 0xc1c5c7,
      roughness: 1,
    });
    for (const park of city.district.parks) area(park, parkMaterial, 0.03);
    for (const sidewalk of city.district.sidewalks)
      area(sidewalk, sidewalkMaterial, 0.12);
  }
  const nodes = new Map(city.roadGraph?.nodes.map((node) => [node.id, node]));
  const shelters = (city.shelters ?? []).filter(
    (shelter) => shelter.active && nodes.has(shelter.nodeId),
  );
  if (shelters.length) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xffbd42,
      roughness: 0.7,
    });
    const geometry = new THREE.CylinderGeometry(2, 2, 8, 6);
    for (const shelter of shelters) {
      const node = nodes.get(shelter.nodeId)!;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = shelter.id;
      mesh.position.set(node.x, city.terrain.elevationInMeters + 4, node.y);
      group.add(mesh);
    }
  }
  return group;
}
