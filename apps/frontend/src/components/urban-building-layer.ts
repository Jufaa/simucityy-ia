import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Building, CityResponse, Point } from './city-types';
import { createUrbanTextures } from './urban-materials';
import { buildingTint, roofColorForBuilding } from './building-palette';
import {
  buildingBaseHeight,
  buildingGroundRangeInMeters,
} from './terrain-view';
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
 * Chooses which footprints get exact meshes. Landmarks (churches,
 * hospitals, stadiums, civic icons) always do — they are the orientation
 * cues of a real district and render 1:1 with their OSM parts. Other
 * complex footprints fill the remaining budget by area, largest first.
 * Deterministic (area, then id); the rest keep the instanced rectangle.
 */
export function selectExactFootprints(buildings: Building[]): Set<string> {
  const selected = new Set(
    buildings
      .filter((building) => building.landmark && building.footprint)
      .map((building) => building.id),
  );
  const candidates = buildings
    .filter(
      (building) =>
        !selected.has(building.id) &&
        (footprintIsComplex(building) || (building.parts?.length ?? 0) > 0),
    )
    .map((building) => ({
      id: building.id,
      area: Math.abs(polygonAreaOf(building.footprint!)),
    }))
    .sort((a, b) => b.area - a.area || (a.id < b.id ? -1 : 1));
  for (const candidate of candidates.slice(0, MAX_EXACT_FOOTPRINTS))
    selected.add(candidate.id);
  return selected;
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
  // Plain-colour materials for exact footprints and landmark details.
  const footprintFacadeMaterials = {
    sand: new THREE.MeshStandardMaterial({ color: 0xdbc9a5, roughness: 0.88 }),
    brick: new THREE.MeshStandardMaterial({ color: 0xbd876c, roughness: 0.88 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xbdc8cc, roughness: 0.88 }),
  } as Record<FacadeName, THREE.MeshStandardMaterial>;
  const healthWhiteMaterial = new THREE.MeshStandardMaterial({
    color: 0xf5f7f7,
    roughness: 0.6,
  });
  const healthRedMaterial = new THREE.MeshStandardMaterial({
    color: 0xd43a2f,
    roughness: 0.6,
  });
  const floodlightPoleMaterial = new THREE.MeshStandardMaterial({
    color: 0x9aa4a8,
    roughness: 0.5,
    metalness: 0.4,
  });
  const floodlightHeadMaterial = new THREE.MeshStandardMaterial({
    color: 0x555c60,
    emissive: 0xfff0b8,
    emissiveIntensity: 1.4,
    roughness: 0.4,
  });
  // Weathered bronze/copper for monument figures (statues read greenish at
  // city scale) and plain metal for church cross finials.
  const monumentMaterial = new THREE.MeshStandardMaterial({
    color: 0x5e8f7f,
    roughness: 0.55,
    metalness: 0.25,
  });
  const torchFlameMaterial = new THREE.MeshStandardMaterial({
    color: 0xffb347,
    emissive: 0xff8c2e,
    emissiveIntensity: 2.2,
    roughness: 0.4,
  });
  const stadiumStandMaterial = new THREE.MeshStandardMaterial({
    color: 0x9aa0a3,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const stadiumPitchMaterial = new THREE.MeshStandardMaterial({
    color: 0x4d7d3c,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const finialMaterial = new THREE.MeshStandardMaterial({
    color: 0x8a8f7a,
    roughness: 0.45,
    metalness: 0.5,
  });
  /** Roof-top red-cross marker so hospitals read as hospitals at a glance. */
  const createHealthMarker = (topY: number): THREE.Group => {
    const marker = new THREE.Group();
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.35, 3.6),
      healthWhiteMaterial,
    );
    slab.position.y = topY + 0.18;
    const armA = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.4, 0.7),
      healthRedMaterial,
    );
    armA.position.y = topY + 0.42;
    const armB = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.4, 2.4),
      healthRedMaterial,
    );
    armB.position.y = topY + 0.42;
    marker.add(slab, armA, armB);
    return marker;
  };
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
  const spires: BoxPlacement[] = [],
    spireIds: string[] = [];
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
    // Monuments extrude only their plinth from the footprint: the figure
    // (statue body, obelisk shaft) is modelled above it, tapered, instead
    // of a solid block up to the total surveyed height.
    const floatingParts = (building.parts ?? []).filter(
      (part) => part.minHeightInMeters > 0,
    );
    const isMonument = building.landmark === 'monument';
    const baseDepthInMeters = isMonument
      ? floatingParts.length
        ? Math.min(
            building.heightInMeters,
            ...floatingParts.map((part) => part.minHeightInMeters),
          )
        : building.monumentShape === 'obelisk'
          ? // An obelisk is almost all shaft: only a low plinth below it.
            Math.max(1.2, building.heightInMeters * 0.12)
          : Math.max(2, building.heightInMeters * 0.35)
      : building.heightInMeters;
    const extruded = new THREE.ExtrudeGeometry(shape, {
      depth: baseDepthInMeters,
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
    wallsMesh.castShadow = wallsMesh.receiveShadow = true;
    group.add(wallsMesh);
    if (building.landmark === 'stadium') {
      // Open bowl, never a flat roof slab: sloped stands from the rim down
      // to a green pitch, so the stadium reads as a stadium from the air.
      caps.dispose();
      const localRing = footprint.map((point) => ({
        x: point.x - root.position.x,
        z: point.y - root.position.z,
      }));
      const bowlCx =
        localRing.reduce((sum, p) => sum + p.x, 0) / localRing.length;
      const bowlCz =
        localRing.reduce((sum, p) => sum + p.z, 0) / localRing.length;
      const rimY = building.heightInMeters;
      const innerY = rimY * 0.55;
      const pitchY = rimY * 0.52;
      const inner = localRing.map((point) => ({
        x: bowlCx + (point.x - bowlCx) * 0.7,
        z: bowlCz + (point.z - bowlCz) * 0.7,
      }));
      const pitch = localRing.map((point) => ({
        x: bowlCx + (point.x - bowlCx) * 0.68,
        z: bowlCz + (point.z - bowlCz) * 0.68,
      }));
      const standPositions: number[] = [];
      const pitchPositions: number[] = [];
      for (let i = 0; i < localRing.length; i++) {
        const a = localRing[i]!;
        const b = localRing[(i + 1) % localRing.length]!;
        const aIn = inner[i]!;
        const bIn = inner[(i + 1) % localRing.length]!;
        standPositions.push(
          a.x,
          rimY,
          a.z,
          b.x,
          rimY,
          b.z,
          bIn.x,
          innerY,
          bIn.z,
          a.x,
          rimY,
          a.z,
          bIn.x,
          innerY,
          bIn.z,
          aIn.x,
          innerY,
          aIn.z,
        );
        const aPitch = pitch[i]!;
        const bPitch = pitch[(i + 1) % localRing.length]!;
        pitchPositions.push(
          bowlCx,
          pitchY,
          bowlCz,
          aPitch.x,
          pitchY,
          aPitch.z,
          bPitch.x,
          pitchY,
          bPitch.z,
        );
      }
      const buildFlat = (positions: number[]) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(positions, 3),
        );
        geometry.setAttribute(
          'uv',
          new THREE.Float32BufferAttribute(
            new Array((positions.length / 3) * 2).fill(0),
            2,
          ),
        );
        geometry.computeVertexNormals();
        return geometry;
      };
      const bowl = new THREE.Mesh(
        buildFlat(standPositions),
        stadiumStandMaterial,
      );
      bowl.name = `stadium-bowl:${building.id}`;
      bowl.receiveShadow = true;
      const pitchMesh = new THREE.Mesh(
        buildFlat(pitchPositions),
        stadiumPitchMaterial,
      );
      pitchMesh.name = `stadium-pitch:${building.id}`;
      pitchMesh.receiveShadow = true;
      group.add(bowl, pitchMesh);
    } else {
      const capsMesh = new THREE.Mesh(caps, roofMaterialFor(building.id));
      capsMesh.castShadow = capsMesh.receiveShadow = true;
      group.add(capsMesh);
    }
    const footprintCentroid = footprint.reduce(
      (acc, point) => ({
        x: acc.x + point.x / footprint.length,
        y: acc.y + point.y / footprint.length,
      }),
      { x: 0, y: 0 },
    );
    // Real 3D parts at 1:1 (OSM building:part heights): towers and vaults
    // rise from their surveyed min-height to their surveyed height. All
    // part geometries merge into two meshes per building, however many
    // parts the source model has. Tall slender parts get a tapered
    // pinnacle so towers finish instead of ending in a flat cut.
    const partWallGeometries: THREE.BufferGeometry[] = [];
    const partCapGeometries: THREE.BufferGeometry[] = [];
    const monumentGeometries: THREE.BufferGeometry[] = [];
    const torchGeometries: THREE.BufferGeometry[] = [];
    let renderedStatueFigure = false;
    /**
     * Modelled robed-statue figure (never a bare cone): lathe-turned robe
     * with a dress profile, torso, head with crown spikes, raised torch
     * arm with flame, and a tablet in the other arm. Built around the
     * origin at its base; the caller translates it into place. Heights
     * are fractions of the figure height, radii of the robe radius.
     */
    const buildStatueFigure = (
      heightInMeters: number,
      radiusInMeters: number,
    ): { figure: THREE.BufferGeometry[]; torch: THREE.BufferGeometry[] } => {
      const H = heightInMeters;
      const R = radiusInMeters;
      const figure: THREE.BufferGeometry[] = [];
      const torch: THREE.BufferGeometry[] = [];
      const robeProfile: [number, number][] = [
        [0, 0],
        [0.94, 0],
        [1.0, 0.03],
        [0.88, 0.16],
        [0.7, 0.38],
        [0.55, 0.6],
        [0.47, 0.74],
      ];
      figure.push(
        new THREE.LatheGeometry(
          robeProfile.map(([rx, hy]) => new THREE.Vector2(rx * R, hy * H)),
          14,
        ).toNonIndexed(),
      );
      const torso = new THREE.CylinderGeometry(
        R * 0.4,
        R * 0.47,
        H * 0.14,
        10,
      ).toNonIndexed();
      torso.translate(0, H * 0.81, 0);
      figure.push(torso);
      const headRadius = Math.max(0.35, Math.min(1.9, H * 0.035, R * 0.24));
      const headY = H * 0.9;
      const head = new THREE.SphereGeometry(headRadius, 10, 8).toNonIndexed();
      head.translate(0, headY, 0);
      figure.push(head);
      if (H >= 12) {
        // Crown of seven spikes, tilted outward from the head.
        for (let i = 0; i < 7; i++) {
          const angle = (i / 7) * Math.PI * 2;
          const spike = new THREE.ConeGeometry(
            headRadius * 0.16,
            headRadius * 1.7,
            5,
          ).toNonIndexed();
          const direction = new THREE.Vector3(
            Math.cos(angle) * 0.55,
            1,
            Math.sin(angle) * 0.55,
          ).normalize();
          spike.applyQuaternion(
            new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              direction,
            ),
          );
          spike.translate(
            Math.cos(angle) * headRadius * 0.55,
            headY + headRadius * 0.6,
            Math.sin(angle) * headRadius * 0.55,
          );
          figure.push(spike);
        }
      }
      const limb = (
        from: [number, number, number],
        to: [number, number, number],
        radius: number,
      ): THREE.BufferGeometry => {
        const start = new THREE.Vector3(...from);
        const end = new THREE.Vector3(...to);
        const direction = end.clone().sub(start);
        const length = direction.length();
        const geometry = new THREE.CylinderGeometry(
          radius * 0.85,
          radius,
          length,
          6,
        ).toNonIndexed();
        geometry.applyQuaternion(
          new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            direction.normalize(),
          ),
        );
        const middle = start.add(end).multiplyScalar(0.5);
        geometry.translate(middle.x, middle.y, middle.z);
        return geometry;
      };
      const armRadius = Math.max(0.18, headRadius * 0.32);
      // Raised right arm holding the torch high.
      figure.push(
        limb([R * 0.34, H * 0.84, 0], [R * 0.6, H * 0.92, 0], armRadius),
      );
      figure.push(
        limb([R * 0.6, H * 0.92, 0], [R * 0.74, H * 1.0, 0], armRadius * 0.9),
      );
      // Left arm bent, holding a tablet against the body.
      figure.push(
        limb([R * -0.34, H * 0.84, 0], [R * -0.56, H * 0.68, 0], armRadius),
      );
      const tablet = new THREE.BoxGeometry(
        R * 0.36,
        R * 0.46,
        R * 0.07,
      ).toNonIndexed();
      tablet.rotateZ(0.18);
      tablet.translate(R * -0.6, H * 0.7, 0);
      figure.push(tablet);
      // Torch handle + emissive flame above the raised hand.
      figure.push(
        limb([R * 0.74, H * 1.0, 0], [R * 0.78, H * 1.05, 0], armRadius * 0.55),
      );
      const flameRadius = Math.max(0.4, headRadius * 0.55);
      const flame = new THREE.ConeGeometry(
        flameRadius,
        flameRadius * 2.4,
        8,
      ).toNonIndexed();
      flame.translate(R * 0.78, H * 1.05 + flameRadius * 1.1, 0);
      torch.push(flame);
      return { figure, torch };
    };
    for (const part of building.parts ?? []) {
      if (part.heightInMeters <= part.minHeightInMeters) continue;
      // The monument's tallest volume, floating in its own upper half, is
      // its figure (e.g. the Liberty statue body, 46.9-93 m): tapered.
      // Lower stacked volumes are pedestal steps and keep straight walls.
      const isStatueFigure =
        isMonument &&
        part.minHeightInMeters > 0 &&
        part.minHeightInMeters >= part.heightInMeters * 0.5 &&
        part.heightInMeters - part.minHeightInMeters >= 8 &&
        part.heightInMeters >=
          Math.max(
            0,
            ...(building.parts ?? []).map((other) => other.heightInMeters),
          );
      if (isStatueFigure) {
        renderedStatueFigure = true;
        const figureXs = part.footprint.map((p) => p.x - root.position.x);
        const figureZs = part.footprint.map((p) => p.y - root.position.z);
        const figureCx = (Math.min(...figureXs) + Math.max(...figureXs)) / 2;
        const figureCz = (Math.min(...figureZs) + Math.max(...figureZs)) / 2;
        const statue = buildStatueFigure(
          part.heightInMeters - part.minHeightInMeters,
          (Math.min(
            Math.max(...figureXs) - Math.min(...figureXs),
            Math.max(...figureZs) - Math.min(...figureZs),
          ) /
            2) *
            0.95,
        );
        for (const geometry of statue.figure) {
          geometry.translate(figureCx, part.minHeightInMeters, figureCz);
          monumentGeometries.push(geometry);
        }
        for (const geometry of statue.torch) {
          geometry.translate(figureCx, part.minHeightInMeters, figureCz);
          torchGeometries.push(geometry);
        }
        continue;
      }
      const partShape = new THREE.Shape();
      part.footprint.forEach((point, index) => {
        const [x, y] = toShapePoint(point);
        if (index === 0) partShape.moveTo(x, y);
        else partShape.lineTo(x, y);
      });
      partShape.closePath();
      const partGeometry = new THREE.ExtrudeGeometry(partShape, {
        depth: part.heightInMeters - part.minHeightInMeters,
        bevelEnabled: false,
      });
      partGeometry.rotateX(-Math.PI / 2);
      partGeometry.translate(0, part.minHeightInMeters, 0);
      const partSplit = splitExtrudeByNormal(partGeometry);
      partGeometry.dispose();
      partWallGeometries.push(partSplit.walls);
      partCapGeometries.push(partSplit.caps);
      const partXs = part.footprint.map((p) => p.x);
      const partZs = part.footprint.map((p) => p.y);
      const partWidth = Math.max(...partXs) - Math.min(...partXs);
      const partDepth = Math.max(...partZs) - Math.min(...partZs);
      if (part.heightInMeters >= 45 && Math.max(partWidth, partDepth) <= 16) {
        const capHeight = Math.max(4, Math.min(14, part.heightInMeters * 0.16));
        const pinnacle = new THREE.CylinderGeometry(
          0.05,
          Math.min(partWidth, partDepth) * 0.42,
          capHeight,
          4,
        ).toNonIndexed();
        pinnacle.rotateY(Math.PI / 4);
        pinnacle.translate(
          (Math.min(...partXs) + Math.max(...partXs)) / 2 - root.position.x,
          part.heightInMeters + capHeight / 2,
          (Math.min(...partZs) + Math.max(...partZs)) / 2 - root.position.z,
        );
        partCapGeometries.push(pinnacle);
      }
    }
    if (partWallGeometries.length) {
      const mergedWalls = mergeGeometries(partWallGeometries);
      const mergedCaps = mergeGeometries(partCapGeometries);
      for (const geometry of partWallGeometries) geometry.dispose();
      for (const geometry of partCapGeometries) geometry.dispose();
      if (mergedWalls) {
        const partWalls = new THREE.Mesh(mergedWalls, wallMaterial);
        partWalls.castShadow = partWalls.receiveShadow = true;
        group.add(partWalls);
      }
      if (mergedCaps) {
        const partCaps = new THREE.Mesh(
          mergedCaps,
          roofMaterialFor(building.id),
        );
        partCaps.castShadow = partCaps.receiveShadow = true;
        group.add(partCaps);
      }
    }
    // Monument with no surveyed figure at all (point-mapped statues and
    // obelisks): representative tapered figure on the plinth, so the full
    // declared height reads as a monument, not a solid block.
    if (isMonument && !renderedStatueFigure && !building.parts?.length) {
      const figureHeightInMeters = building.heightInMeters - baseDepthInMeters;
      if (figureHeightInMeters >= 4) {
        const localXs = footprint.map((p) => p.x - root.position.x);
        const localZs = footprint.map((p) => p.y - root.position.z);
        const minDimension = Math.min(
          Math.max(...localXs) - Math.min(...localXs),
          Math.max(...localZs) - Math.min(...localZs),
        );
        if (building.monumentShape === 'obelisk') {
          // Tapered square shaft plus a small pyramidion (the "mini cone"
          // tip), reaching exactly the declared height.
          const shaftHeightInMeters = figureHeightInMeters * 0.85;
          const shaft = new THREE.CylinderGeometry(
            Math.max(0.25, minDimension * 0.09),
            Math.max(0.5, minDimension * 0.2),
            shaftHeightInMeters,
            4,
          ).toNonIndexed();
          shaft.rotateY(Math.PI / 4);
          shaft.translate(
            footprintCentroid.x - root.position.x,
            baseDepthInMeters + shaftHeightInMeters / 2,
            footprintCentroid.y - root.position.z,
          );
          monumentGeometries.push(shaft);
          const pyramidion = new THREE.ConeGeometry(
            Math.max(0.35, minDimension * 0.13),
            figureHeightInMeters - shaftHeightInMeters,
            4,
          ).toNonIndexed();
          pyramidion.rotateY(Math.PI / 4);
          pyramidion.translate(
            footprintCentroid.x - root.position.x,
            baseDepthInMeters +
              shaftHeightInMeters +
              (figureHeightInMeters - shaftHeightInMeters) / 2,
            footprintCentroid.y - root.position.z,
          );
          monumentGeometries.push(pyramidion);
        } else {
          // Modelled robed statue on its plinth (same builder as the
          // surveyed floating figures, scaled to the declared height).
          const statue = buildStatueFigure(
            figureHeightInMeters,
            minDimension * 0.4,
          );
          for (const geometry of statue.figure) {
            geometry.translate(
              footprintCentroid.x - root.position.x,
              baseDepthInMeters,
              footprintCentroid.y - root.position.z,
            );
            monumentGeometries.push(geometry);
          }
          for (const geometry of statue.torch) {
            geometry.translate(
              footprintCentroid.x - root.position.x,
              baseDepthInMeters,
              footprintCentroid.y - root.position.z,
            );
            torchGeometries.push(geometry);
          }
        }
      }
    }
    if (monumentGeometries.length) {
      const mergedFigure = mergeGeometries(monumentGeometries);
      for (const geometry of monumentGeometries) geometry.dispose();
      if (mergedFigure) {
        const figureMesh = new THREE.Mesh(
          mergedFigure,
          building.monumentShape === 'obelisk'
            ? footprintFacadeMaterials.stone
            : monumentMaterial,
        );
        figureMesh.name = `monument-figure:${building.id}`;
        figureMesh.castShadow = figureMesh.receiveShadow = true;
        group.add(figureMesh);
      }
    }
    if (torchGeometries.length) {
      const mergedTorch = mergeGeometries(torchGeometries);
      for (const geometry of torchGeometries) geometry.dispose();
      if (mergedTorch) {
        const torchMesh = new THREE.Mesh(mergedTorch, torchFlameMaterial);
        torchMesh.name = `monument-torch:${building.id}`;
        group.add(torchMesh);
      }
    }
    if (building.landmark === 'health') {
      const marker = createHealthMarker(building.heightInMeters);
      marker.position.set(
        footprintCentroid.x - root.position.x,
        0,
        footprintCentroid.y - root.position.z,
      );
      group.add(marker);
    }
    if (building.landmark === 'stadium') {
      // Floodlight poles at the footprint corners: a stadium reads from
      // the air before any facade detail does.
      const xs = footprint.map((p) => p.x - root.position.x);
      const zs = footprint.map((p) => p.y - root.position.z);
      const corners: [number, number][] = [
        [Math.min(...xs) + 3, Math.min(...zs) + 3],
        [Math.min(...xs) + 3, Math.max(...zs) - 3],
        [Math.max(...xs) - 3, Math.min(...zs) + 3],
        [Math.max(...xs) - 3, Math.max(...zs) - 3],
      ];
      for (const [cornerX, cornerZ] of corners) {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.24, 10, 6),
          floodlightPoleMaterial,
        );
        pole.position.set(cornerX, building.heightInMeters + 5, cornerZ);
        const head = new THREE.Mesh(
          new THREE.BoxGeometry(1.8, 0.9, 0.5),
          floodlightHeadMaterial,
        );
        head.position.set(cornerX, building.heightInMeters + 10.2, cornerZ);
        group.add(pole, head);
      }
    }
    if (building.landmark === 'religious') {
      // Representative spire (not a 1:1 reconstruction): a tapered stone
      // prism over the footprint centroid so churches read as churches.
      const centroid = footprint.reduce(
        (acc, point) => ({
          x: acc.x + point.x / footprint.length,
          y: acc.y + point.y / footprint.length,
        }),
        { x: 0, y: 0 },
      );
      const spireHeight = Math.max(
        6,
        Math.min(16, building.heightInMeters * 0.45),
      );
      const baseRadius = Math.max(
        1.2,
        Math.min(
          building.presentation?.widthInMeters ?? 10,
          building.presentation?.depthInMeters ?? 10,
        ) * 0.16,
      );
      const spire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, baseRadius, spireHeight, 4),
        footprintFacadeMaterials.stone,
      );
      spire.position.set(
        centroid.x - root.position.x,
        building.heightInMeters + spireHeight / 2,
        centroid.y - root.position.z,
      );
      spire.rotation.y = Math.PI / 4;
      spire.castShadow = true;
      group.add(spire);
    }
    let cathedralTowersAdded = false;
    if (
      building.landmark === 'cathedral' &&
      !(building.parts ?? []).some(
        (part) => part.heightInMeters > building.heightInMeters,
      )
    ) {
      // Cathedrals/basílicas without surveyed towers (e.g. Luján) get the
      // archetype they are known by: twin facade towers with spires and
      // crosses, at the footprint's front corners. Surveyed 3D parts
      // (Sagrada Familia) always win over this archetype.
      cathedralTowersAdded = true;
      const localXs = footprint.map((p) => p.x - root.position.x);
      const localZs = footprint.map((p) => p.y - root.position.z);
      const footprintWidth = Math.max(...localXs) - Math.min(...localXs);
      const footprintDepth = Math.max(...localZs) - Math.min(...localZs);
      const towerSizeInMeters = Math.max(
        3,
        Math.min(9, Math.min(footprintWidth, footprintDepth) * 0.18),
      );
      const towerTopInMeters =
        building.heightInMeters +
        Math.max(18, Math.min(42, building.heightInMeters * 0.9));
      const spireHeightInMeters = Math.max(
        8,
        Math.min(22, towerTopInMeters * 0.32),
      );
      const frontZ = Math.min(...localZs) + towerSizeInMeters / 2 + 1;
      const towers = new THREE.Group();
      towers.name = `cathedral-towers:${building.id}`;
      for (const towerX of [
        Math.min(...localXs) + towerSizeInMeters / 2 + 1,
        Math.max(...localXs) - towerSizeInMeters / 2 - 1,
      ]) {
        const shaft = new THREE.Mesh(
          new THREE.BoxGeometry(
            towerSizeInMeters,
            towerTopInMeters,
            towerSizeInMeters,
          ),
          footprintFacadeMaterials.stone,
        );
        shaft.position.set(towerX, towerTopInMeters / 2, frontZ);
        shaft.castShadow = shaft.receiveShadow = true;
        const towerSpire = new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.05,
            towerSizeInMeters * 0.62,
            spireHeightInMeters,
            4,
          ),
          footprintFacadeMaterials.stone,
        );
        towerSpire.rotation.y = Math.PI / 4;
        towerSpire.position.set(
          towerX,
          towerTopInMeters + spireHeightInMeters / 2,
          frontZ,
        );
        towerSpire.castShadow = true;
        const crossHeightInMeters = Math.max(
          1.4,
          Math.min(3.5, (towerTopInMeters + spireHeightInMeters) * 0.05),
        );
        const crossVertical = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, crossHeightInMeters, 0.2),
          finialMaterial,
        );
        crossVertical.position.set(
          towerX,
          towerTopInMeters + spireHeightInMeters + crossHeightInMeters / 2,
          frontZ,
        );
        const crossHorizontal = new THREE.Mesh(
          new THREE.BoxGeometry(crossHeightInMeters * 0.6, 0.2, 0.2),
          finialMaterial,
        );
        crossHorizontal.position.set(
          towerX,
          towerTopInMeters + spireHeightInMeters + crossHeightInMeters * 0.68,
          frontZ,
        );
        towers.add(shaft, towerSpire, crossVertical, crossHorizontal);
      }
      group.add(towers);
    }
    if (
      building.landmark === 'religious' ||
      (building.landmark === 'cathedral' && !cathedralTowersAdded)
    ) {
      // Cross finial on the highest point (tallest tower part, pinnacle
      // included, else the spire): churches read from the air by it.
      let topX = footprintCentroid.x - root.position.x;
      let topZ = footprintCentroid.y - root.position.z;
      let topHeightInMeters =
        building.heightInMeters +
        Math.max(6, Math.min(16, building.heightInMeters * 0.45));
      const tallestPart = (building.parts ?? [])
        .filter((part) => part.heightInMeters > building.heightInMeters)
        .sort((a, b) => b.heightInMeters - a.heightInMeters)[0];
      if (tallestPart) {
        const partXs = tallestPart.footprint.map((p) => p.x);
        const partZs = tallestPart.footprint.map((p) => p.y);
        topX =
          (Math.min(...partXs) + Math.max(...partXs)) / 2 - root.position.x;
        topZ =
          (Math.min(...partZs) + Math.max(...partZs)) / 2 - root.position.z;
        topHeightInMeters = tallestPart.heightInMeters;
        const partWidth = Math.max(...partXs) - Math.min(...partXs);
        const partDepth = Math.max(...partZs) - Math.min(...partZs);
        if (
          tallestPart.heightInMeters >= 45 &&
          Math.max(partWidth, partDepth) <= 16
        )
          topHeightInMeters += Math.max(
            4,
            Math.min(14, tallestPart.heightInMeters * 0.16),
          );
      }
      const crossHeightInMeters = Math.max(
        1.2,
        Math.min(4, topHeightInMeters * 0.06),
      );
      const cross = new THREE.Group();
      cross.name = `cross:${building.id}`;
      const vertical = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, crossHeightInMeters, 0.22),
        finialMaterial,
      );
      vertical.position.set(
        topX,
        topHeightInMeters + crossHeightInMeters / 2,
        topZ,
      );
      const horizontal = new THREE.Mesh(
        new THREE.BoxGeometry(crossHeightInMeters * 0.6, 0.22, 0.22),
        finialMaterial,
      );
      horizontal.position.set(
        topX,
        topHeightInMeters + crossHeightInMeters * 0.68,
        topZ,
      );
      vertical.castShadow = horizontal.castShadow = true;
      cross.add(vertical, horizontal);
      group.add(cross);
    }
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
    if (!complex && building.landmark === 'health') {
      const marker = createHealthMarker(building.heightInMeters);
      marker.name = `marker:${building.id}`;
      marker.position.copy(root.position);
      group.add(marker);
    }
    if (
      !complex &&
      (building.landmark === 'religious' || building.landmark === 'cathedral')
    ) {
      const spireHeight = Math.max(
        6,
        Math.min(16, building.heightInMeters * 0.45),
      );
      spires.push({
        position: worldAt(0, building.heightInMeters + spireHeight / 2, 0),
        scale: new THREE.Vector3(
          Math.min(w, d) * 0.36,
          spireHeight,
          Math.min(w, d) * 0.36,
        ),
        yaw,
      });
      spireIds.push(building.id);
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
      // Foundation reaches the lowest terrain under the footprint, not
      // just its corners, so raised pads never float over DEM dips.
      const minimum = buildingGroundRangeInMeters(city, building).minInMeters;
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
  if (spires.length)
    group.add(
      createChunkedInstances({
        name: 'building-spires',
        geometry: new THREE.CylinderGeometry(0, 0.5, 1, 4),
        material: footprintFacadeMaterials.stone,
        placements: spires,
        castShadow: true,
        receiveShadow: true,
        ids: spireIds,
      }),
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
    if (
      object.name.startsWith('footprint:') ||
      object.name.startsWith('marker:')
    ) {
      const id = object.name.slice(object.name.indexOf(':') + 1);
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
