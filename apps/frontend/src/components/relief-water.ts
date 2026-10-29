import * as THREE from 'three';
import type {
  Building,
  CellBounds,
  CityScenarioInput,
  FloodSnapshot,
} from '@simulicity/hazards';
import { sampleTerrainHeight } from './terrain-view';

function halfPlane(
  polygon: THREE.Vector3[],
  axis: 'x' | 'z',
  value: number,
  greater: boolean,
) {
  const output: THREE.Vector3[] = [];
  const inside = (p: THREE.Vector3) =>
    greater ? p[axis] >= value : p[axis] <= value;
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!;
    if (inside(a)) output.push(a);
    if (inside(a) !== inside(b))
      output.push(a.clone().lerp(b, (value - a[axis]) / (b[axis] - a[axis])));
  });
  return output;
}

/** Subtract a rectangle into disjoint outside strips, retaining wall boundaries. */
function outsideBuilding(polygon: THREE.Vector3[], building: Building) {
  let remaining = polygon;
  const pieces: THREE.Vector3[][] = [];
  const boundaries: ['x' | 'z', number, boolean][] = [
    ['x', building.minCorner.x, true],
    ['x', building.maxCorner.x, false],
    ['z', building.minCorner.y, true],
    ['z', building.maxCorner.y, false],
  ];
  for (const [axis, value, greater] of boundaries) {
    const outside = halfPlane(remaining, axis, value, !greater);
    if (outside.length >= 3) pieces.push(outside);
    remaining = halfPlane(remaining, axis, value, greater);
    if (!remaining.length) break;
  }
  return pieces;
}

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

/** Clip a continuous display sheet against the visible terrain and building masks. */
export function createReliefWater(
  city: CityScenarioInput,
  cells: readonly CellBounds[],
  material: THREE.Material,
  excludedBuildings: readonly Building[] = [],
) {
  const masks = cells.map((cell) =>
    excludedBuildings.filter(
      (building) =>
        building.minCorner.x < cell.maxX &&
        building.maxCorner.x > cell.minX &&
        building.minCorner.y < cell.maxY &&
        building.maxCorner.y > cell.minY,
    ),
  );
  // The 2n x/z rectangle boundaries partition a cell into at most (2n+1)^2
  // tiles. A tile intersected with either clipped terrain triangle has at most
  // seven vertices (five fan triangles). This bounds all disjoint mask pieces,
  // including overlapping footprints; fixed attributes avoid orphaned GPU buffers.
  const capacity = masks.reduce(
    (sum, buildings) => sum + 30 * (2 * buildings.length + 1) ** 2,
    0,
  );
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
      function triangle(
        points: THREE.Vector3[],
        surfaces: number[],
        footprints: readonly Building[],
      ) {
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
        let polygons = clipped.length >= 3 ? [clipped] : [];
        for (const building of footprints)
          polygons = polygons.flatMap((polygon) =>
            outsideBuilding(polygon, building),
          );
        for (const polygon of polygons)
          for (let i = 1; i < polygon.length - 1; i++) {
            const a = polygon[0]!,
              b = polygon[i]!,
              c = polygon[i + 1]!;
            const normal = new THREE.Vector3()
              .subVectors(b, a)
              .cross(new THREE.Vector3().subVectors(c, a));
            if (normal.lengthSq() < 1e-20) continue;
            normal.normalize();
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
              colors.set(
                [1, 1, 1, Math.max(0.04, Math.min(1, displayDepth / 0.25))],
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
        triangle([a, d, b], [la, ld, lb], masks[index]!);
        triangle([b, d, e], [lb, ld, le], masks[index]!);
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
