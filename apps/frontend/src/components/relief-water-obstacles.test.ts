import { expect, it } from 'vitest';
import * as THREE from 'three';
import { FloodEngine, createDemoCompatibleScenario } from '@simulicity/hazards';
import { createFloodLayer } from './flood-layer';

it('masks partial building footprints in flat water without changing the legacy path', () => {
  const base = createDemoCompatibleScenario(100, 100, 25);
  const building = {
    id: 'partial',
    minCorner: { x: 7, y: 8 },
    maxCorner: { x: 19, y: 20 },
    heightInMeters: 8,
  };
  const city = { ...base, buildings: [building] };
  const engine = new FloodEngine(city, { syntheticRelief: 'none' });
  for (let i = 0; i < 10; i++) engine.step();
  const layer = createFloodLayer(city, engine.getCells(), true);
  layer.update(engine.getSnapshot());
  const mesh = layer.group.getObjectByName('flood-surface') as THREE.Mesh;
  expect(mesh.visible).toBe(true);
  const p = mesh.geometry.getAttribute('position');
  for (let i = 0; i < mesh.geometry.drawRange.count; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3,
      z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    expect(x > 7 + 1e-6 && x < 19 - 1e-6 && z > 8 + 1e-6 && z < 20 - 1e-6).toBe(
      false,
    );
  }
  const legacy = createFloodLayer(city, engine.getCells());
  legacy.update(engine.getSnapshot());
  expect(legacy.group.getObjectByName('flood-surface')).toBeUndefined();
  expect(
    (legacy.group.getObjectByName('flood-water') as THREE.InstancedMesh).count,
  ).toBe(16);
  layer.dispose();
  legacy.dispose();
});
