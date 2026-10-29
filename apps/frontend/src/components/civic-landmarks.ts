import * as THREE from 'three';
import type { Building, CityResponse } from './city-types';
import { buildingBaseHeight, sampleTerrainHeight } from './terrain-view';

export type CivicRole =
  'hospital' | 'school' | 'police' | 'firestation' | 'municipal' | 'market';
export interface CivicAssignment {
  buildingId: string;
  role: CivicRole;
}
export interface CivicLandmarkModel {
  assignments: CivicAssignment[];
}

const roles: CivicRole[] = [
  'hospital',
  'school',
  'police',
  'firestation',
  'municipal',
  'market',
];
const colors: Record<CivicRole, number> = {
  hospital: 0xe8414c,
  school: 0xf4bd42,
  police: 0x347ac4,
  firestation: 0xec6135,
  municipal: 0x49a99b,
  market: 0x6bab49,
};
const labels: Record<CivicRole, string> = {
  hospital: 'CLINIC',
  school: 'SCHOOL',
  police: 'POLICE',
  firestation: 'FIRE',
  municipal: 'CITY HALL',
  market: 'MARKET',
};

function suitable(city: CityResponse, building: Building) {
  const a = building.architecture;
  return (
    a?.roof !== 'gable' &&
    (building.presentation?.widthInMeters ??
      building.maxCorner.x - building.minCorner.x) >= 7 &&
    (building.presentation?.depthInMeters ??
      building.maxCorner.y - building.minCorner.y) -
      (a?.balconyDepthInMeters ?? 0) >=
      7 &&
    building.heightInMeters - (a?.roofRiseInMeters ?? 0) > 2 &&
    building.minCorner.x >= 0 &&
    building.minCorner.y >= 0 &&
    building.maxCorner.x <= city.config.widthInMeters &&
    building.maxCorner.y <= city.config.heightInMeters
  );
}

/** Local visual identities, not simulation services or a persisted building kind. */
export function generateCivicLandmarks(city: CityResponse): CivicLandmarkModel {
  const candidates = city.buildings.filter((building) =>
    suitable(city, building),
  );
  const selected = new Set<string>();
  const assignments: CivicAssignment[] = [];
  roles.forEach((role, index) => {
    const angle = (index / roles.length) * Math.PI * 2;
    const targetX = city.config.widthInMeters * (0.5 + Math.cos(angle) * 0.3);
    const targetZ = city.config.heightInMeters * (0.5 + Math.sin(angle) * 0.3);
    const score = (building: Building) => {
      const x = (building.minCorner.x + building.maxCorner.x) / 2;
      const z = (building.minCorner.y + building.maxCorner.y) / 2;
      const preference =
        building.use === 'commercial' || building.architecture?.style === 'shop'
          ? 0
          : 0.3;
      return (
        Math.hypot(
          (x - targetX) / city.config.widthInMeters,
          (z - targetZ) / city.config.heightInMeters,
        ) + preference
      );
    };
    const building = candidates
      .filter((item) => !selected.has(item.id))
      .sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id))[0];
    if (building) {
      selected.add(building.id);
      assignments.push({ buildingId: building.id, role });
    }
  });
  return { assignments };
}

