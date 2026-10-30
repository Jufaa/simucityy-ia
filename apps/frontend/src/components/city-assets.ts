import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import type { Building, CityResponse } from './city-types';
import { buildingBaseHeight, sampleTerrainHeight } from './terrain-view';

export const CITY_ASSETS = [
  'suburban/building-type-a.glb',
  'suburban/building-type-b.glb',
  'suburban/building-type-c.glb',
  'commercial/building-a.glb',
  'commercial/building-b.glb',
  'commercial/building-skyscraper-a.glb',
] as const;

type AssetKey = (typeof CITY_ASSETS)[number];
type Templates = Record<AssetKey, THREE.Object3D>;
export type CityAssetLayer = {
  group: THREE.Group;
  dispose(): void;
  /** Derrumbe visual de un edificio: 0 = intacto, 1 = totalmente caído. */
  setBuildingCollapse(buildingId: string, progress: number): void;
  /** Reasigna edificios entre niveles de detalle según la cámara. True si cambió algo. */
  update?(cameraPosition: THREE.Vector3): boolean;
};
type AssetLoader = (url: string) => Promise<THREE.Object3D>;

/** Level-of-detail bands: full model, simplified model, box impostor. */
export const LOD_NEAR_IN_METERS = 90;
export const LOD_MID_IN_METERS = 220;
const LOD_HYSTERESIS_IN_METERS = 10;

export function lodLevelForDistance(distanceInMeters: number): 0 | 1 | 2 {
  if (distanceInMeters < LOD_NEAR_IN_METERS) return 0;
  if (distanceInMeters < LOD_MID_IN_METERS) return 1;
  return 2;
}

function lodWithHysteresis(
  current: 0 | 1 | 2,
  distanceInMeters: number,
): 0 | 1 | 2 {
  const h = LOD_HYSTERESIS_IN_METERS;
  if (current === 0)
    return distanceInMeters > LOD_MID_IN_METERS + h
      ? 2
      : distanceInMeters > LOD_NEAR_IN_METERS + h
        ? 1
        : 0;
  if (current === 1)
    return distanceInMeters < LOD_NEAR_IN_METERS - h
      ? 0
      : distanceInMeters > LOD_MID_IN_METERS + h
        ? 2
        : 1;
  return distanceInMeters < LOD_NEAR_IN_METERS - h
    ? 0
    : distanceInMeters < LOD_MID_IN_METERS - h
      ? 1
      : 2;
}

const IMPOSTOR_COLORS = [
  0xcbb59d, 0xbfae94, 0xd0c2ae, 0xaebfc4, 0xb9c0c8, 0x9fb2bd,
];

/** Local-only URLs; every GLB and its relative texture is vendored with CC0 provenance. */
export async function loadCityAssetLayer(
  city: CityResponse,
  load: AssetLoader = async (url) =>
    (await new GLTFLoader().loadAsync(url)).scene,
): Promise<CityAssetLayer> {
  const templates: Partial<Templates> = {};
  try {
    // Sequential acquisition makes partial failure ownership explicit (no late promises).
    for (const key of CITY_ASSETS) {
      templates[key] = await load(`/models/kenney-city/${key}`);
    }
    return buildCityAssetLayer(city, templates as Templates);
  } catch (error) {
    disposeObjects(Object.values(templates));
    throw error;
  }
}

function disposeObjects(objects: THREE.Object3D[]) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const instances = new Set<THREE.InstancedMesh>();
  for (const object of objects) {
    object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material)
        ? node.material
        : [node.material]) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
      }
      if (node instanceof THREE.InstancedMesh) instances.add(node);
    });
  }
  for (const instance of instances) instance.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) {
    // GLTFLoader can create ImageBitmaps, which Texture.dispose does not close.
    const image: unknown = texture.source.data;
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap)
      image.close();
    texture.dispose();
  }
}

function chooseAsset(building: Building, index: number): AssetKey {
  if (
    building.architecture?.style === 'shop' ||
    building.use === 'commercial'
  ) {
    return CITY_ASSETS[3 + (index % 2)]!;
  }
  if (
    building.architecture?.style === 'apartment' ||
    building.heightInMeters > 18
  ) {
    return CITY_ASSETS[5];
  }
  return CITY_ASSETS[index % 3]!;
}

type BuildingRecord = {
  id: string;
  x: number;
  base: number;
  z: number;
  height: number;
  tilt: number;
  nodeOriginals: THREE.Matrix4[];
  impostorOriginal: THREE.Matrix4;
};

