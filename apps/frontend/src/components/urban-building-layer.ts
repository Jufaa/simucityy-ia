import * as THREE from 'three';
import type { CityResponse } from './city-types';
import { createUrbanTextures } from './urban-materials';
import { buildingBaseHeight, sampleTerrainHeight } from './terrain-view';
import { createChunkedInstances } from './instanced-chunks';

type BoxPlacement = {
  position: THREE.Vector3;
  scale: THREE.Vector3;
  yaw?: number;
};

type FacadeName = 'sand' | 'brick' | 'stone';

/**
 * Extracts the given BoxGeometry faces (0:+x, 1:-x, 2:+y, 3:-y, 4:+z, 5:-z)
 * into a standalone geometry so sides and caps can be instanced separately
 * with different materials in one draw call each.
 */
function boxFaces(faceIndexes: number[]): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const sourcePosition = box.getAttribute('position');
  const sourceNormal = box.getAttribute('normal');
  const sourceUv = box.getAttribute('uv');
  const sourceIndex = box.getIndex()!;
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  for (const face of faceIndexes) {
    const vertexOffset = positions.length / 3;
    for (let vertex = face * 4; vertex < face * 4 + 4; vertex++) {
      positions.push(
        sourcePosition.getX(vertex),
        sourcePosition.getY(vertex),
        sourcePosition.getZ(vertex),
      );
      normals.push(
        sourceNormal.getX(vertex),
        sourceNormal.getY(vertex),
        sourceNormal.getZ(vertex),
      );
      uvs.push(sourceUv.getX(vertex), sourceUv.getY(vertex));
    }
    for (let i = face * 6; i < face * 6 + 6; i++)
      indices.push(sourceIndex.getX(i) - face * 4 + vertexOffset);
  }
  box.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/** Unit gable prism (base 1x1, apex height 1); instances scale it per building. */
function gableGeometry(): THREE.BufferGeometry {
  const v = [
    [-0.5, 0, 0.5],
    [0.5, 0, 0.5],
    [0, 1, 0.5],
    [-0.5, 0, -0.5],
    [0.5, 0, -0.5],
    [0, 1, -0.5],
  ];
  const vertices = [
    0, 1, 2, 4, 3, 5, 3, 0, 2, 3, 2, 5, 1, 4, 5, 1, 5, 2, 3, 4, 1, 3, 1, 0,
  ].flatMap((i) => v[i]!);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Repeats the facade texture per instance without a texture atlas: the unit
 * box UV stays 0..1 and the vertex shader scales it by the per-instance
 * footprint/floors, matching the previous per-building UV rewrite.
 */
function scaleInstanceUvs(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec3 instanceUvScale;',
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
#ifdef USE_MAP
        vMapUv *= vec2(
          abs(normal.x) > 0.5 ? instanceUvScale.x : instanceUvScale.y,
          instanceUvScale.z
        );
#endif`,
      );
  };
}

type PlanePlacement = {
  position: THREE.Vector3;
  scale: THREE.Vector3;
  yaw: number;
};

/**
 * Static buildings are rendered as InstancedMesh buckets (3 facades, caps,
 * roofs, doors, storefronts, signs, foundations) split into 120 m spatial
 * chunks, instead of several meshes per building: off-screen chunks are
 * frustum-culled and draw calls scale with visible chunks, not buildings.
 * A named, empty marker group per building preserves its id and base height.
 */