export function createCivicLandmarkLayer(
  city: CityResponse,
  model: CivicLandmarkModel,
) {
  const group = new THREE.Group();
  group.name = 'civic-landmarks';
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  const cone = new THREE.ConeGeometry(0.5, 1, 6);
  const materials = new Map<number, THREE.MeshStandardMaterial>();
  const textures = new Set<THREE.Texture>();
  const textMaterials = new Map<CivicRole, THREE.MeshStandardMaterial>();
  const material = (color: number) => {
    if (!materials.has(color))
      materials.set(
        color,
        new THREE.MeshStandardMaterial({ color, roughness: 0.75 }),
      );
    return materials.get(color)!;
  };
  const add = (
    root: THREE.Group,
    name: string,
    geometry: THREE.BufferGeometry,
    color: number,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) => {
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const labelMaterial = (role: CivicRole) => {
    if (textMaterials.has(role)) return textMaterials.get(role);
    if (typeof document === 'undefined') return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.fillStyle = '#183447';
    context.fillRect(0, 0, 512, 96);
    context.fillStyle = '#ffffff';
    context.font = 'bold 56px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(labels[role], 256, 48, 480);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture);
    const result = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.8,
    });
    textMaterials.set(role, result);
    return result;
  };
  const assignments = new Map(
    model.assignments.map((item) => [item.buildingId, item.role]),
  );
  // Flat rooftops alone: nothing floats over or intersects an existing gable.
  const candidates = city.buildings
    .filter((building) => suitable(city, building))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const [index, building] of candidates.entries()) {
    const root = new THREE.Group();
    root.name = `rooftop:${building.id}`;
    root.userData.buildingId = building.id;
    const balcony = building.architecture?.balconyDepthInMeters ?? 0;
    const roofY =
      buildingBaseHeight(city, building) +
      building.heightInMeters -
      (building.architecture?.roofRiseInMeters ?? 0);
    const x = (building.minCorner.x + building.maxCorner.x) / 2;
    const z = (building.minCorner.y + building.maxCorner.y) / 2;
    const yaw = building.presentation?.yawInRadians ?? 0;
    root.rotation.y = yaw;
    root.position.set(
      x - (Math.sin(yaw) * balcony) / 2,
      roofY,
      z - (Math.cos(yaw) * balcony) / 2,
    );
    // Terrain helper also records a useful local clearance for inspectors without changing city data.
    root.userData.heightAboveTerrain = roofY - sampleTerrainHeight(city, x, z);
    const role = assignments.get(building.id);
    if (role) {
      const color = colors[role];
      // Separate roof signage never paints over existing storefront names or doors.
      add(
        root,
        `${role}:sign-support`,
        box,
        0x4a5960,
        0,
        0.7,
        1.2,
        0.14,
        1.4,
        0.14,
      );
      add(root, `${role}:sign`, box, 0xf4f0df, 0, 1.8, 1.2, 3.4, 1.9, 0.25);
      const icon = (
        name: string,
        x: number,
        y: number,
        w: number,
        h: number,
        colorOverride = color,
      ) =>
        add(
          root,
          `${role}:${name}`,
          box,
          colorOverride,
          x,
          y,
          1.36,
          w,
          h,
          0.08,
        );
      if (role === 'hospital') {
        icon('cross-horizontal', 0, 1.95, 1.5, 0.4);
        icon('cross-vertical', 0, 1.95, 0.4, 1.4);
      } else if (role === 'school') {
        const left = icon('book-left', -0.45, 1.95, 0.8, 1.05);
        const right = icon('book-right', 0.45, 1.95, 0.8, 1.05);
        left.rotation.z = 0.12;
        right.rotation.z = -0.12;
        icon('book-spine', 0, 1.9, 0.09, 1.2, 0x183447);
      } else if (role === 'police') {
        const badge = add(
          root,
          'police:badge',
          cylinder,
          color,
          0,
          2,
          1.4,
          1.3,
          0.09,
          1.3,
        );
        badge.rotation.x = Math.PI / 2;
        icon('badge-center', 0, 2, 0.4, 0.4, 0xf5d85a);
      } else if (role === 'firestation') {
        add(
          root,
          'firestation:flame',
          cone,
          color,
          0,
          1.95,
          1.4,
          1.3,
          1.4,
          0.2,
        );
        add(
          root,
          'firestation:flame-core',
          cone,
          0xffd56b,
          0,
          1.7,
          1.52,
          0.55,
          0.8,
          0.1,
        );
      } else if (role === 'municipal') {
        icon('pediment', 0, 2.48, 1.9, 0.16);
        icon('steps', 0, 1.4, 1.9, 0.16);
        for (const offset of [-0.65, 0, 0.65])
          icon('column', offset, 1.95, 0.2, 0.9);
        add(
          root,
          'municipal:flagpole',
          box,
          0xb2bec3,
          2.3,
          1.6,
          0,
          0.08,
          3.2,
          0.08,
        );
        add(
          root,
          'municipal:flag',
          box,
          0x50afda,
          2.65,
          2.75,
          0,
          0.65,
          0.55,
          0.06,
        );
      } else {
        for (let stripe = 0; stripe < 8; stripe++) {
          add(
            root,
            'market:awning',
            box,
            stripe % 2 ? 0xf4f0df : color,
            (stripe - 3.5) * 0.45,
            0.9,
            -1.1,
            0.45,
            0.18,
            1.8,
          );
        }
        for (const offset of [-1.6, 1.6])
          add(
            root,
            'market:stall-post',
            box,
            0x76604b,
            offset,
            0.4,
            -1.1,
            0.1,
            0.8,
            0.1,
          );
        icon('basket', 0, 1.95, 1.55, 0.7);
        icon('basket-handle', 0, 2.4, 0.9, 0.15);
      }
      const text = labelMaterial(role);
      if (text) {
        const mesh = new THREE.Mesh(box, text);
        mesh.name = `${role}:label`;
        mesh.scale.set(3.1, 0.5, 0.03);
        mesh.position.set(0, 1.08, 1.35);
        root.add(mesh);
      }
    }
    // Utilities are small enough for the minimum seven-metre clear roof area.
    const rearZ = -2.1;
    if (index % 3 === 0) {
      add(
        root,
        'roof:solar-frame',
        box,
        0xa9b5bc,
        0,
        0.16,
        rearZ,
        2.8,
        0.32,
        1.3,
      );
      add(
        root,
        'roof:solar-panel',
        box,
        0x24496b,
        0,
        0.35,
        rearZ,
        2.65,
        0.06,
        1.2,
      );
      for (const offset of [-0.85, 0, 0.85])
        add(
          root,
          'roof:solar-grid',
          box,
          0x9dbbcc,
          offset,
          0.39,
          rearZ,
          0.025,
          0.02,
          1.2,
        );
    } else if (index % 3 === 1) {
      add(
        root,
        'roof:water-tank',
        cylinder,
        0x496e8b,
        0,
        0.8,
        rearZ,
        1.4,
        1.6,
        1.4,
      );
      add(
        root,
        'roof:tank-lid',
        cylinder,
        0x344856,
        0,
        1.65,
        rearZ,
        1.5,
        0.1,
        1.5,
      );
    } else {
      add(root, 'roof:ac', box, 0xc6c9c4, 0, 0.4, rearZ, 1.8, 0.8, 1.1);
      for (const offset of [-0.5, 0.5])
        add(
          root,
          'roof:ac-fan',
          cylinder,
          0x59676a,
          offset,
          0.83,
          rearZ,
          0.6,
          0.06,
          0.6,
        );
    }
    group.add(root);
  }
  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      box.dispose();
      cylinder.dispose();
      cone.dispose();
      for (const item of materials.values()) item.dispose();
      for (const item of textMaterials.values()) item.dispose();
      for (const texture of textures) texture.dispose();
      group.clear();
    },
  };
}
