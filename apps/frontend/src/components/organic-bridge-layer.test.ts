import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createOrganicCity } from './organic-city-model';
import { createOrganicCityLayer } from './organic-city-layer';
import { organicFloodEnvironment } from './organic-flood-environment';
import { bridgeAtPoint, sampleRoadSurfaceHeight } from './road-surface';
import type { CityResponse } from './city-types';

const source: CityResponse = {
  config: {
    widthInMeters: 500,
    heightInMeters: 500,
    streetSpacingInMeters: 50,
  },
  terrain: { kind: 'flat', elevationInMeters: 25 },
  roads: [],
  blocks: [],
  buildings: [],
};

const fixtures = [
  { mode: 'district', relief: false, size: 500 },
  { mode: 'district', relief: true, size: 500 },
  { mode: 'city', relief: false, size: 500 },
  { mode: 'city', relief: true, size: 500 },
  { mode: 'district', relief: true, size: 250 },
  { mode: 'district', relief: false, size: 1000 },
] as const;

it.each(fixtures)(
  'adds bounded side arches without blocking the $mode/$relief/$size bridge corridor',
  ({ mode, relief, size }) => {
    const { city, geography } = createOrganicCity(
      {
        ...source,
        config: {
          ...source.config,
          widthInMeters: size,
          heightInMeters: size,
        },
      },
      123,
      { mode, relief },
    );
    const before = JSON.stringify(city);
    const environment = organicFloodEnvironment(city);
    const layer = createOrganicCityLayer(city);
    const bridge = geography.bridges[0]!;
    const root = layer.group.getObjectByName(`bridge:${bridge.id}`)!;
    const length = Math.hypot(
      bridge.end.x - bridge.start.x,
      bridge.end.y - bridge.start.y,
    );
    expect(
      root.children.filter((o) => o.name === 'bridge-side-arch'),
    ).toHaveLength(2);
    const hangers = root.getObjectByName(
      'bridge-arch-hangers',
    ) as THREE.InstancedMesh;
    const lights = root.getObjectByName(
      'bridge-landmark-lights',
    ) as THREE.InstancedMesh;
    expect(hangers.count).toBeGreaterThanOrEqual(12);
    expect(hangers.count).toBeLessThanOrEqual(48);
    expect(lights.count).toBeGreaterThanOrEqual(6);
    expect(lights.count).toBeLessThanOrEqual(24);
    expect(
      (lights.material as THREE.MeshStandardMaterial).emissiveIntensity,
    ).toBeGreaterThan(0);
    const landmark = root.children.filter(
      (o) =>
        o.name.startsWith('bridge-landmark') ||
        o.name === 'bridge-side-arch' ||
        o.name === 'bridge-arch-hangers',
    );
    for (const object of landmark) {
      expect(object).toBeInstanceOf(THREE.Mesh);
      const mesh = object as THREE.Mesh;
      const matrices: THREE.Matrix4[] = [];
      mesh.updateMatrix();
      if (mesh instanceof THREE.InstancedMesh) {
        for (let i = 0; i < mesh.count; i++) {
          const matrix = new THREE.Matrix4();
          mesh.getMatrixAt(i, matrix);
          matrices.push(mesh.matrix.clone().multiply(matrix));
        }
      } else matrices.push(mesh.matrix);
      const vertices = mesh.geometry.getAttribute('position');
      for (const matrix of matrices)
        for (let i = 0; i < vertices.count; i++) {
          const p = new THREE.Vector3()
            .fromBufferAttribute(vertices, i)
            .applyMatrix4(matrix);
          expect(Math.abs(p.x)).toBeLessThanOrEqual(
            bridge.widthInMeters / 2 + 1e-4,
          );
          expect(Math.abs(p.x)).toBeGreaterThanOrEqual(
            bridge.widthInMeters / 2 - 0.55 - 1e-4,
          );
          expect(p.y).toBeGreaterThanOrEqual(0.05);
          expect(p.y).toBeLessThanOrEqual(14.6);
          expect(Math.abs(p.z)).toBeLessThanOrEqual(length / 2);
        }
    }
    root.traverse((object) =>
      expect(object).not.toBeInstanceOf(THREE.PointLight),
    );
    const abutments = root.children.filter((o) => o.name === 'bridge-abutment');
    const embankments = root.children.filter(
      (o) => o.name === 'bridge-embankment',
    );
    expect(abutments).toHaveLength(2);
    expect(embankments).toHaveLength(2);
    root.updateMatrixWorld(true);
    for (const o of abutments)
      expect(new THREE.Box3().setFromObject(o).max.y).toBeLessThanOrEqual(
        bridge.deckElevationInMeters - 0.4,
      );
    for (const o of embankments)
      expect(new THREE.Box3().setFromObject(o).max.y).toBeLessThanOrEqual(
        bridge.deckElevationInMeters + 0.03,
      );
    const deck = root.getObjectByName('bridge-deck')!;
    expect(new THREE.Box3().setFromObject(deck).max.y).toBeCloseTo(
      bridge.deckElevationInMeters,
    );
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const x = bridge.start.x + (bridge.end.x - bridge.start.x) * t;
      const z = bridge.start.y + (bridge.end.y - bridge.start.y) * t;
      expect(bridgeAtPoint(city, x, z)?.id).toBe(bridge.id);
      expect(sampleRoadSurfaceHeight(city, x, z)).toBe(
        bridge.deckElevationInMeters,
      );
    }
    expect(organicFloodEnvironment(city)).toEqual(environment);
    expect(JSON.stringify(city)).toBe(before);
    layer.dispose();
  },
);

it('disposes shared landmark geometry, materials and instance buffers exactly once', () => {
  const { city } = createOrganicCity(source, 42);
  const layer = createOrganicCityLayer(city);
  const resources = new Set<
    THREE.BufferGeometry | THREE.Material | THREE.Texture | THREE.InstancedMesh
  >();
  layer.group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry);
    if (object instanceof THREE.InstancedMesh) resources.add(object);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      resources.add(material);
      const normal = (material as THREE.MeshStandardMaterial).normalMap;
      if (normal) resources.add(normal);
    }
  });
  expect(
    [...resources].filter((r) => r instanceof THREE.InstancedMesh).length,
  ).toBeGreaterThanOrEqual(2);
  const disposed = new Map<object, number>();
  for (const resource of resources) {
    const record = () =>
      disposed.set(resource, (disposed.get(resource) ?? 0) + 1);
    if (resource instanceof THREE.BufferGeometry)
      resource.addEventListener('dispose', record);
    else if (resource instanceof THREE.Material)
      resource.addEventListener('dispose', record);
    else if (resource instanceof THREE.Texture)
      resource.addEventListener('dispose', record);
    else resource.addEventListener('dispose', record);
  }
  layer.dispose();
  layer.dispose();
  expect(layer.group.children).toHaveLength(0);
  for (const resource of resources) expect(disposed.get(resource)).toBe(1);
});
