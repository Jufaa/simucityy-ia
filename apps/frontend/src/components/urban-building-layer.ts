import * as THREE from 'three';
import type { CityResponse } from './city-types';
import { createUrbanTextures } from './urban-materials';

type BoxPlacement = { position: THREE.Vector3; scale: THREE.Vector3 };

export function createBuildingLayer(city: CityResponse): THREE.Group {
  const group = new THREE.Group();
  const textures = createUrbanTextures();
  const facades = Object.fromEntries(
    (['sand', 'brick', 'stone'] as const).map((name) => [
      name,
      new THREE.MeshStandardMaterial({
        color: textures.facades[name]
          ? 0xffffff
          : name === 'sand'
            ? 0xdbc9a5
            : name === 'brick'
              ? 0xbd876c
              : 0xbdc8cc,
        roughness: 0.88,
        ...(textures.facades[name] ? { map: textures.facades[name] } : {}),
      }),
    ]),
  );
  const roof = new THREE.MeshStandardMaterial({
    color: 0x8c4c39,
    roughness: 0.95,
  });
  const flatRoof = new THREE.MeshStandardMaterial({
    color: 0x737974,
    roughness: 1,
  });
  const door = new THREE.MeshStandardMaterial({
    color: 0x62442e,
    roughness: 0.8,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: textures.storefront ? 0xffffff : 0x315869,
    roughness: 0.35,
    ...(textures.storefront ? { map: textures.storefront } : {}),
  });
  const signMaterials = textures.signs.map(
    (texture) =>
      new THREE.MeshStandardMaterial({
        color: texture ? 0xffffff : 0x253e47,
        roughness: 0.7,
        ...(texture ? { map: texture } : {}),
      }),
  );
  const slabs: BoxPlacement[] = [],
    rails: BoxPlacement[] = [];
  for (const building of city.buildings) {
    const a = building.architecture;
    const w = building.maxCorner.x - building.minCorner.x,
      d = building.maxCorner.y - building.minCorner.y;
    const root = new THREE.Group();
    root.name = building.id;
    root.position.set(
      (building.minCorner.x + building.maxCorner.x) / 2,
      city.terrain.elevationInMeters,
      (building.minCorner.y + building.maxCorner.y) / 2,
    );
    const rise = a?.roofRiseInMeters ?? 0,
      h = building.heightInMeters - rise;
    const balcony = a?.balconyDepthInMeters ?? 0;
    const geometry = new THREE.BoxGeometry(w, h, d - balcony);
    const uv = geometry.attributes.uv!;
    if (a)
      for (let i = 0; i < uv.count; i++) {
        const face = Math.floor(i / 4);
        if (face === 2 || face === 3) continue;
        uv.setXY(
          i,
          uv.getX(i) * ((face < 2 ? d - balcony : w) / 3),
          uv.getY(i) * a.floors,
        );
      }
    const facade = facades[a?.facade ?? 'sand']!;
    const body = new THREE.Mesh(geometry, [
      facade,
      facade,
      flatRoof,
      flatRoof,
      facade,
      facade,
    ]);
    body.position.set(0, h / 2, -balcony / 2);
    body.castShadow = body.receiveShadow = true;
    body.name = `${building.id}:body`;
    root.add(body);
    if (a?.roof === 'gable') {
      const v = [
        [-w / 2, 0, d / 2],
        [w / 2, 0, d / 2],
        [0, rise, d / 2],
        [-w / 2, 0, -d / 2],
        [w / 2, 0, -d / 2],
        [0, rise, -d / 2],
      ];
      const vertices = [
        0, 1, 2, 4, 3, 5, 3, 0, 2, 3, 2, 5, 1, 4, 5, 1, 5, 2, 3, 4, 1, 3, 1, 0,
      ].flatMap((i) => v[i]!);
      const roofGeometry = new THREE.BufferGeometry();
      roofGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(vertices, 3),
      );
      roofGeometry.computeVertexNormals();
      const mesh = new THREE.Mesh(roofGeometry, roof);
      mesh.position.y = h;
      mesh.name = `${building.id}:roof`;
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
    }
    if (a) {
      const sideWidth =
        a.entranceSide === 'east' || a.entranceSide === 'west' ? d : w;
      const front = (
        material: THREE.MeshStandardMaterial,
        width: number,
        height: number,
        y: number,
        name: string,
      ) => {
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(width, height),
          material,
        );
        mesh.name = `${building.id}:${name}`;
        if (a.entranceSide === 'north')
          mesh.position.set(0, y, d / 2 - balcony + 0.01);
        if (a.entranceSide === 'south') {
          mesh.position.set(0, y, -d / 2 - 0.01);
          mesh.rotation.y = Math.PI;
        }
        if (a.entranceSide === 'east') {
          mesh.position.set(w / 2 + 0.01, y, -balcony / 2);
          mesh.rotation.y = Math.PI / 2;
        }
        if (a.entranceSide === 'west') {
          mesh.position.set(-w / 2 - 0.01, y, -balcony / 2);
          mesh.rotation.y = -Math.PI / 2;
        }
        root.add(mesh);
      };
      const doorHeight = Math.min(2.2, h * 0.7);
      front(
        door,
        Math.min(1.2, sideWidth * 0.3),
        doorHeight,
        doorHeight / 2,
        'door',
      );
      if (a.style === 'shop') {
        const height = Math.min(3, h * 0.6);
        front(glass, sideWidth * 0.8, height, height / 2 + 0.05, 'storefront');
        const label =
          Math.abs(
            [...building.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0),
          ) % signMaterials.length;
        front(
          signMaterials[label]!,
          sideWidth * 0.8,
          Math.min(0.7, h * 0.12),
          Math.min(h - 0.4, height + 0.65),
          'sign',
        );
      }
      if (a.style === 'apartment' && balcony > 0)
        for (let floor = 1; floor < a.floors; floor++) {
          const y = city.terrain.elevationInMeters + (floor * h) / a.floors;
          const x = root.position.x,
            z = building.maxCorner.y - balcony / 2;
          slabs.push({
            position: new THREE.Vector3(x, y, z),
            scale: new THREE.Vector3(w * 0.8, 0.12, balcony),
          });
          rails.push({
            position: new THREE.Vector3(
              x,
              y + 0.8,
              building.maxCorner.y - 0.05,
            ),
            scale: new THREE.Vector3(w * 0.8, 0.07, 0.07),
          });
          for (const direction of [-1, 1])
            rails.push({
              position: new THREE.Vector3(
                x + direction * w * 0.39,
                y + 0.4,
                building.maxCorner.y - 0.05,
              ),
              scale: new THREE.Vector3(0.07, 0.8, 0.07),
            });
        }
    }
    group.add(root);
  }
  const instances = (
    name: string,
    placements: BoxPlacement[],
    material: THREE.MeshStandardMaterial,
  ) => {
    if (!placements.length) return;
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      material,
      placements.length,
    );
    mesh.name = name;
    const transform = new THREE.Object3D();
    placements.forEach((item, index) => {
      transform.position.copy(item.position);
      transform.scale.copy(item.scale);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  };
  instances('balcony-slabs', slabs, flatRoof);
  instances(
    'balcony-rails',
    rails,
    new THREE.MeshStandardMaterial({ color: 0x515d62, roughness: 0.6 }),
  );
  return group;
}
