import * as THREE from 'three';
import type { Building, CityResponse, Point } from './city-types';
import { createUrbanTextures } from './urban-materials';
import { buildingTint, roofColorForBuilding } from './building-palette';
import { buildingBaseHeight, sampleTerrainHeight } from './terrain-view';
import { createChunkedInstances } from './instanced-chunks';
import { collapsePose } from './collapse-animation';

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

function polygonAreaOf(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/**
 * A footprint deserves its exact extruded shape (instead of the instanced
 * rectangle) when it has courtyard holes, is concave, or fills much less
 * than its oriented rectangle — churches, stations, L/U-shaped blocks.
 */
export function footprintIsComplex(building: Building): boolean {
  const footprint = building.footprint;
  if (!footprint || footprint.length < 3 || footprint.length > 800)
    return false;
  if (building.footprintHoles?.length) return true;
  const width =
    building.presentation?.widthInMeters ??
    building.maxCorner.x - building.minCorner.x;
  const depth =
    building.presentation?.depthInMeters ??
    building.maxCorner.y - building.minCorner.y;
  const area = Math.abs(polygonAreaOf(footprint));
  if (area <= 0 || width * depth > 1.45 * area) return true;
  let sign = 0;
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i]!;
    const b = footprint[(i + 1) % footprint.length]!;
    const c = footprint[(i + 2) % footprint.length]!;
    const e1 = { x: b.x - a.x, y: b.y - a.y };
    const e2 = { x: c.x - b.x, y: c.y - b.y };
    // Normalized cross (sine of the turn angle): nearly collinear wall
    // vertices from OSM must not read as concave corners.
    const sine =
      (e1.x * e2.y - e1.y * e2.x) /
      Math.max(1e-9, Math.hypot(e1.x, e1.y) * Math.hypot(e2.x, e2.y));
    if (Math.abs(sine) < 0.02) continue;
    const current = Math.sign(sine);
    if (sign !== 0 && current !== sign) return true;
    sign = current;
  }
  return false;
}

/** Cap on individually-meshed exact footprints (two draw calls each). */
export const MAX_EXACT_FOOTPRINTS = 200;

/**
 * Chooses which complex footprints get exact meshes: the largest by area,
 * so landmarks and perimeter blocks win over small annexes. Deterministic
 * (area, then id); the rest keep the instanced rectangle.
 */
export function selectExactFootprints(buildings: Building[]): Set<string> {
  const candidates = buildings
    .filter((building) => footprintIsComplex(building))
    .map((building) => ({
      id: building.id,
      area: Math.abs(polygonAreaOf(building.footprint!)),
    }))
    .sort((a, b) => b.area - a.area || (a.id < b.id ? -1 : 1));
  return new Set(
    candidates.slice(0, MAX_EXACT_FOOTPRINTS).map((candidate) => candidate.id),
  );
}

