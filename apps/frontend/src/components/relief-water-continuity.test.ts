import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createDemoCompatibleScenario, FloodEngine } from '@simulicity/hazards';
import { createReliefWater, reconstructWaterLevels } from './relief-water';

function fixture(grid: number[][], depths: number[]) {
  const base = createDemoCompatibleScenario(
    grid[0]!.length - 1,
    grid.length - 1,
    1,
  );
  const city = {
    ...base,
    terrainGrid: { ...base.terrainGrid, elevationsInMeters: grid },
    buildings: [],
  };
  const engine = new FloodEngine(city, { syntheticRelief: 'none' });
  const cells = engine.getCells();
  const snapshot = {
    ...engine.getSnapshot(),
    waterDepthInMeters: new Float32Array(depths),
  };
  const layer = createReliefWater(city, cells, new THREE.MeshBasicMaterial());
  return { city, cells, snapshot, layer };
}

it('joins adjacent thin slope cells at one reconstructed shared edge, not two terraces', () => {
  const { city, cells, snapshot, layer } = fixture(
    [
      [0, 1, 2],
      [0, 1, 2],
    ],
    [0.01, 0.01],
  );
  const before = structuredClone({ city, snapshot });
  layer.update(snapshot);
  const points = layer.mesh.geometry.getAttribute('position');
  let area = 0;
  for (let i = 0; i < layer.mesh.geometry.drawRange.count; i += 3) {
    area +=
      Math.abs(
        (points.getX(i + 1) - points.getX(i)) *
          (points.getZ(i + 2) - points.getZ(i)) -
          (points.getZ(i + 1) - points.getZ(i)) *
            (points.getX(i + 2) - points.getX(i)),
      ) / 2;
  }
  expect(area).toBeCloseTo(1.02, 5);
  const shared = [];
  let left = false,
    right = false;
  for (let i = 0; i < layer.mesh.geometry.drawRange.count; i++) {
    const x = points.getX(i),
      y = points.getY(i);
    if (Math.abs(x - 1) < 1e-6) shared.push(y);
    left ||= x < 1;
    right ||= x > 1;
    expect(y + 1e-6).toBeGreaterThanOrEqual(x);
  }
  expect(left && right).toBe(true);
  expect(shared.length).toBeGreaterThanOrEqual(4);
  for (const height of shared) expect(height).toBeCloseTo(1.01);
  const levels = reconstructWaterLevels(city, cells, snapshot);
  expect(levels[1]).toBeCloseTo(1.01);
  expect(levels[4]).toBeCloseTo(1.01);
  expect({ city, snapshot }).toEqual(before);
  layer.mesh.geometry.dispose();
});

it('shares diagonal-slope corners, retains upward normals and clears dry cells on reset', () => {
  const { city, cells, snapshot, layer } = fixture(
    [
      [0, 1, 2],
      [1, 2, 3],
      [2, 3, 4],
    ],
    [0.1, 0.1, 0.1, 0.1],
  );
  const levels = reconstructWaterLevels(city, cells, snapshot);
  expect(levels[4]).toBeCloseTo(2.1);
  layer.update(snapshot);
  const geometry = layer.mesh.geometry;
  const points = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  let centerCount = 0;
  for (let i = 0; i < geometry.drawRange.count; i++) {
    const x = points.getX(i),
      z = points.getZ(i),
      y = points.getY(i);
    expect(y + 1e-6).toBeGreaterThanOrEqual(x + z);
    expect(normals.getY(i)).toBeGreaterThan(0);
    expect(Number.isFinite(normals.getX(i))).toBe(true);
    if (Math.abs(x - 1) < 1e-6 && Math.abs(z - 1) < 1e-6) {
      expect(y).toBeCloseTo(2.1);
      centerCount++;
    }
  }
  expect(centerCount).toBeGreaterThanOrEqual(4);
  layer.update({
    ...snapshot,
    waterDepthInMeters: new Float32Array([0.1, 0, 0, 0]),
  });
  for (let i = 0; i < geometry.drawRange.count; i++) {
    expect(points.getX(i)).toBeLessThanOrEqual(1);
    expect(points.getZ(i)).toBeLessThanOrEqual(1);
  }
  layer.update({ ...snapshot, waterDepthInMeters: new Float32Array(4) });
  expect(geometry.drawRange.count).toBe(0);
  expect(layer.mesh.visible).toBe(false);
  geometry.dispose();
});

