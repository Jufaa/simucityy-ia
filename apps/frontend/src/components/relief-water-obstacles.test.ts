import { expect, it } from 'vitest';
import * as THREE from 'three';
import { FloodEngine, createDemoCompatibleScenario } from '@simulicity/hazards';
import { createFloodLayer } from './flood-layer';

it('runs flat water under building footprints without changing the legacy path', () => {
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
  let insideFootprint = 0;
  for (let i = 0; i < mesh.geometry.drawRange.count; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3,
      z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    if (x > 7 && x < 19 && z > 8 && z < 20) insideFootprint++;
  }
  // La lámina pasa bajo el edificio: la huella está cubierta y el edificio
  // emerge del agua (antes quedaba un anillo seco alrededor).
  expect(insideFootprint).toBeGreaterThan(0);
  const legacy = createFloodLayer(city, engine.getCells());
  legacy.update(engine.getSnapshot());
  expect(legacy.group.getObjectByName('flood-surface')).toBeUndefined();
  expect(
    (legacy.group.getObjectByName('flood-water') as THREE.InstancedMesh).count,
  ).toBe(16);
  layer.dispose();
  legacy.dispose();
});