type AssetLod = {
  key: AssetKey;
  records: BuildingRecord[];
  nodes: { lod0: THREE.InstancedMesh; lod1: THREE.InstancedMesh }[];
  impostor: THREE.InstancedMesh;
  assignment: (0 | 1 | 2)[];
  bucketIndex: number[];
};

/** Transfers ownership of templates to this layer; do not share them across live layers. */
export async function buildCityAssetLayer(
  city: CityResponse,
  templates: Templates,
): Promise<CityAssetLayer> {
  const group = new THREE.Group();
  group.name = 'kenney-city-assets';
  group.userData.buildingCount = city.buildings.length;
  const placements = new Map<AssetKey, THREE.Matrix4[]>();
  const foundations: THREE.Matrix4[] = [];
  const foundationGeometry = new THREE.BoxGeometry(1, 1, 1);
  const foundationMaterial = new THREE.MeshStandardMaterial({
    color: 0xaaa79d,
    roughness: 1,
  });
  let disposed = false;
  const collapseProgress = new Map<string, number>();
  const assets = new Map<AssetKey, AssetLod>();
  const recordById = new Map<string, { asset: AssetLod; index: number }>();
  const lastCamera = new THREE.Vector3(Number.NaN, 0, 0);

  const writePlacement = (asset: AssetLod, index: number) => {
    const record = asset.records[index]!;
    const lod = asset.assignment[index]!;
    const slot = asset.bucketIndex[index]!;
    const progress = collapseProgress.get(record.id) ?? 0;
    const apply = (mesh: THREE.InstancedMesh, original: THREE.Matrix4) => {
      if (progress === 0) {
        mesh.setMatrixAt(slot, original);
      } else {
        // Hundir hacia la base, comprimir la altura e inclinar: la
        // instancia cae sobre su propia parcela sin moverse de sitio.
        const collapse = new THREE.Matrix4()
          .makeTranslation(record.x, record.base, record.z)
          .multiply(new THREE.Matrix4().makeRotationZ(record.tilt * progress))
          .multiply(
            new THREE.Matrix4().makeRotationX(record.tilt * 0.6 * progress),
          )
          .multiply(new THREE.Matrix4().makeScale(1, 1 - 0.68 * progress, 1))
          .multiply(
            new THREE.Matrix4().makeTranslation(
              -record.x,
              -record.base,
              -record.z,
            ),
          );
        mesh.setMatrixAt(slot, collapse.multiply(original.clone()));
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    if (lod === 2) {
      apply(asset.impostor, record.impostorOriginal);
    } else {
      asset.nodes.forEach((node, nodeIndex) =>
        apply(
          lod === 0 ? node.lod0 : node.lod1,
          record.nodeOriginals[nodeIndex]!,
        ),
      );
    }
  };

  const rebuildAsset = (asset: AssetLod) => {
    const counters = [0, 0, 0];
    asset.records.forEach((_, index) => {
      const lod = asset.assignment[index]!;
      asset.bucketIndex[index] = counters[lod]!;
      counters[lod]!++;
    });
    asset.records.forEach((_, index) => writePlacement(asset, index));
    for (const node of asset.nodes) {
      node.lod0.count = counters[0]!;
      node.lod1.count = counters[1]!;
      node.lod0.computeBoundingSphere();
      node.lod1.computeBoundingSphere();
    }
    asset.impostor.count = counters[2]!;
    asset.impostor.computeBoundingSphere();
  };

  const layer: CityAssetLayer = {
    group,
    setBuildingCollapse(buildingId: string, progress: number) {
      if (disposed) return;
      const found = recordById.get(buildingId);
      if (!found) return;
      collapseProgress.set(buildingId, Math.max(0, Math.min(1, progress)));
      writePlacement(found.asset, found.index);
    },
    update(cameraPosition: THREE.Vector3) {
      if (disposed) return false;
      if (
        Number.isFinite(lastCamera.x) &&
        lastCamera.distanceToSquared(cameraPosition) < 16
      )
        return false;
      lastCamera.copy(cameraPosition);
      let changed = false;
      for (const asset of assets.values()) {
        let assetChanged = false;
        asset.records.forEach((record, index) => {
          const distance = cameraPosition.distanceTo(
            new THREE.Vector3(
              record.x,
              record.base + record.height / 2,
              record.z,
            ),
          );
          const next = lodWithHysteresis(asset.assignment[index]!, distance);
          if (next !== asset.assignment[index]) {
            asset.assignment[index] = next;
            assetChanged = true;
          }
        });
        if (assetChanged) {
          rebuildAsset(asset);
          changed = true;
        }
      }
      return changed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeObjects([...Object.values(templates), group]);
      // These may not be referenced by a mesh on flat terrain.
      if (!foundations.length) {
        foundationGeometry.dispose();
        foundationMaterial.dispose();
      }
      group.clear();
    },
  };
  try {
    const boundsByAsset = new Map<AssetKey, THREE.Box3>();
    for (const key of CITY_ASSETS) {
      const template = templates[key];
      template.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(template);
      const size = bounds.getSize(new THREE.Vector3());
      if (
        !Number.isFinite(size.length()) ||
        Math.min(size.x, size.y, size.z) <= 0
      ) {
        throw new Error(`Invalid city asset bounds: ${key}`);
      }
      boundsByAsset.set(key, bounds);
    }
    const buildingPoses: {
      id: string;
      key: AssetKey;
      index: number;
      x: number;
      base: number;
      z: number;
      height: number;
      width: number;
      depth: number;
      yaw: number;
    }[] = [];
    city.buildings.forEach((building, index) => {
      const key = chooseAsset(building, index);
      const bounds = boundsByAsset.get(key)!;
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const x = (building.minCorner.x + building.maxCorner.x) / 2;
      const z = (building.minCorner.y + building.maxCorner.y) / 2;
      const aabbWidth = building.maxCorner.x - building.minCorner.x;
      const aabbDepth = building.maxCorner.y - building.minCorner.y;
      const yaw = building.presentation?.yawInRadians ?? 0;
      let width = building.presentation?.widthInMeters ?? aabbWidth;
      let depth = building.presentation?.depthInMeters ?? aabbDepth;
      // Bound even malformed/rounded presentation dimensions conservatively.
      const c = Math.abs(Math.cos(yaw)),
        s = Math.abs(Math.sin(yaw));
      const fit = Math.min(
        1,
        aabbWidth / (c * width + s * depth),
        aabbDepth / (s * width + c * depth),
      );
      width *= fit;
      depth *= fit;
      const base = buildingBaseHeight(city, building);
      const pose = new THREE.Matrix4()
        .compose(
          new THREE.Vector3(x, base, z),
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            yaw,
          ),
          new THREE.Vector3(
            width / size.x,
            building.heightInMeters / size.y,
            depth / size.z,
          ),
        )
        .multiply(
          new THREE.Matrix4().makeTranslation(
            -center.x,
            -bounds.min.y,
            -center.z,
          ),
        );
      const batch = placements.get(key) ?? [];
      buildingPoses.push({
        id: building.id,
        key,
        index: batch.length,
        x,
        base,
        z,
        height: building.heightInMeters,
        width,
        depth,
        yaw,
      });
      batch.push(pose);
      placements.set(key, batch);
      // A solid plinth reaches the lowest sampled footprint corner, not just its center.
      const ground = Math.min(
        base,
        ...[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => {
            const localX = (sx * width) / 2,
              localZ = (sz * depth) / 2;
            return sampleTerrainHeight(
              city,
              x + Math.cos(yaw) * localX + Math.sin(yaw) * localZ,
              z - Math.sin(yaw) * localX + Math.cos(yaw) * localZ,
            );
          }),
        ),
        sampleTerrainHeight(city, x, z),
      );
      if (base - ground > 0.01) {
        foundations.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(x, (ground + base) / 2 - 0.025, z),
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              yaw,
            ),
            new THREE.Vector3(width, base - ground + 0.05, depth),
          ),
        );
      }
    });
    // Collect template parts once; LOD1 geometries are meshopt simplifications
    // of the same parts (cached per geometry), LOD2 is a fitted box impostor.
    const modifier = new SimplifyModifier();
    const simplifiedCache = new Map<
      THREE.BufferGeometry,
      Promise<THREE.BufferGeometry>
    >();
    const simplify = (geometry: THREE.BufferGeometry) => {
      const vertexCount = geometry.getAttribute('position').count;
      if (vertexCount < 24) return Promise.resolve(geometry);
      const cached = simplifiedCache.get(geometry);
      if (cached) return cached;
      const pending = modifier
        .modify(geometry, Math.floor(vertexCount * 0.75))
        .catch(() => geometry);
      simplifiedCache.set(geometry, pending);
      return pending;
    };
    type Part = {
      geometry: THREE.BufferGeometry;
      simplified: THREE.BufferGeometry;
      material: THREE.Material | THREE.Material[];
      nodeMatrix: THREE.Matrix4;
      name: string;
    };
    const partsByAsset = new Map<AssetKey, Part[]>();
    for (const key of placements.keys()) {
      const parts: Part[] = [];
      const pending: Promise<void>[] = [];
      templates[key].traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        if (node instanceof THREE.SkinnedMesh)
          throw new Error('Animated city assets are unsupported');
        const part: Part = {
          geometry: node.geometry,
          simplified: node.geometry,
          material: node.material,
          nodeMatrix: node.matrixWorld.clone(),
          name: node.name,
        };
        parts.push(part);
        pending.push(
          simplify(node.geometry).then((geometry) => {
            part.simplified = geometry;
          }),
        );
      });
      await Promise.all(pending);
      partsByAsset.set(key, parts);
    }
    // Creation passes keep every LOD0 batch first (existing ordering contract).
    for (const lod of [0, 1, 2] as const) {
      for (const [key, poses] of placements) {
        const parts = partsByAsset.get(key)!;
        const asset: AssetLod = assets.get(key) ?? {
          key,
          records: [],
          nodes: [],
          impostor: undefined as unknown as THREE.InstancedMesh,
          assignment: poses.map(() => 0 as const),
          bucketIndex: poses.map(() => 0),
        };
        assets.set(key, asset);
        if (lod === 2) {
          const impostor = new THREE.InstancedMesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshStandardMaterial({
              color: IMPOSTOR_COLORS[CITY_ASSETS.indexOf(key)] ?? 0xbfb49e,
              roughness: 0.95,
            }),
            poses.length,
          );
          impostor.name = `${key}:lod2:impostor`;
          impostor.castShadow = impostor.receiveShadow = true;
          asset.impostor = impostor;
          group.add(impostor);
          continue;
        }
        parts.forEach((part, partIndex) => {
          const instances = new THREE.InstancedMesh(
            lod === 0 ? part.geometry : part.simplified,
            part.material,
            poses.length,
          );
          instances.name = `${key}:lod${lod}:${part.name}`;
          instances.castShadow = instances.receiveShadow = true;
          group.add(instances);
          if (lod === 0)
            asset.nodes.push({ lod0: instances, lod1: undefined! });
          else asset.nodes[partIndex]!.lod1 = instances;
        });
      }
    }
    for (const pose of buildingPoses) {
      const asset = assets.get(pose.key)!;
      const parts = partsByAsset.get(pose.key)!;
      const batch = placements.get(pose.key)!;
      const record: BuildingRecord = {
        id: pose.id,
        x: pose.x,
        base: pose.base,
        z: pose.z,
        height: pose.height,
        tilt:
          ([...pose.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 2 === 0
            ? 1
            : -1) * 0.16,
        nodeOriginals: parts.map((part) =>
          batch[pose.index]!.clone().multiply(part.nodeMatrix),
        ),
        impostorOriginal: new THREE.Matrix4().compose(
          new THREE.Vector3(pose.x, pose.base + pose.height / 2, pose.z),
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            pose.yaw,
          ),
          new THREE.Vector3(pose.width, pose.height, pose.depth),
        ),
      };
      const index = asset.records.length;
      asset.records.push(record);
      recordById.set(pose.id, { asset, index });
    }
    for (const asset of assets.values()) rebuildAsset(asset);
    if (foundations.length) {
      const instances = new THREE.InstancedMesh(
        foundationGeometry,
        foundationMaterial,
        foundations.length,
      );
      instances.name = 'kenney-foundations';
      instances.castShadow = instances.receiveShadow = true;
      foundations.forEach((matrix, index) =>
        instances.setMatrixAt(index, matrix),
      );
      instances.instanceMatrix.needsUpdate = true;
      instances.computeBoundingSphere();
      group.add(instances);
    }
    return layer;
  } catch (error) {
    // Caller still owns templates if construction fails; release only new resources here.
    for (const child of group.children)
      if (child instanceof THREE.InstancedMesh) child.dispose();
    foundationGeometry.dispose();
    foundationMaterial.dispose();
    throw error;
  }
}

/** A replaced/unmounted scene never acquires a late asset result. */
export function mountCityAssets(
  city: CityResponse,
  scene: THREE.Scene,
  fallback: THREE.Object3D,
  notify: (status: 'loading' | 'ready' | 'fallback') => void,
  load: (city: CityResponse) => Promise<CityAssetLayer> = loadCityAssetLayer,
  onReady?: (layer: CityAssetLayer) => void,
): () => void {
  let live = true;
  let owned: CityAssetLayer | undefined;
  notify('loading');
  void load(city)
    .then((layer) => {
      if (!live) {
        layer.dispose();
        return;
      }
      owned = layer;
      scene.add(layer.group);
      fallback.visible = false;
      onReady?.(layer);
      notify('ready');
    })
    .catch(() => {
      if (live) notify('fallback');
    });
  return () => {
    if (!live) return;
    live = false;
    if (owned) {
      scene.remove(owned.group);
      owned.dispose();
    }
  };
}
