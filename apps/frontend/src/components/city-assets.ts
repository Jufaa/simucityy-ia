import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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
export type CityAssetLayer = { group: THREE.Group; dispose(): void };
type AssetLoader = (url: string) => Promise<THREE.Object3D>;

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

/** Transfers ownership of templates to this layer; do not share them across live layers. */
export function buildCityAssetLayer(
  city: CityResponse,
  templates: Templates,
): CityAssetLayer {
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
  const layer = {
    group,
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
    for (const [key, poses] of placements) {
      templates[key].traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        if (node instanceof THREE.SkinnedMesh)
          throw new Error('Animated city assets are unsupported');
        const instances = new THREE.InstancedMesh(
          node.geometry,
          node.material,
          poses.length,
        );
        instances.name = `${key}:${node.name}`;
        instances.castShadow = instances.receiveShadow = true;
        poses.forEach((pose, index) =>
          instances.setMatrixAt(index, pose.clone().multiply(node.matrixWorld)),
        );
        instances.instanceMatrix.needsUpdate = true;
        instances.computeBoundingSphere();
        group.add(instances);
      });
    }
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
