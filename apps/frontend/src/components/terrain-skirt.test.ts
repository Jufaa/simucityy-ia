import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createTerrainSkirt } from './terrain-view';

it('walls the terrain edges down to the base elevation', () => {
  const city = {
    terrain: { elevationInMeters: 10 },
    terrainGrid: {
      source: 'test' as const,
      xCoordinates: [0, 50, 100],
      yCoordinates: [0, 50, 100],
      elevationsInMeters: [
        [10, 14, 10],
        [18, 22, 18],
        [10, 14, 10],
      ],
    },
  };
  const skirt = createTerrainSkirt(city, 6.95, new THREE.MeshBasicMaterial())!;
  expect(skirt).not.toBeNull();
  const positions = skirt.geometry.getAttribute('position');
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < positions.count; i++) {
    minY = Math.min(minY, positions.getY(i));
    maxY = Math.max(maxY, positions.getY(i));
  }
  // Bottom vertices all on the base; top vertices follow the terrain edge.
  expect(minY).toBeCloseTo(6.95);
  expect(maxY).toBe(18);
  expect(positions.count).toBe(16);
  skirt.geometry.dispose();
});

it('returns null without a terrain grid', () => {
  expect(
    createTerrainSkirt(
      { terrain: { elevationInMeters: 3 } },
      0,
      new THREE.MeshBasicMaterial(),
    ),
  ).toBeNull();
});
