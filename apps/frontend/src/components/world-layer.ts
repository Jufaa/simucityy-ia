import * as THREE from 'three';
import type { CityResponse } from './city-types';
import { createTerrainGeometry } from './terrain-view';
import { createWaterNormals } from './water-normal-map';
import type { WorldModel } from './world-model';

export type WorldLayerName = 'sea' | 'lake';
export type WorldCameraView = 'world' | 'city';

export function worldCameraPose(world: WorldModel, view: WorldCameraView) {
  const extent =
    view === 'world'
      ? Math.max(
          world.bounds.maxX - world.bounds.minX,
          world.bounds.maxZ - world.bounds.minZ,
        )
      : Math.max(world.cityBounds.width, world.cityBounds.height);
  const x =
    view === 'world'
      ? (world.bounds.minX + world.bounds.maxX) / 2
      : world.cityBounds.width / 2;
  const z =
    view === 'world'
      ? (world.bounds.minZ + world.bounds.maxZ) / 2
      : world.cityBounds.height / 2;
  const ground = world.seaLevel + 3;
  return {
    target: [x, ground, z] as const,
    position: [
      x + extent * (view === 'world' ? 0.7 : 0.8),
      ground + extent * (view === 'world' ? 0.8 : 0.9),
      z + extent * (view === 'world' ? 0.7 : 0.8),
    ] as const,
  };
}

function clip(
  polygon: THREE.Vector3[],
  distance: (p: THREE.Vector3) => number,
) {
  const result: THREE.Vector3[] = [];
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!,
      da = distance(a),
      db = distance(b);
    if (da <= 0) result.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0))
      result.push(a.clone().lerp(b, da / (da - db)));
  });
  return result;
}

function waterGeometry(world: WorldModel, kind: 'sea' | 'lake') {
  const positions: number[] = [],
    uv: number[] = [];
  const {
    xCoordinates: xs,
    yCoordinates: zs,
    elevationsInMeters: ys,
  } = world.terrainGrid;
  const level = kind === 'sea' ? world.seaLevel : world.lake.level;
  for (let r = 0; r < zs.length - 1; r++)
    for (let c = 0; c < xs.length - 1; c++) {
      if (kind === 'sea' && xs[c + 1]! > 0) continue;
      const lake = world.lake;
      if (
        kind === 'lake' &&
        (xs[c]! > lake.center.x + lake.radiusX ||
          xs[c + 1]! < lake.center.x - lake.radiusX ||
          zs[r]! > lake.center.y + lake.radiusZ ||
          zs[r + 1]! < lake.center.y - lake.radiusZ)
      )
        continue;
      const a = new THREE.Vector3(xs[c]!, ys[r]![c]!, zs[r]!);
      const b = new THREE.Vector3(xs[c + 1]!, ys[r]![c + 1]!, zs[r]!);
      const d = new THREE.Vector3(xs[c]!, ys[r + 1]![c]!, zs[r + 1]!);
      const e = new THREE.Vector3(xs[c + 1]!, ys[r + 1]![c + 1]!, zs[r + 1]!);
      for (const triangle of [
        [a, d, b],
        [b, d, e],
      ]) {
        let polygon = clip(triangle, (p) => p.y - level);
        if (kind === 'lake')
          for (let i = 0; i < 48 && polygon.length; i++) {
            const angle = ((i + 0.5) / 48) * Math.PI * 2;
            polygon = clip(
              polygon,
              (p) =>
                ((p.x - lake.center.x) / lake.radiusX) * Math.cos(angle) +
                ((p.z - lake.center.y) / lake.radiusZ) * Math.sin(angle) -
                Math.cos(Math.PI / 48),
            );
          }
        for (let i = 1; i < polygon.length - 1; i++)
          for (const p of [polygon[0]!, polygon[i]!, polygon[i + 1]!]) {
            positions.push(p.x, level, p.z);
            uv.push(p.x / 40, p.z / 40);
          }
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** Permanent world water layers never consume or modify FloodSnapshot. */
export function createWorldLayer(world: WorldModel) {
  const group = new THREE.Group();
  group.name = 'procedural-world';
  const layers = Object.fromEntries(
    (['sea', 'lake'] as const).map((name) => {
      const layer = new THREE.Group();
      layer.name = `world-${name}`;
      group.add(layer);
      return [name, layer];
    }),
  ) as Record<WorldLayerName, THREE.Group>;
  const width = world.bounds.maxX - world.bounds.minX,
    height = world.bounds.maxZ - world.bounds.minZ;
  const terrainView = {
    terrain: { kind: 'flat' as const, elevationInMeters: world.seaLevel },
    terrainGrid: world.terrainGrid,
  };
  const geometry = createTerrainGeometry({
    ...terrainView,
    config: {
      widthInMeters: width,
      heightInMeters: height,
      streetSpacingInMeters: 25,
    },
    roads: [],
    blocks: [],
    buildings: [],
  } satisfies CityResponse);
  const indices: number[] = [],
    xs = world.terrainGrid.xCoordinates,
    zs = world.terrainGrid.yCoordinates;
  for (let r = 0; r < zs.length - 1; r++)
    for (let c = 0; c < xs.length - 1; c++) {
      if (
        xs[c]! >= 0 &&
        xs[c + 1]! <= world.cityBounds.width &&
        zs[r]! >= 0 &&
        zs[r + 1]! <= world.cityBounds.height
      )
        continue;
      const a = r * xs.length + c,
        d = a + xs.length;
      indices.push(a, d, a + 1, a + 1, d, d + 1);
    }
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const colors: number[] = [],
    points = geometry.getAttribute('position');
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i),
      z = points.getZ(i),
      y = points.getY(i);
    const nearLake =
      ((x - world.lake.center.x) / world.lake.radiusX) ** 2 +
        ((z - world.lake.center.y) / world.lake.radiusZ) ** 2 <
      1.6;
    const color = new THREE.Color(
      y < world.seaLevel + 1.3 || (nearLake && y < world.lake.level + 0.7)
        ? 0xd8c493
        : 0x78965a,
    );
    color.multiplyScalar(0.96 + 0.06 * Math.sin(x / 75) * Math.cos(z / 95));
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const terrain = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  );
  terrain.name = 'world-terrain';
  terrain.receiveShadow = true;
  group.add(terrain);
  const normals = createWaterNormals();
  normals.repeat.set(2, 2);
  for (const kind of ['sea', 'lake'] as const) {
    const material = new THREE.MeshStandardMaterial({
      color: kind === 'sea' ? 0x287fb0 : 0x3d9b94,
      roughness: 0.24,
      metalness: 0.08,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      normalMap: normals,
      normalScale: new THREE.Vector2(0.15, 0.15),
    });
    const mesh = new THREE.Mesh(waterGeometry(world, kind), material);
    mesh.name = `permanent-${kind}`;
    layers[kind].add(mesh);
  }
  // Only the terrain square, the sea (ocean) and the lake/river render;
  // fields and expansion reserves are no longer drawn around the city.
  return {
    group,
    layers,
    animate(delta: number) {
      if (Number.isFinite(delta) && delta > 0) {
        normals.offset.x = (normals.offset.x + delta * 0.02) % 1;
        normals.offset.y = (normals.offset.y + delta * 0.01) % 1;
      }
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>();
      group.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.LineSegments
        ) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            materials.add(material);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      normals.dispose();
    },
  };
}
