import * as THREE from 'three';
import type { CityResponse } from './city-types';
import type { CityLifeModel } from './city-life-model';
import { sampleTerrainHeight } from './terrain-view';

type Part = { matrix: THREE.Matrix4; color: number };

/** Owned instancing resources are deliberately separate from the scene's shared surfaces. */
export function createCityLifeLayer(city: CityResponse, model: CityLifeModel) {
  const group = new THREE.Group();
  group.name = 'city-life';
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const round = new THREE.SphereGeometry(1, 8, 6);
  const batches = new Map<
    string,
    { geometry: THREE.BufferGeometry; parts: Part[] }
  >();
  const resources = new Set<{ dispose(): void }>([cube, round]);
  const transform = new THREE.Object3D();
  for (const item of model.items) {
    const c = Math.cos(item.rotation),
      s = Math.sin(item.rotation);
    const ground = sampleTerrainHeight(city, item.x, item.z) + 0.08;
    const part = (
      name: string,
      color: number,
      dx: number,
      y: number,
      dz: number,
      sx: number,
      sy: number,
      sz: number,
      rounded = false,
    ) => {
      transform.position.set(
        item.x + dx * c + dz * s,
        ground + y,
        item.z - dx * s + dz * c,
      );
      transform.rotation.set(0, item.rotation, 0);
      transform.scale.set(sx, sy, sz);
      transform.updateMatrix();
      let batch = batches.get(name);
      if (!batch) {
        batch = { geometry: rounded ? round : cube, parts: [] };
        batches.set(name, batch);
      }
      batch.parts.push({ matrix: transform.matrix.clone(), color });
    };
    if (['car', 'taxi', 'van', 'bus'].includes(item.kind)) {
      const tall = item.kind === 'bus' ? 2.8 : item.kind === 'van' ? 2.1 : 1.3;
      part('body', item.color, 0, 0.65, 0, item.length, 0.75, item.width);
      part(
        'cabins',
        item.color,
        -0.15,
        0.85 + tall / 2,
        0,
        item.length * 0.68,
        tall - 0.6,
        item.width * 0.92,
      );
      for (const side of [-1, 1]) {
        const windowCount =
          item.kind === 'bus' ? 5 : item.kind === 'van' ? 1 : 2;
        for (let n = 0; n < windowCount; n++)
          part(
            'windows',
            0x233f4b,
            (n - (windowCount - 1) / 2) * ((item.length * 0.6) / windowCount),
            tall * 0.7 + 0.5,
            side * item.width * 0.467,
            (item.length * 0.48) / windowCount,
            tall * 0.32,
            0.025,
          );
        for (const end of [-1, 1])
          part(
            'wheels',
            0x202529,
            end * item.length * 0.31,
            0.32,
            side * item.width * 0.46,
            0.32,
            0.32,
            0.13,
            true,
          );
      }
      for (const side of [-1, 1]) {
        part(
          'windows',
          0x233f4b,
          side * item.length * 0.345 - 0.15,
          tall * 0.7 + 0.5,
          0,
          0.03,
          tall * 0.32,
          item.width * 0.79,
        );
        for (const z of [-0.55, 0.55])
          part(
            'vehicle-lights',
            side > 0 ? 0xf9edb9 : 0xc44332,
            side * (item.length / 2 + 0.005),
            0.67,
            z,
            0.03,
            0.18,
            0.3,
          );
      }
      if (item.kind === 'taxi')
        part('taxi-signs', 0xffd940, 0, tall + 0.68, 0, 0.65, 0.22, 0.3);
      continue;
    }
    if (item.kind === 'tree') {
      part('tree-trunks', 0x786047, 0, 1.6, 0, 0.2, 3.2, 0.2);
      part('tree-crowns', 0x4d7754, 0, 4.2, 0, 1.15, 1.45, 1.15, true);
    } else if (item.kind === 'bus-stop') {
      part('poles', 0x747d7c, 0, 1.65, 0, 0.08, 3.3, 0.08);
      part('bus-stop-signs', 0x2476b6, 0, 2.85, 0, 0.5, 0.75, 0.11);
      part('bus-stop-icons', 0xf0eee1, 0, 2.87, 0.065, 0.34, 0.23, 0.025);
      for (const dx of [-0.1, 0.1])
        part('bus-stop-icons', 0xf0eee1, dx, 2.69, 0.065, 0.07, 0.07, 0.025);
    } else if (item.kind === 'traffic-light') {
      part('poles', 0x626d68, 0, 1.7, 0, 0.1, 3.4, 0.1);
      part('signal-housings', 0x29312d, 0, 3.1, 0, 0.37, 1.05, 0.3);
      for (const [n, color] of [0xe4533c, 0xd3a73e, 0x498963].entries())
        part(
          'signal-lenses',
          color,
          0,
          3.43 - n * 0.32,
          0.16,
          0.11,
          0.11,
          0.04,
          true,
        );
    } else if (item.kind === 'hydrant') {
      part('hydrants', 0xbf4936, 0, 0.4, 0, 0.23, 0.8, 0.23);
      part('hydrants', 0xbf4936, 0, 0.57, 0, 0.5, 0.16, 0.18);
      part('hydrant-caps', 0xe7be66, 0, 0.85, 0, 0.17, 0.12, 0.17, true);
    } else if (item.kind === 'bollard') {
      part('bollards', 0x465453, 0, 0.45, 0, 0.14, 0.9, 0.14);
      part('bollard-reflectors', 0xecdbaa, 0, 0.76, 0, 0.16, 0.1, 0.16);
    } else {
      const bin = item.kind === 'bin';
      part(
        bin ? 'bins' : 'utility-cabinets',
        bin ? 0x486854 : 0x909891,
        0,
        bin ? 0.43 : 0.65,
        0,
        0.5,
        bin ? 0.86 : 1.3,
        0.52,
      );
      part(
        'furniture-trim',
        0x303d39,
        0,
        bin ? 0.89 : 0.7,
        bin ? 0 : 0.27,
        bin ? 0.55 : 0.03,
        bin ? 0.1 : 0.35,
        bin ? 0.56 : 0.03,
      );
    }
  }
  for (const [name, { geometry, parts }] of batches) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
    });
    resources.add(material);
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    mesh.name = `city-life-${name}`;
    parts.forEach((p, index) => {
      mesh.setMatrixAt(index, p.matrix);
      mesh.setColorAt(index, new THREE.Color(p.color));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    resources.add(mesh);
    group.add(mesh);
  }
  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      resources.forEach((resource) => resource.dispose());
      group.clear();
    },
  };
}
