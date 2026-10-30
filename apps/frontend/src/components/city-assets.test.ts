import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  buildCityAssetLayer,
  CITY_ASSETS,
  loadCityAssetLayer,
  lodLevelForDistance,
  mountCityAssets,
} from './city-assets';
import type { CityResponse } from './city-types';

function city(): CityResponse {
  return {
    config: {
      widthInMeters: 100,
      heightInMeters: 100,
      streetSpacingInMeters: 20,
    },
    terrain: { kind: 'flat', elevationInMeters: 7 },
    roads: [],
    blocks: [],
    buildings: [0, 1, 2].map((i) => ({
      id: `house-${i}`,
      minCorner: { x: i * 20, y: 0 },
      maxCorner: { x: i * 20 + 14, y: 14 },
      heightInMeters: 10,
      presentation: {
        widthInMeters: 8,
        depthInMeters: 10,
        yawInRadians: Math.PI / 4,
      },
    })),
  };
}
function template() {
  const group = new THREE.Group();
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 3), material);
  mesh.position.set(2, 3, -1);
  group.add(mesh);
  return { group, texture, material, geometry: mesh.geometry };
}

function templatesFor(group: THREE.Object3D) {
  return Object.fromEntries(
    CITY_ASSETS.map((key) => [key, group]),
  ) as Parameters<typeof buildCityAssetLayer>[1];
}

it('fits rotated assets inside hazard bounds at the terrain base, batches parts and leaves input unchanged', async () => {
  const input = city(),
    before = structuredClone(input),
    asset = template();
  const templates = templatesFor(asset.group);
  const layer = await buildCityAssetLayer(input, templates);
  expect(input).toEqual(before);
  expect(layer.group.userData.buildingCount).toBe(3);
  const instances = layer.group.children.filter(
    (child) => child instanceof THREE.InstancedMesh,
  );
  expect(instances.reduce((n, mesh) => n + mesh.count, 0)).toBe(3);
  for (let i = 0; i < 3; i++) {
    const batch = instances[i]!;
    const matrix = new THREE.Matrix4();
    batch.getMatrixAt(0, matrix);
    const bounds = asset.geometry.boundingBox!.clone().applyMatrix4(matrix);
    expect(bounds.min.x).toBeGreaterThanOrEqual(
      input.buildings[i]!.minCorner.x - 1e-5,
    );
    expect(bounds.max.x).toBeLessThanOrEqual(
      input.buildings[i]!.maxCorner.x + 1e-5,
    );
    expect(bounds.min.z).toBeGreaterThanOrEqual(-1e-5);
    expect(bounds.max.z).toBeLessThanOrEqual(14 + 1e-5);
    expect(bounds.min.y).toBeCloseTo(7);
    expect(bounds.max.y).toBeCloseTo(17);
    const xAxis = new THREE.Vector3()
      .setFromMatrixColumn(matrix, 0)
      .normalize();
    expect(xAxis.x).toBeCloseTo(Math.SQRT1_2);
    expect(xAxis.z).toBeCloseTo(-Math.SQRT1_2);
  }
  layer.dispose();
});

it('collapses a single instanced building toward its base and restores it', async () => {
  const asset = template();
  const layer = await buildCityAssetLayer(city(), templatesFor(asset.group));
  const batch = layer.group.children.find(
    (child) => child instanceof THREE.InstancedMesh,
  ) as THREE.InstancedMesh;
  const original = new THREE.Matrix4();
  batch.getMatrixAt(0, original);
  const heightOf = (matrix: THREE.Matrix4) =>
    asset.geometry.boundingBox!.clone().applyMatrix4(matrix).max.y;
  layer.setBuildingCollapse('house-0', 1);
  const fallen = new THREE.Matrix4();
  batch.getMatrixAt(0, fallen);
  expect(heightOf(fallen)).toBeLessThan(heightOf(original) - 3);
  layer.setBuildingCollapse('house-0', 0);
  const restored = new THREE.Matrix4();
  batch.getMatrixAt(0, restored);
  expect(restored.equals(original)).toBe(true);
  layer.dispose();
});