/** Splits a non-indexed extruded geometry into cap and wall parts by normal. */
function splitExtrudeByNormal(geometry: THREE.BufferGeometry): {
  caps: THREE.BufferGeometry;
  walls: THREE.BufferGeometry;
} {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const buckets = {
    caps: {
      position: [] as number[],
      normal: [] as number[],
      uv: [] as number[],
    },
    walls: {
      position: [] as number[],
      normal: [] as number[],
      uv: [] as number[],
    },
  };
  const position = source.getAttribute('position');
  const normal = source.getAttribute('normal');
  const uv = source.getAttribute('uv');
  for (const group of source.groups) {
    // Cap faces point along the extrusion axis (local ±Y after rotation).
    const bucket =
      Math.abs(normal.getY(group.start)) > 0.5 ? buckets.caps : buckets.walls;
    for (let i = group.start; i < group.start + group.count; i++) {
      bucket.position.push(
        position.getX(i),
        position.getY(i),
        position.getZ(i),
      );
      bucket.normal.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      bucket.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
  }
  if (source !== geometry) source.dispose();
  const build = (bucket: (typeof buckets)['caps']) => {
    const out = new THREE.BufferGeometry();
    out.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(bucket.position, 3),
    );
    out.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(bucket.normal, 3),
    );
    out.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uv, 2));
    return out;
  };
  return { caps: build(buckets.caps), walls: build(buckets.walls) };
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
  const roofMaterials = new Map<number, THREE.MeshStandardMaterial>();
  const roofMaterialFor = (buildingId: string) => {
    const color = roofColorForBuilding(buildingId);
    let material = roofMaterials.get(color);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
      roofMaterials.set(color, material);
    }
    return material;
  };
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
    {
      placements: BoxPlacement[];
      ids: string[];
      uvScales: number[];
      colors: [number, number, number][];
    }
  > = {
    sand: { placements: [], ids: [], uvScales: [], colors: [] },
    brick: { placements: [], ids: [], uvScales: [], colors: [] },
    stone: { placements: [], ids: [], uvScales: [], colors: [] },
  };
  const capsByRoof = new Map<
      number,
      { placements: BoxPlacement[]; ids: string[] }
    >(),
    roofsByRoof = new Map<
      number,
      { placements: BoxPlacement[]; ids: string[] }
    >(),
    foundations: BoxPlacement[] = [],
    foundationIds: string[] = [],
    doors: PlanePlacement[] = [],
    storefronts: PlanePlacement[] = [],
    signs: PlanePlacement[][] = signMaterials.map(() => []);
  const litWindows: PlanePlacement[] = [],
    litWindowIds: string[] = [],
    doorsIds: string[] = [],
    storefrontIds: string[] = [],
    signIds: string[][] = signMaterials.map(() => []);
  const slabs: BoxPlacement[] = [],
    slabIds: string[] = [],
    rails: BoxPlacement[] = [],
    railIds: string[] = [];
  const exactFootprints = selectExactFootprints(city.buildings);
  // Exact footprints share the instanced facades' canvas textures. The
  // extrude UV generator emits metre-scale coordinates, so wall UVs are
  // divided by the 3 m facade module below to match window density.
  const FACADE_MODULE_IN_METERS = 3;
  const footprintBaseColors = {
    sand: 0xdbc9a5,
    brick: 0xbd876c,
    stone: 0xbdc8cc,
  } as Record<FacadeName, number>;
  const createFootprintGroup = (
    building: Building,
    root: THREE.Group,
  ): THREE.Group => {
    const footprint = building.footprint!;
    const toShapePoint = (point: Point): [number, number] => [
      point.x - root.position.x,
      -(point.y - root.position.z),
    ];
    const shape = new THREE.Shape();
    footprint.forEach((point, index) => {
      const [x, y] = toShapePoint(point);
      if (index === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
    shape.closePath();
    for (const hole of building.footprintHoles ?? []) {
      if (hole.length < 3) continue;
      const path = new THREE.Path();
      hole.forEach((point, index) => {
        const [x, y] = toShapePoint(point);
        if (index === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      });
      path.closePath();
      shape.holes.push(path);
    }
    const extruded = new THREE.ExtrudeGeometry(shape, {
      depth: building.heightInMeters,
      bevelEnabled: false,
    });
    extruded.rotateX(-Math.PI / 2);
    const { caps, walls } = splitExtrudeByNormal(extruded);
    extruded.dispose();
    const wallUv = walls.getAttribute('uv');
    if (wallUv) {
      for (let i = 0; i < wallUv.count; i++)
        wallUv.setXY(
          i,
          wallUv.getX(i) / FACADE_MODULE_IN_METERS,
          wallUv.getY(i) / FACADE_MODULE_IN_METERS,
        );
      wallUv.needsUpdate = true;
    }
    const group = new THREE.Group();
    group.name = `footprint:${building.id}`;
    group.position.copy(root.position);
    const tint = buildingTint(building.id);
    const facadeName = building.architecture?.facade ?? 'sand';
    const facadeTexture = textures.facades[facadeName];
    const wallMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.88,
      ...(facadeTexture
        ? { map: facadeTexture }
        : { color: footprintBaseColors[facadeName] }),
    });
    // With a map, colour is the near-white tint; without one (headless
    // tests have no canvas), tint the plain base colour instead.
    if (facadeTexture) wallMaterial.color.setRGB(tint[0], tint[1], tint[2]);
    else {
      wallMaterial.color.r *= tint[0];
      wallMaterial.color.g *= tint[1];
      wallMaterial.color.b *= tint[2];
    }
    const wallsMesh = new THREE.Mesh(walls, wallMaterial);
    const capsMesh = new THREE.Mesh(caps, roofMaterialFor(building.id));
    wallsMesh.castShadow = wallsMesh.receiveShadow = true;
    capsMesh.castShadow = capsMesh.receiveShadow = true;
    group.add(wallsMesh, capsMesh);
    return group;
  };
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
    // The largest complex real footprints draw as exact extrusions;
    // everything else keeps the instanced rectangle buckets below.
    const complex = exactFootprints.has(building.id);
    if (complex) group.add(createFootprintGroup(building, root));
    const body: BoxPlacement = {
      position: worldAt(0, h / 2, -balcony / 2),
      scale: new THREE.Vector3(w, h, d - balcony),
      yaw,
    };
    const bucket = bodies[a?.facade ?? 'sand'];
    if (!complex) {
      bucket.placements.push(body);
      bucket.ids.push(building.id);
      bucket.colors.push(buildingTint(building.id));
      bucket.uvScales.push(
        ...(a ? [(d - balcony) / 3, w / 3, a.floors] : [1, 1, 1]),
      );
      const capBucket = capsByRoof.get(roofColorForBuilding(building.id)) ?? {
        placements: [],
        ids: [],
      };
      capBucket.placements.push(body);
      capBucket.ids.push(building.id);
      capsByRoof.set(roofColorForBuilding(building.id), capBucket);
    }
    if (!complex && a?.roof === 'gable') {
      const roofBucket = roofsByRoof.get(roofColorForBuilding(building.id)) ?? {
        placements: [],
        ids: [],
      };
      roofBucket.placements.push({
        position: worldAt(0, h, 0),
        scale: new THREE.Vector3(w, rise, d),
        yaw,
      });
      roofBucket.ids.push(building.id);
      roofsByRoof.set(roofColorForBuilding(building.id), roofBucket);
    }
    if (!complex && a) {
      const sideWidth =
        a.entranceSide === 'east' || a.entranceSide === 'west' ? d : w;
      const front = (
        placements: PlanePlacement[],
        placementIds: string[],
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
        placementIds.push(building.id);
      };
      const doorHeight = Math.min(2.2, h * 0.7);
      front(
        doors,
        doorsIds,
        Math.min(1.2, sideWidth * 0.3),
        doorHeight,
        doorHeight / 2,
      );
      // Presentation-only lit window on some taller buildings; the choice
      // is a pure function of the stable id via its tint channels.
      if (a.floors >= 3 && buildingTint(building.id)[0] > 0.95 && h > 4) {
        front(
          litWindows,
          litWindowIds,
          Math.min(1.1, sideWidth * 0.25),
          1.1,
          Math.min(h - 0.8, doorHeight + 1.8),
        );
      }
      if (a.style === 'shop') {
        const height = Math.min(3, h * 0.6);
        front(
          storefronts,
          storefrontIds,
          sideWidth * 0.8,
          height,
          height / 2 + 0.05,
        );
        const label =
          Math.abs(
            [...building.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0),
          ) % signMaterials.length;
        front(
          signs[label]!,
          signIds[label]!,
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
          slabIds.push(building.id);
          rails.push({
            position: worldAt(0, y - baseHeight + 0.8, d / 2 - 0.05),
            scale: new THREE.Vector3(w * 0.8, 0.07, 0.07),
            yaw,
          });
          railIds.push(building.id);
          for (const direction of [-1, 1]) {
            rails.push({
              position: worldAt(
                direction * w * 0.39,
                y - baseHeight + 0.4,
                d / 2 - 0.05,
              ),
              scale: new THREE.Vector3(0.07, 0.8, 0.07),
              yaw,
            });
            railIds.push(building.id);
          }
        }
    }
    if (city.terrainProfile === 'basin' || city.organic || city.real) {
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
        colors: bucket.colors,
      }),
    );
  }
  const capsGroup = new THREE.Group();
  capsGroup.name = 'building-caps';
  for (const [color, bucket] of capsByRoof)
    capsGroup.add(
      createChunkedInstances({
        name: `building-caps-${color.toString(16)}`,
        geometry: boxFaces([2, 3]),
        material: roofMaterialFor(bucket.ids[0]!),
        placements: bucket.placements,
        castShadow: true,
        receiveShadow: true,
        ids: bucket.ids,
      }),
    );
  if (capsGroup.children.length) group.add(capsGroup);
  const roofsGroup = new THREE.Group();
  roofsGroup.name = 'building-roofs';
  for (const [color, bucket] of roofsByRoof)
    roofsGroup.add(
      createChunkedInstances({
        name: `building-roofs-${color.toString(16)}`,
        geometry: gableGeometry(),
        material: roofMaterialFor(bucket.ids[0]!),
        placements: bucket.placements,
        castShadow: true,
        receiveShadow: true,
        ids: bucket.ids,
      }),
    );
  if (roofsGroup.children.length) group.add(roofsGroup);
  const planes = (
    name: string,
    placements: PlanePlacement[],
    material: THREE.MeshStandardMaterial,
    ids?: string[],
  ) => {
    if (!placements.length) return;
    group.add(
      createChunkedInstances({
        name,
        geometry: new THREE.PlaneGeometry(1, 1),
        material,
        placements,
        ids,
      }),
    );
  };
  planes('building-doors', doors, door, doorsIds);
  planes(
    'building-lit-windows',
    litWindows,
    new THREE.MeshStandardMaterial({
      color: 0x59431f,
      emissive: 0xffc978,
      emissiveIntensity: 1.1,
      roughness: 0.4,
    }),
    litWindowIds,
  );
  planes('building-storefronts', storefronts, glass, storefrontIds);
  signs.forEach((placements, index) =>
    planes(
      `building-sign-${index}`,
      placements,
      signMaterials[index]!,
      signIds[index],
    ),
  );
  boxes('building-foundations', foundations, flatRoof, true, foundationIds);
  boxes('balcony-slabs', slabs, flatRoof, true, slabIds);
  boxes(
    'balcony-rails',
    rails,
    new THREE.MeshStandardMaterial({ color: 0x515d62, roughness: 0.6 }),
    true,
    railIds,
  );
  sideGeometry.dispose();
  return group;
}

