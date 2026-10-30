import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createOrganicCity } from './organic-city-model';
import { createBuildingLayer } from './urban-building-layer';
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

it('grades roads and shorelines continuously instead of multi-metre grid steps', () => {
  for (const relief of [true, false]) {
    const { city } = createOrganicCity(source, 42, { relief });
    const ys = city.terrainGrid!.elevationsInMeters;
    let jump = 0;
    ys.forEach((row, r) =>
      row.forEach((y, c) => {
        if (c) jump = Math.max(jump, Math.abs(y - row[c - 1]!));
        if (r) jump = Math.max(jump, Math.abs(y - ys[r - 1]![c]!));
      }),
    );
    expect(jump).toBeLessThan(4);
  }
});

it('faces road frontages and keeps rotated shapes inside conservative bounds without mutating source', () => {
  const before = JSON.stringify(source);
  const { city } = createOrganicCity(source, 123);
  expect(city.buildings.length).toBeGreaterThan(100);
  for (const b of city.buildings) {
    expect(b.presentation).toBeDefined();
    const {
      widthInMeters: w,
      depthInMeters: d,
      yawInRadians: yaw,
    } = b.presentation!;
    const cx = (b.minCorner.x + b.maxCorner.x) / 2,
      cz = (b.minCorner.y + b.maxCorner.y) / 2;
    for (const x of [-w / 2, w / 2])
      for (const z of [-d / 2, d / 2]) {
        const px = cx + Math.cos(yaw) * x + Math.sin(yaw) * z;
        const pz = cz - Math.sin(yaw) * x + Math.cos(yaw) * z;
        expect(px).toBeGreaterThanOrEqual(b.minCorner.x - 1e-8);
        expect(px).toBeLessThanOrEqual(b.maxCorner.x + 1e-8);
        expect(pz).toBeGreaterThanOrEqual(b.minCorner.y - 1e-8);
        expect(pz).toBeLessThanOrEqual(b.maxCorner.y + 1e-8);
      }
    const projections = city.roads
      .map((r) => {
        const dx = r.end.x - r.start.x,
          dz = r.end.y - r.start.y;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((cx - r.start.x) * dx + (cz - r.start.y) * dz) /
              (dx * dx + dz * dz),
          ),
        );
        return { x: r.start.x + t * dx - cx, z: r.start.y + t * dz - cz };
      })
      .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    const target = projections[0]!;
    const side = b.architecture!.entranceSide === 'north' ? 1 : -1;
    expect(
      side * (Math.sin(yaw) * target.x + Math.cos(yaw) * target.z),
    ).toBeGreaterThan(0);
  }
  expect(JSON.stringify(source)).toBe(before);
});

it('grounds organic fallback buildings with aligned foundations and adds a clear park fountain', () => {
  const { city } = createOrganicCity(source, 42);
  const layer = createBuildingLayer(city);
  const b = city.buildings[0]!;
  const root = layer.getObjectByName(b.id)!;
  expect(root.rotation.y).toBeCloseTo(b.presentation?.yawInRadians ?? 0);
  const foundations = layer.getObjectByName('building-foundations')!;
  const foundationIds: string[] = [];
  foundations.traverse((object) => {
    if (object instanceof THREE.InstancedMesh)
      foundationIds.push(...(object.userData.buildingIds as string[]));
  });
  expect(foundationIds).toContain(b.id);
  expect(
    city.district!.urban!.amenities.some((a) => a.kind === 'fountain'),
  ).toBe(true);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  layer.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        materials.add(m);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
});