it('assigns buildings to three LOD bands by camera distance', async () => {
  expect(lodLevelForDistance(10)).toBe(0);
  expect(lodLevelForDistance(150)).toBe(1);
  expect(lodLevelForDistance(500)).toBe(2);
  const asset = template();
  const layer = await buildCityAssetLayer(city(), templatesFor(asset.group));
  const counts = (suffix: string) =>
    layer.group.children
      .filter(
        (child): child is THREE.InstancedMesh =>
          child instanceof THREE.InstancedMesh && child.name.includes(suffix),
      )
      .reduce((total, mesh) => total + mesh.count, 0);
  // No camera update yet: everything starts at full detail.
  expect(counts(':lod0:')).toBe(3);
  expect(counts(':lod1:')).toBe(0);
  expect(counts(':lod2:')).toBe(0);
  // Far away every building becomes a box impostor.
  expect(layer.update!(new THREE.Vector3(5000, 500, 5000))).toBe(true);
  expect(counts(':lod0:')).toBe(0);
  expect(counts(':lod1:')).toBe(0);
  expect(counts(':lod2:')).toBe(3);
  // Close up the full models return, and collapsing still finds its instance.
  expect(layer.update!(new THREE.Vector3(7, 10, 7))).toBe(true);
  expect(counts(':lod0:')).toBe(3);
  const batch = layer.group.children.find(
    (child) => child instanceof THREE.InstancedMesh,
  ) as THREE.InstancedMesh;
  const original = new THREE.Matrix4();
  batch.getMatrixAt(0, original);
  layer.setBuildingCollapse('house-0', 1);
  const fallen = new THREE.Matrix4();
  batch.getMatrixAt(0, fallen);
  expect(fallen.equals(original)).toBe(false);
  layer.dispose();
});

it('owns and disposes geometry, material, textures and instance buffers exactly once', async () => {
  const asset = template();
  const spies = [asset.geometry, asset.material, asset.texture].map((item) =>
    vi.spyOn(item, 'dispose'),
  );
  const layer = await buildCityAssetLayer(city(), templatesFor(asset.group));
  const instanceSpies = layer.group.children
    .filter((child) => child instanceof THREE.InstancedMesh)
    .map((item) => vi.spyOn(item, 'dispose'));
  layer.dispose();
  layer.dispose();
  for (const spy of [...spies, ...instanceSpies])
    expect(spy).toHaveBeenCalledTimes(1);
  expect(layer.group.children).toHaveLength(0);
});

it('rejects partial loading and frees already loaded templates for procedural fallback', async () => {
  const asset = template();
  const dispose = vi.spyOn(asset.geometry, 'dispose');
  let calls = 0;
  await expect(
    loadCityAssetLayer(city(), async () => {
      if (++calls === 2) throw new Error('offline');
      return asset.group;
    }),
  ).rejects.toThrow('offline');
  expect(dispose).toHaveBeenCalledTimes(1);
});

it('vendors unmodified, hash-verified CC0 files with only local texture dependencies', () => {
  const root = new URL('../../public/models/kenney-city/', import.meta.url);
  const manifest = JSON.parse(
    readFileSync(new URL('manifest.json', root), 'utf8'),
  );
  expect(manifest.license).toBe('CC0-1.0');
  let models = 0;
  for (const pack of manifest.packs) {
    expect(pack.source).toMatch(/^https:\/\/kenney.nl\/assets\/city-kit-/);
    const license = readFileSync(
      new URL(
        `${pack.name.endsWith('Suburban') ? 'suburban' : 'commercial'}/License.txt`,
        root,
      ),
      'utf8',
    );
    expect(license).toContain('Creative Commons Zero, CC0');
    for (const file of pack.files) {
      const bytes = readFileSync(new URL(file.path, root));
      expect(bytes.length).toBe(file.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        file.sha256,
      );
      if (!file.path.endsWith('.glb')) continue;
      models++;
      expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
      const json = JSON.parse(
        bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
      );
      for (const item of [...(json.images ?? []), ...(json.buffers ?? [])]) {
        if (!item.uri) continue;
        expect(item.uri).toBe('Textures/colormap.png');
        expect(
          readFileSync(new URL(item.uri, new URL(file.path, root))).length,
        ).toBeGreaterThan(0);
      }
    }
  }
  expect(models).toBe(CITY_ASSETS.length);
});