it('averages absolute surfaces rather than depths and excludes dry neighbors', () => {
  const { city, cells, snapshot, layer } = fixture(
    [
      [0, 1, 2],
      [0, 1, 2],
    ],
    [1.5, 0.5],
  );
  expect(Array.from(reconstructWaterLevels(city, cells, snapshot))).toEqual([
    2, 2, 2, 2, 2, 2,
  ]);
  const dry = { ...snapshot, waterDepthInMeters: new Float32Array([1.5, 0]) };
  expect(Array.from(reconstructWaterLevels(city, cells, dry))).toEqual([
    2, 2, 0, 2, 2, 0,
  ]);
  layer.mesh.geometry.dispose();
});

it('keeps crossed overlapping building masks clear with fixed reusable attributes', () => {
  const {
    city,
    cells,
    snapshot,
    layer: unused,
  } = fixture(
    [
      [0, 0],
      [0, 0],
    ],
    [1],
  );
  unused.mesh.geometry.dispose();
  const buildings = Array.from({ length: 12 }, (_, i) => {
    const offset = 0.1 + Math.floor(i / 2) * 0.13;
    return {
      id: `strip-${i}`,
      minCorner: { x: i % 2 ? 0 : offset, y: i % 2 ? offset : 0 },
      maxCorner: { x: i % 2 ? 1 : offset + 0.04, y: i % 2 ? offset + 0.04 : 1 },
      heightInMeters: 3,
    };
  });
  const layer = createReliefWater(
    city,
    cells,
    new THREE.MeshBasicMaterial(),
    buildings,
  );
  const geometry = layer.mesh.geometry;
  const points = geometry.getAttribute('position');
  layer.update(snapshot);
  expect(geometry.drawRange.count).toBeGreaterThan(0);
  expect(geometry.drawRange.count).toBeLessThanOrEqual(points.count);
  for (let i = 0; i < geometry.drawRange.count; i += 3) {
    const x = (points.getX(i) + points.getX(i + 1) + points.getX(i + 2)) / 3;
    const z = (points.getZ(i) + points.getZ(i + 1) + points.getZ(i + 2)) / 3;
    for (const building of buildings) {
      expect(
        x > building.minCorner.x + 1e-6 &&
          x < building.maxCorner.x - 1e-6 &&
          z > building.minCorner.y + 1e-6 &&
          z < building.maxCorner.y - 1e-6,
      ).toBe(false);
    }
  }
  layer.update(snapshot);
  expect(geometry.getAttribute('position')).toBe(points);
  geometry.dispose();
});

it('shows shallow film more transparently than deeper reconstructed water', () => {
  const shallow = fixture(
    [
      [0, 0],
      [0, 0],
    ],
    [0.01],
  );
  const deep = fixture(
    [
      [0, 0],
      [0, 0],
    ],
    [0.3],
  );
  shallow.layer.update(shallow.snapshot);
  deep.layer.update(deep.snapshot);
  const a = shallow.layer.mesh.geometry.getAttribute('color');
  const b = deep.layer.mesh.geometry.getAttribute('color');
  expect(a).toBeDefined();
  expect(a.itemSize).toBe(4);
  for (let i = 0; i < shallow.layer.mesh.geometry.drawRange.count; i++) {
    expect(a.getW(i)).toBeGreaterThanOrEqual(0);
    expect(a.getW(i)).toBeLessThan(b.getW(i));
    expect(b.getW(i)).toBeLessThanOrEqual(1);
  }
  shallow.layer.mesh.geometry.dispose();
  deep.layer.mesh.geometry.dispose();
});
