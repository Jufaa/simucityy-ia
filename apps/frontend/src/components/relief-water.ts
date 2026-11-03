import * as THREE from 'three';
import type {
  CellBounds,
  CityScenarioInput,
  FloodSnapshot,
} from '@simulicity/hazards';
import { sampleTerrainHeight } from './terrain-view';

/**
 * Render-only reconstruction: incident wet cells contribute their absolute solver
 * surfaces to one level per terrain vertex. This is not hydraulic state or volume
 * conservation; snapshots remain authoritative. Dry cells never emit triangles.
 * At wet/dry borders terrain clipping wins over extending a continuous sheet.
 */
export function reconstructWaterLevels(
  city: CityScenarioInput,
  cells: readonly CellBounds[],
  snapshot: FloodSnapshot,
) {
  const columns = city.terrainGrid.xCoordinates.length;
  const levels = new Float64Array(
    columns * city.terrainGrid.yCoordinates.length,
  );
  const counts = new Uint32Array(levels.length);
  cells.forEach((cell, index) => {
    const depth = snapshot.waterDepthInMeters[index] ?? 0;
    if (!(depth > 0)) return;
    const level = cell.groundElevationInMeters + depth;
    const corner = cell.row * columns + cell.column;
    for (const vertex of [
      corner,
      corner + 1,
      corner + columns,
      corner + columns + 1,
    ]) {
      levels[vertex] = levels[vertex]! + level;
      counts[vertex] = counts[vertex]! + 1;
    }
  });
  for (let vertex = 0; vertex < levels.length; vertex++) {
    if (counts[vertex]) levels[vertex] = levels[vertex]! / counts[vertex]!;
  }
  return levels;
}

/**
 * Clip a continuous display sheet against the visible terrain only. The
 * sheet runs underneath buildings on purpose: clipping it to each (often
 * rotated) footprint left a dry ring around every building and the water
 * never touched the walls. Buildings are opaque, so the submerged part of
 * the sheet is hidden by the building itself and the waterline reads on
 * the facade; collapsed buildings get covered the same way.
 */
export function createReliefWater(
  city: CityScenarioInput,
  cells: readonly CellBounds[],
  material: THREE.Material,
) {
  // Each cell emits two terrain-clipped triangles; a clipped triangle fans
  // into at most 6 vertices. Fixed attributes avoid orphaned GPU buffers.
  const capacity = cells.length * 18;
  const positions = new Float32Array(capacity * 3);
  const uv = new Float32Array(capacity * 2);
  const normals = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 4);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute(
    'uv',
    new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute(
    'normal',
    new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(colors, 4).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'flood-surface';
  mesh.frustumCulled = false;
  mesh.visible = false;
  return {
    mesh,
    update(snapshot: FloodSnapshot) {
      let vertices = 0;
      const levels = reconstructWaterLevels(city, cells, snapshot);
      const columns = city.terrainGrid.xCoordinates.length;
      function triangle(points: THREE.Vector3[], surfaces: number[]) {
        const clipped: THREE.Vector3[] = [];
        for (let i = 0; i < 3; i++) {
          const a = points[i]!,
            b = points[(i + 1) % 3]!;
          const surfaceA = new THREE.Vector3(a.x, surfaces[i]!, a.z);
          const surfaceB = new THREE.Vector3(b.x, surfaces[(i + 1) % 3]!, b.z);
          const clearanceA = surfaceA.y - a.y;
          const clearanceB = surfaceB.y - b.y;
          if (clearanceA >= 0) clipped.push(surfaceA);
          if (
            (clearanceA < 0 && clearanceB > 0) ||
            (clearanceA > 0 && clearanceB < 0)
          )
            clipped.push(
              surfaceA
                .clone()
                .lerp(surfaceB, clearanceA / (clearanceA - clearanceB)),
            );
        }
        const polygons = clipped.length >= 3 ? [clipped] : [];
        for (const polygon of polygons)
          for (let i = 1; i < polygon.length - 1; i++) {
            const a = polygon[0]!,
              b = polygon[i]!,
              c = polygon[i + 1]!;
            const area = new THREE.Vector3()
              .subVectors(b, a)
              .cross(new THREE.Vector3().subVectors(c, a));
            if (area.lengthSq() < 1e-20) continue;
            // Flat up normals: per-triangle faceted normals made the sheet
            // read as shards. The material's animated normal map supplies
            // the surface detail instead; solver depths are untouched.
            const normal = new THREE.Vector3(0, 1, 0);
            if (vertices + 3 > capacity)
              throw new RangeError(
                'Flood surface geometry exceeds its clipping budget.',
              );
            for (const point of [a, b, c]) {
              positions.set([point.x, point.y, point.z], vertices * 3);
              normals.set([normal.x, normal.y, normal.z], vertices * 3);
              uv.set([point.x / 10, point.z / 10], vertices * 2);
              const displayDepth = Math.max(
                0,
                point.y - sampleTerrainHeight(city, point.x, point.z),
              );
              // Depth-graded alpha: a shallow film stays a faint sheen
              // and only deeper water reads as a solid sheet. The old
              // curve saturated at 25 cm, carpeting streets opaque blue.
              colors.set(
                [
                  1,
                  1,
                  1,
                  Math.min(0.58, 0.08 + 0.5 * Math.min(1, displayDepth / 0.6)),
                ],
                vertices * 4,
              );
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
        const corner = r * columns + c;
        const la = levels[corner]!,
          lb = levels[corner + 1]!;
        const ld = levels[corner + columns]!,
          le = levels[corner + columns + 1]!;
        triangle([a, d, b], [la, ld, lb]);
        triangle([b, d, e], [lb, ld, le]);
      });
      geometry.setDrawRange(0, vertices);
      geometry.getAttribute('position').needsUpdate = true;
      geometry.getAttribute('uv').needsUpdate = true;
      geometry.getAttribute('normal').needsUpdate = true;
      geometry.getAttribute('color').needsUpdate = true;
      mesh.visible = vertices > 0;
    },
  };
}