/**
 * Collapse driver for the procedural building layer. The visible geometry
 * lives in chunked InstancedMesh buckets (facades, caps, roofs, doors,
 * foundations...) and in per-building footprint groups; the named marker
 * groups alone move nothing. This records every instance transform at build
 * time and reapplies the shared collapse pose around each building's base,
 * restoring the exact original matrices at progress 0. Mirrors the Kenney
 * asset layer so both render paths collapse identically.
 */
export function attachBuildingCollapse(
  layer: THREE.Group,
  city: CityResponse,
): (buildingId: string, progress: number) => void {
  type Entry = {
    mesh: THREE.InstancedMesh;
    index: number;
    original: THREE.Matrix4;
    x: number;
    base: number;
    z: number;
    height: number;
    tilt: number;
  };
  const heightById = new Map(
    city.buildings.map((building) => [building.id, building.heightInMeters]),
  );
  const entriesByBuilding = new Map<string, Entry[]>();
  const footprintByBuilding = new Map<
    string,
    {
      object: THREE.Object3D;
      position: THREE.Vector3;
      quaternion: THREE.Quaternion;
      scale: THREE.Vector3;
      height: number;
      tilt: number;
    }
  >();
  layer.traverse((object) => {
    if (
      object instanceof THREE.InstancedMesh &&
      Array.isArray(object.userData.buildingIds)
    ) {
      (object.userData.buildingIds as string[]).forEach((id, index) => {
        const marker = layer.getObjectByName(id);
        if (!marker) return;
        const original = new THREE.Matrix4();
        object.getMatrixAt(index, original);
        const entries = entriesByBuilding.get(id) ?? [];
        entries.push({
          mesh: object,
          index,
          original,
          x: marker.position.x,
          base: marker.position.y,
          z: marker.position.z,
          height: heightById.get(id) ?? 8,
          tilt:
            ([...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 2 === 0
              ? 1
              : -1) * 0.16,
        });
        entriesByBuilding.set(id, entries);
      });
    }
    if (object.name.startsWith('footprint:')) {
      const id = object.name.slice('footprint:'.length);
      footprintByBuilding.set(id, {
        object,
        position: object.position.clone(),
        quaternion: object.quaternion.clone(),
        scale: object.scale.clone(),
        height: heightById.get(id) ?? 8,
        tilt:
          ([...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 2 === 0
            ? 1
            : -1) * 0.16,
      });
    }
  });
  return (buildingId: string, progress: number) => {
    const p = Math.max(0, Math.min(1, progress));
    const entries = entriesByBuilding.get(buildingId);
    if (entries) {
      for (const entry of entries) {
        if (p === 0) {
          entry.mesh.setMatrixAt(entry.index, entry.original);
        } else {
          const pose = collapsePose(p);
          const direction = Math.sign(entry.tilt);
          const pivotX = entry.x + direction * entry.height * 0.18;
          const pivotZ = entry.z + direction * entry.height * 0.1;
          const drift = direction * pose.driftFactor * entry.height * 0.07;
          const collapse = new THREE.Matrix4()
            .makeTranslation(drift, 0, drift * 0.6)
            .multiply(
              new THREE.Matrix4().makeTranslation(pivotX, entry.base, pivotZ),
            )
            .multiply(
              new THREE.Matrix4().makeRotationZ(entry.tilt * pose.tiltFactor),
            )
            .multiply(
              new THREE.Matrix4().makeRotationX(
                entry.tilt * 0.6 * pose.tiltFactor,
              ),
            )
            .multiply(new THREE.Matrix4().makeScale(1, pose.scaleY, 1))
            .multiply(
              new THREE.Matrix4().set(
                1,
                direction * pose.shearFactor,
                0,
                0,
                0,
                1,
                0,
                0,
                0,
                0,
                1,
                0,
                0,
                0,
                0,
                1,
              ),
            )
            .multiply(
              new THREE.Matrix4().makeTranslation(
                -pivotX,
                -entry.base,
                -pivotZ,
              ),
            );
          entry.mesh.setMatrixAt(
            entry.index,
            collapse.multiply(entry.original),
          );
        }
        entry.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    const footprint = footprintByBuilding.get(buildingId);
    if (footprint) {
      if (p === 0) {
        footprint.object.position.copy(footprint.position);
        footprint.object.quaternion.copy(footprint.quaternion);
        footprint.object.scale.copy(footprint.scale);
      } else {
        const pose = collapsePose(p);
        const direction = Math.sign(footprint.tilt);
        footprint.object.position.set(
          footprint.position.x +
            direction * pose.driftFactor * footprint.height * 0.07,
          footprint.position.y,
          footprint.position.z +
            direction * pose.driftFactor * footprint.height * 0.042,
        );
        footprint.object.rotation.set(
          footprint.tilt * 0.6 * pose.tiltFactor,
          0,
          footprint.tilt * pose.tiltFactor,
        );
        footprint.object.scale.set(1, pose.scaleY, 1);
      }
    }
  };
}
