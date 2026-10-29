import * as THREE from 'three';
import type {
  CellBounds,
  CityScenarioInput,
  FloodSnapshot,
} from '@simulicity/hazards';

/** Clip each cell's constant solver surface against the same triangles as the visible terrain. */
export function createReliefWater(
  city: CityScenarioInput,
  cells: readonly CellBounds[],
  material: THREE.Material,
) {
  const positions = new Float32Array(cells.length * 36);
  const uv = new Float32Array(cells.length * 24);
  const normals = new Float32Array(cells.length * 36);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute(
    'uv',
    new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'flood-surface';
  mesh.frustumCulled = false;
  mesh.visible = false;
  return {
    mesh,
    update(snapshot: FloodSnapshot) {
      let vertices = 0;
      function triangle(points: THREE.Vector3[], level: number) {
        const clipped: THREE.Vector3[] = [];
        for (let i = 0; i < 3; i++) {
          const a = points[i]!,
            b = points[(i + 1) % 3]!;
          if (a.y <= level) clipped.push(a);
          if ((a.y < level && b.y > level) || (a.y > level && b.y < level))
            clipped.push(a.clone().lerp(b, (level - a.y) / (b.y - a.y)));
        }
        for (let i = 1; i < clipped.length - 1; i++) {
          for (const point of [clipped[0]!, clipped[i]!, clipped[i + 1]!]) {
            positions.set([point.x, level, point.z], vertices * 3);
            uv.set([point.x / 10, point.z / 10], vertices * 2);
            vertices++;
          }
        }
      }
      cells.forEach((cell, index) => {
        const depth = snapshot.waterDepthInMeters[index] ?? 0;
        if (depth <= 0) return;
        const grid = city.terrainGrid.elevationsInMeters,
          r = cell.row,
          c = cell.column;
        const a = new THREE.Vector3(cell.minX, grid[r]![c]!, cell.minY);
        const b = new THREE.Vector3(cell.maxX, grid[r]![c + 1]!, cell.minY);
        const d = new THREE.Vector3(cell.minX, grid[r + 1]![c]!, cell.maxY);
        const e = new THREE.Vector3(cell.maxX, grid[r + 1]![c + 1]!, cell.maxY);
        const level = cell.groundElevationInMeters + depth;
        triangle([a, d, b], level);
        triangle([b, d, e], level);
      });
      geometry.setDrawRange(0, vertices);
      geometry.getAttribute('position').needsUpdate = true;
      geometry.getAttribute('uv').needsUpdate = true;
      mesh.visible = vertices > 0;
    },
  };
}
