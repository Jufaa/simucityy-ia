import * as THREE from 'three';
import type { CityResponse, Block } from './city-types';

type Placement = {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rotation?: number;
};

export function createUrbanDetailLayer(
  city: CityResponse,
  concrete?: THREE.Texture,
): THREE.Group {
  const group = new THREE.Group();
  const urban = city.district?.urban;
  if (!urban) return group;
  const ground = city.terrain.elevationInMeters;
  const material = (color: number, roughness = 1) =>
    new THREE.MeshStandardMaterial({ color, roughness });
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const draw = (
    name: string,
    geometry: THREE.BufferGeometry,
    surface: THREE.MeshStandardMaterial,
    placements: Placement[],
    shadow = false,
  ) => {
    if (!placements.length) return;
    const mesh = new THREE.InstancedMesh(geometry, surface, placements.length);
    mesh.name = name;
    const transform = new THREE.Object3D();
    placements.forEach((p, index) => {
      transform.position.set(p.x, p.y, p.z);
      transform.scale.set(p.sx, p.sy, p.sz);
      transform.rotation.set(0, p.rotation ?? 0, 0);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  const boxes = (
    areas: Block[],
    thickness: number,
    offset: number,
  ): Placement[] =>
    areas.map((area) => ({
      x: (area.minCorner.x + area.maxCorner.x) / 2,
      z: (area.minCorner.y + area.maxCorner.y) / 2,
      y: ground + offset + thickness / 2,
      sx: area.maxCorner.x - area.minCorner.x,
      sy: thickness,
      sz: area.maxCorner.y - area.minCorner.y,
    }));
  const concreteMaterial = new THREE.MeshStandardMaterial({
    color: 0xd4c7ae,
    roughness: 1,
    ...(concrete ? { map: concrete } : {}),
  });
  draw(
    'park-paths',
    cube,
    concreteMaterial,
    boxes(urban.parkPaths, 0.06, 0.03),
  );
  draw('house-yards', cube, material(0x78975a), boxes(urban.yards, 0.05, 0.02));
  for (const kind of [
    'curb',
    'crosswalk',
    'lane-marking',
    'building-access',
  ] as const) {
    const surface =
      kind === 'curb'
        ? material(0xccc9bd)
        : kind === 'lane-marking'
          ? material(0xe8cc7b)
          : kind === 'building-access'
            ? concreteMaterial
            : material(0xf0eee4);
    draw(
      `street-${kind}`,
      cube,
      surface,
      boxes(
        urban.streetDetails.filter((item) => item.kind === kind),
        kind === 'curb' ? 0.18 : 0.015,
        kind === 'curb' ? 0.03 : 0.085,
      ),
      kind === 'curb',
    );
  }
  const trunks: Placement[] = [],
    crowns: Placement[] = [],
    seats: Placement[] = [],
    supports: Placement[] = [],
    poles: Placement[] = [],
    lamps: Placement[] = [],
    basins: Placement[] = [],
    water: Placement[] = [];
  for (const item of urban.amenities) {
    const x = item.position.x,
      z = item.position.y,
      rotation = -item.rotation;
    const p = (
      dx: number,
      dy: number,
      dz: number,
      sx: number,
      sy: number,
      sz: number,
    ): Placement => ({
      x: x + dx * Math.cos(rotation) + dz * Math.sin(rotation),
      y: ground + dy,
      z: z - dx * Math.sin(rotation) + dz * Math.cos(rotation),
      sx,
      sy,
      sz,
      rotation,
    });
    if (item.kind === 'tree') {
      trunks.push(p(0, 1.2, 0, 0.18, 2.4, 0.18));
      crowns.push(
        p(
          0,
          2.6 + item.radiusInMeters * 0.5,
          0,
          item.radiusInMeters,
          item.radiusInMeters * 1.3,
          item.radiusInMeters,
        ),
      );
    }
    if (item.kind === 'bench') {
      for (const dz of [-0.16, 0, 0.16])
        seats.push(p(0, 0.55, dz, 1.6, 0.09, 0.13));
      seats.push(p(0, 0.95, -0.23, 1.6, 0.45, 0.08));
      for (const dx of [-0.6, 0.6])
        supports.push(p(dx, 0.25, 0, 0.08, 0.5, 0.4));
    }
    if (item.kind === 'lamp') {
      poles.push(p(0, 2, 0, 0.06, 4, 0.06));
      lamps.push(p(0, 4.05, 0, 0.45, 0.2, 0.45));
    }
    if (item.kind === 'fountain') {
      basins.push(p(0, 0.2, 0, item.radiusInMeters, 0.4, item.radiusInMeters));
      water.push(
        p(
          0,
          0.42,
          0,
          item.radiusInMeters * 0.8,
          0.025,
          item.radiusInMeters * 0.8,
        ),
      );
    }
  }
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  draw('tree-trunks', cylinder, material(0x74553c), trunks, true);
  draw(
    'tree-crowns',
    new THREE.IcosahedronGeometry(1, 1),
    material(0x46734e),
    crowns,
    true,
  );
  draw('bench-wood', cube, material(0x956440), seats, true);
  draw('bench-supports', cube, material(0x41494a, 0.65), supports, true);
  draw('lamp-poles', cylinder, material(0x485052, 0.6), poles, true);
  draw(
    'lamp-heads',
    cube,
    new THREE.MeshStandardMaterial({
      color: 0xf2dfb0,
      emissive: 0xffdf9b,
      emissiveIntensity: 0.4,
      roughness: 0.5,
    }),
    lamps,
  );
  draw('fountain-basins', cylinder, material(0xb7b9b2), basins, true);
  draw('decorative-water', cylinder, material(0x75aebd, 0.25), water);
  return group;
}