export function createBuildingLayer(city: CityResponse): THREE.Group {
  const group = new THREE.Group();
  const textures = createUrbanTextures();
  const facades = Object.fromEntries(
    (['sand', 'brick', 'stone'] as const).map((name) => {
      const material = new THREE.MeshStandardMaterial({
        color: textures.facades[name]
          ? 0xffffff
          : name === 'sand'
            ? 0xdbc9a5
            : name === 'brick'
              ? 0xbd876c
              : 0xbdc8cc,
        roughness: 0.88,
        ...(textures.facades[name] ? { map: textures.facades[name] } : {}),
      });
      scaleInstanceUvs(material);
      return [name, material];
    }),
  ) as Record<FacadeName, THREE.MeshStandardMaterial>;
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
  const bodies: Record<
    FacadeName,
    { placements: BoxPlacement[]; ids: string[]; uvScales: number[] }
  > = {
    sand: { placements: [], ids: [], uvScales: [] },
    brick: { placements: [], ids: [], uvScales: [] },
    stone: { placements: [], ids: [], uvScales: [] },
  };
  const caps: BoxPlacement[] = [],
    roofs: BoxPlacement[] = [],
    foundations: BoxPlacement[] = [],
    foundationIds: string[] = [],
    doors: PlanePlacement[] = [],
    storefronts: PlanePlacement[] = [],
    signs: PlanePlacement[][] = signMaterials.map(() => []);
  const slabs: BoxPlacement[] = [],
    rails: BoxPlacement[] = [];
  for (const building of city.buildings) {
    const a = building.architecture;
    const w =
        building.presentation?.widthInMeters ??
        building.maxCorner.x - building.minCorner.x,
      d =
        building.presentation?.depthInMeters ??
        building.maxCorner.y - building.minCorner.y;
    const yaw = building.presentation?.yawInRadians ?? 0;
    const baseHeight = buildingBaseHeight(city, building);
    // Marker only: preserves building.id lookup and base height without a mesh.
    const root = new THREE.Group();
    root.name = building.id;
    root.position.set(
      (building.minCorner.x + building.maxCorner.x) / 2,
      baseHeight,
      (building.minCorner.y + building.maxCorner.y) / 2,
    );
    root.rotation.y = yaw;
    group.add(root);
    const worldAt = (x: number, y: number, z: number) =>
      new THREE.Vector3(x, y, z)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
        .add(root.position);
    const rise = a?.roofRiseInMeters ?? 0,
      h = building.heightInMeters - rise;
    const balcony = a?.balconyDepthInMeters ?? 0;
    const body: BoxPlacement = {
      position: worldAt(0, h / 2, -balcony / 2),
      scale: new THREE.Vector3(w, h, d - balcony),
      yaw,
    };
    const bucket = bodies[a?.facade ?? 'sand'];
    bucket.placements.push(body);
    bucket.ids.push(building.id);
    bucket.uvScales.push(
      ...(a ? [(d - balcony) / 3, w / 3, a.floors] : [1, 1, 1]),
    );
    caps.push(body);
    if (a?.roof === 'gable')
      roofs.push({
        position: worldAt(0, h, 0),
        scale: new THREE.Vector3(w, rise, d),
        yaw,
      });
    if (a) {
      const sideWidth =
        a.entranceSide === 'east' || a.entranceSide === 'west' ? d : w;
      const front = (
        placements: PlanePlacement[],
        width: number,
        height: number,
        y: number,
      ) => {
        const local =
          a.entranceSide === 'north'
            ? { x: 0, z: d / 2 - balcony + 0.01, yaw: 0 }
            : a.entranceSide === 'south'
              ? { x: 0, z: -d / 2 - 0.01, yaw: Math.PI }
              : a.entranceSide === 'east'
                ? { x: w / 2 + 0.01, z: -balcony / 2, yaw: Math.PI / 2 }
                : { x: -w / 2 - 0.01, z: -balcony / 2, yaw: -Math.PI / 2 };
        placements.push({
          position: worldAt(local.x, y, local.z),
          scale: new THREE.Vector3(width, height, 1),
          yaw: yaw + local.yaw,
        });
      };
      const doorHeight = Math.min(2.2, h * 0.7);
      front(doors, Math.min(1.2, sideWidth * 0.3), doorHeight, doorHeight / 2);
      if (a.style === 'shop') {
        const height = Math.min(3, h * 0.6);
        front(storefronts, sideWidth * 0.8, height, height / 2 + 0.05);
        const label =
          Math.abs(
            [...building.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0),
          ) % signMaterials.length;
        front(
          signs[label]!,
          sideWidth * 0.8,
          Math.min(0.7, h * 0.12),
          Math.min(h - 0.4, height + 0.65),
        );
      }
      if (a.style === 'apartment' && balcony > 0)
        for (let floor = 1; floor < a.floors; floor++) {
          const y = baseHeight + (floor * h) / a.floors;
          slabs.push({
            position: worldAt(0, y - baseHeight, d / 2 - balcony / 2),
            scale: new THREE.Vector3(w * 0.8, 0.12, balcony),
            yaw,
          });
          rails.push({
            position: worldAt(0, y - baseHeight + 0.8, d / 2 - 0.05),
            scale: new THREE.Vector3(w * 0.8, 0.07, 0.07),
            yaw,
          });
          for (const direction of [-1, 1])
            rails.push({
              position: worldAt(
                direction * w * 0.39,
                y - baseHeight + 0.4,
                d / 2 - 0.05,
              ),
              scale: new THREE.Vector3(0.07, 0.8, 0.07),
              yaw,
            });
        }
    }
    if (city.terrainProfile === 'basin' || city.organic) {
      const minimum = Math.min(
        ...[building.minCorner.x, building.maxCorner.x].flatMap((x) =>
          [building.minCorner.y, building.maxCorner.y].map((z) =>
            sampleTerrainHeight(city, x, z),
          ),
        ),
      );
      const depth = baseHeight - minimum + 0.05;
      foundationIds.push(building.id);
      foundations.push({
        position: new THREE.Vector3(
          root.position.x,
          baseHeight - depth / 2,
          root.position.z,
        ),
        scale: new THREE.Vector3(w, depth, d),
        yaw,
      });
    }
  }
  // Every bucket is chunked spatially so the frustum culls off-screen chunks.
  const boxes = (
    name: string,
    placements: BoxPlacement[],
    material: THREE.MeshStandardMaterial,
    shadow = true,
    ids?: string[],
  ) => {
    if (!placements.length) return;
    group.add(
      createChunkedInstances({
        name,
        geometry: new THREE.BoxGeometry(1, 1, 1),
        material,
        placements,
        castShadow: shadow,
        receiveShadow: shadow,
        ids,
      }),
    );
  };
  const sideGeometry = boxFaces([0, 1, 4, 5]);
  for (const name of ['sand', 'brick', 'stone'] as const) {
    const bucket = bodies[name];
    if (!bucket.placements.length) continue;
    group.add(
      createChunkedInstances({
        name: `building-facade-${name}`,
        geometry: sideGeometry,
        material: facades[name],
        placements: bucket.placements,
        castShadow: true,
        receiveShadow: true,
        uvScales: bucket.uvScales,
        ids: bucket.ids,
      }),
    );
  }
  if (caps.length)
    group.add(
      createChunkedInstances({
        name: 'building-caps',
        geometry: boxFaces([2, 3]),
        material: flatRoof,
        placements: caps,
        castShadow: true,
        receiveShadow: true,
      }),
    );
  if (roofs.length)
    group.add(
      createChunkedInstances({
        name: 'building-roofs',
        geometry: gableGeometry(),
        material: roof,
        placements: roofs,
        castShadow: true,
        receiveShadow: true,
      }),
    );
  const planes = (
    name: string,
    placements: PlanePlacement[],
    material: THREE.MeshStandardMaterial,
  ) => {
    if (!placements.length) return;
    group.add(
      createChunkedInstances({
        name,
        geometry: new THREE.PlaneGeometry(1, 1),
        material,
        placements,
      }),
    );
  };
  planes('building-doors', doors, door);
  planes('building-storefronts', storefronts, glass);
  signs.forEach((placements, index) =>
    planes(`building-sign-${index}`, placements, signMaterials[index]!),
  );
  boxes('building-foundations', foundations, flatRoof, true, foundationIds);
  boxes('balcony-slabs', slabs, flatRoof);
  boxes(
    'balcony-rails',
    rails,
    new THREE.MeshStandardMaterial({ color: 0x515d62, roughness: 0.6 }),
  );
  sideGeometry.dispose();
  return group;
}