it('aggregates repeated models and adds grounded foundations on relief', async () => {
  const input = city();
  input.buildings = Array.from({ length: 6 }, (_, i) => ({
    ...input.buildings[0]!,
    id: `building-${i}`,
  }));
  input.terrainGrid = {
    source: 'test',
    xCoordinates: [0, 100],
    yCoordinates: [0, 100],
    elevationsInMeters: [
      [0, 10],
      [0, 10],
    ],
  };
  const asset = template();
  const layer = await buildCityAssetLayer(input, templatesFor(asset.group));
  const foundation = layer.group.getObjectByName(
    'kenney-foundations',
  ) as THREE.InstancedMesh;
  expect(foundation.count).toBe(6);
  const batches = layer.group.children.filter(
    (node) =>
      node instanceof THREE.InstancedMesh && node.name.includes(':lod0:'),
  );
  expect(batches).toHaveLength(3);
  expect(batches.every((batch) => batch.count === 2)).toBe(true);
  const matrix = new THREE.Matrix4();
  foundation.getMatrixAt(0, matrix);
  const bounds = new THREE.Box3()
    .setFromBufferAttribute(
      foundation.geometry.getAttribute('position') as THREE.BufferAttribute,
    )
    .applyMatrix4(matrix);
  expect(bounds.max.y).toBeCloseTo(1.4);
  expect(bounds.min.y).toBeLessThan(0.1);
  layer.dispose();
});

it('parses the real GLB geometry with local texture loading delegated to a Node fixture', async () => {
  vi.stubGlobal('self', globalThis);
  const manager = new THREE.LoadingManager();
  const requested: string[] = [];
  class LocalTextureFixture extends THREE.Loader {
    load(url: string, onLoad?: (texture: THREE.Texture) => void) {
      requested.push(url);
      const texture = new THREE.Texture();
      queueMicrotask(() => onLoad?.(texture));
      return texture;
    }
  }
  manager.addHandler(/colormap\.png$/, new LocalTextureFixture(manager));
  for (const key of CITY_ASSETS) {
    const bytes = readFileSync(
      new URL(`../../public/models/kenney-city/${key}`, import.meta.url),
    );
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const gltf = await new GLTFLoader(manager).parseAsync(
      buffer,
      '/models/kenney-city/' + key.split('/')[0] + '/',
    );
    const input = city();
    const layer = await buildCityAssetLayer(input, templatesFor(gltf.scene));
    expect(new THREE.Box3().setFromObject(layer.group).isEmpty()).toBe(false);
    layer.dispose();
  }
  expect(requested).toHaveLength(6);
  expect(
    requested.every((url) =>
      /^\/models\/kenney-city\/(suburban|commercial)\/Textures\/colormap\.png$/.test(
        url,
      ),
    ),
  ).toBe(true);
});

it('does not mount or announce stale assets after the scene is replaced', async () => {
  const scene = new THREE.Scene(),
    fallback = new THREE.Group();
  const group = new THREE.Group(),
    dispose = vi.fn();
  let finish!: (layer: {
    group: THREE.Group;
    dispose(): void;
    setBuildingCollapse(): void;
  }) => void;
  const states: string[] = [];
  const release = mountCityAssets(
    city(),
    scene,
    fallback,
    (state) => states.push(state),
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  release();
  finish({ group, dispose, setBuildingCollapse: () => {} });
  await Promise.resolve();
  await Promise.resolve();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(group.parent).toBeNull();
  expect(fallback.visible).toBe(true);
  expect(states).toEqual(['loading']);
});

it('shows assets only when ready and releases them once before scene traversal', async () => {
  const scene = new THREE.Scene(),
    fallback = new THREE.Group();
  const group = new THREE.Group(),
    dispose = vi.fn();
  const states: string[] = [];
  const release = mountCityAssets(
    city(),
    scene,
    fallback,
    (s) => states.push(s),
    async () => ({ group, dispose, setBuildingCollapse: () => {} }),
  );
  await Promise.resolve();
  expect(group.parent).toBe(scene);
  expect(fallback.visible).toBe(false);
  expect(states).toEqual(['loading', 'ready']);
  release();
  release();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(group.parent).toBeNull();
});

it('retains the procedural fallback when local asset loading rejects', async () => {
  const scene = new THREE.Scene(),
    fallback = new THREE.Group();
  const states: string[] = [];
  const release = mountCityAssets(
    city(),
    scene,
    fallback,
    (s) => states.push(s),
    async () => {
      throw new Error('asset unavailable');
    },
  );
  await Promise.resolve();
  await Promise.resolve();
  expect(fallback.visible).toBe(true);
  expect(scene.children.length).toBe(0);
  expect(states).toEqual(['loading', 'fallback']);
  release();
});
