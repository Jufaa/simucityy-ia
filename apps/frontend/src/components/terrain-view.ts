import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TerrainGrid } from '@simulicity/hazards';
import type { Building, CityResponse } from './city-types';

type TerrainView = {
  terrain: { elevationInMeters: number };
  terrainGrid?: TerrainGrid;
  organic?: CityResponse['organic'];
  real?: CityResponse['real'];
};

/** Local view model only: never serialize this derived grid as the original scenario. */
export function createReliefCity(city: CityResponse): CityResponse {
  if (!city.terrainGrid) return city;
  const axis = (length: number) =>
    Array.from({ length: Math.ceil(length / 10) + 1 }, (_, i) =>
      Math.min(i * 10, length),
    );
  const xCoordinates = axis(city.config.widthInMeters);
  const yCoordinates = axis(city.config.heightInMeters);
  return {
    ...city,
    terrainProfile: 'basin',
    terrainGrid: {
      source: 'local-demo-relief',
      xCoordinates,
      yCoordinates,
      elevationsInMeters: yCoordinates.map((y) =>
        xCoordinates.map((x) => {
          const dx = (2 * x) / city.config.widthInMeters - 1;
          const dy = (2 * y) / city.config.heightInMeters - 1;
          return (
            city.terrain.elevationInMeters + 3 * (dx * dx + dy * dy) + 0.4 * dx
          );
        }),
      ),
    },
  };
}

/** Piecewise-linear interpolation uses exactly the terrain mesh's triangle diagonal. */
export function sampleTerrainHeight(
  city: TerrainView,
  x: number,
  z: number,
): number {
  const grid = city.terrainGrid;
  if (!grid) return city.terrain.elevationInMeters;
  const locate = (axis: readonly number[], value: number) => {
    const v = THREE.MathUtils.clamp(value, axis[0]!, axis.at(-1)!);
    let i = 0;
    while (i < axis.length - 2 && axis[i + 1]! < v) i++;
    return { i, t: (v - axis[i]!) / (axis[i + 1]! - axis[i]!) };
  };
  const { i: c, t: u } = locate(grid.xCoordinates, x);
  const { i: r, t: v } = locate(grid.yCoordinates, z);
  const a = grid.elevationsInMeters[r]![c]!;
  const b = grid.elevationsInMeters[r]![c + 1]!;
  const d = grid.elevationsInMeters[r + 1]![c]!;
  const e = grid.elevationsInMeters[r + 1]![c + 1]!;
  return u + v <= 1
    ? a + u * (b - a) + v * (d - a)
    : e + (1 - v) * (b - e) + (1 - u) * (d - e);
}

/**
 * Terrain range under a building: the four corners plus every DEM node of
 * the cells the footprint overlaps. City DEMs (Terrarium/SRTM) carry
 * building-height noise, so corner-only sampling lets interior spikes
 * pierce the ground floor and buildings read as sunken; a level pad must
 * clear the highest interior point and its foundation reach the lowest.
 * View-only sampling: the solver keeps the original grid untouched.
 */
export function buildingGroundRangeInMeters(
  city: TerrainView,
  building: Pick<Building, 'minCorner' | 'maxCorner'>,
): { minInMeters: number; maxInMeters: number } {
  const cornerHeights = [building.minCorner.x, building.maxCorner.x].flatMap(
    (x) =>
      [building.minCorner.y, building.maxCorner.y].map((z) =>
        sampleTerrainHeight(city, x, z),
      ),
  );
  let minInMeters = Math.min(...cornerHeights);
  let maxInMeters = Math.max(...cornerHeights);
  const grid = city.terrainGrid;
  // Interior scan only where the grid is a real DEM (organic relief or
  // imported OSM terrain); synthetic flat/basin contracts keep corners.
  if (!grid || (!city.organic && !city.real))
    return { minInMeters, maxInMeters };
  // Node index ranges of the cells overlapping the footprint (bounded
  // scan, not a full-grid pass per building).
  const axisRange = (
    axis: readonly number[],
    min: number,
    max: number,
  ): [number, number] => {
    let start = 0;
    while (start < axis.length - 1 && axis[start + 1]! <= min) start++;
    let end = axis.length - 1;
    while (end > 0 && axis[end - 1]! >= max) end--;
    return [start, end];
  };
  const [c0, c1] = axisRange(
    grid.xCoordinates,
    building.minCorner.x,
    building.maxCorner.x,
  );
  const [r0, r1] = axisRange(
    grid.yCoordinates,
    building.minCorner.y,
    building.maxCorner.y,
  );
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const elevation = grid.elevationsInMeters[r]![c]!;
      if (elevation < minInMeters) minInMeters = elevation;
      if (elevation > maxInMeters) maxInMeters = elevation;
    }
  return { minInMeters, maxInMeters };
}

export function buildingBaseHeight(
  city: TerrainView,
  building: Pick<Building, 'minCorner' | 'maxCorner'>,
) {
  return buildingGroundRangeInMeters(city, building).maxInMeters;
}

export function createTerrainGeometry(city: CityResponse) {
  const grid = city.terrainGrid!;
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  grid.yCoordinates.forEach((z, r) =>
    grid.xCoordinates.forEach((x, c) => {
      positions.push(x, grid.elevationsInMeters[r]![c]!, z);
      uv.push(x / city.config.widthInMeters, z / city.config.heightInMeters);
      if (
        r < grid.yCoordinates.length - 1 &&
        c < grid.xCoordinates.length - 1
      ) {
        const a = r * grid.xCoordinates.length + c,
          d = a + grid.xCoordinates.length;
        indices.push(a, d, a + 1, a + 1, d, d + 1);
      }
    }),
  );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Shared Scene seam: local basins need sampled ground even when land relief is disabled. */
export function createCityGround(city: CityResponse, material: THREE.Material) {
  const sampled =
    city.terrainGrid &&
    (city.organic || city.real || city.terrainProfile === 'basin');
  const geometry = sampled
    ? createTerrainGeometry(city)
    : new THREE.PlaneGeometry(
        city.config.widthInMeters,
        city.config.heightInMeters,
      );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'city-ground';
  if (!sampled) {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(
      city.config.widthInMeters / 2,
      city.terrain.elevationInMeters,
      city.config.heightInMeters / 2,
    );
  }
  return mesh;
}

/** Drape newly-created surface layers; retain the flat path and shared materials unchanged. */
export function drapeSurfaceLayer<T extends THREE.Object3D>(
  root: T,
  city: TerrainView,
): T {
  const grid = city.terrainGrid;
  if (
    !grid ||
    grid.elevationsInMeters.every((row) =>
      row.every((y) => y === city.terrain.elevationInMeters),
    )
  )
    return root;
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  const retired = new Set<THREE.BufferGeometry>();
  function deform(source: THREE.BufferGeometry, matrix: THREE.Matrix4) {
    let geometry = source.clone();
    if (source instanceof THREE.BoxGeometry) {
      const p = source.parameters;
      const scale = new THREE.Vector3().setFromMatrixScale(matrix);
      geometry.dispose();
      geometry = new THREE.BoxGeometry(
        p.width,
        p.height,
        p.depth,
        Math.max(1, Math.ceil((p.width * scale.x) / 10)),
        1,
        Math.max(1, Math.ceil((p.depth * scale.z) / 10)),
      );
    }
    geometry.applyMatrix4(matrix);
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++)
      positions.setY(
        i,
        positions.getY(i) +
          sampleTerrainHeight(city, positions.getX(i), positions.getZ(i)) -
          city.terrain.elevationInMeters,
      );
    return geometry;
  }
  for (const mesh of meshes) {
    retired.add(mesh.geometry);
    if (mesh instanceof THREE.InstancedMesh && mesh.parent) {
      const inverse = mesh.parent.matrixWorld.clone().invert();
      const geometries: THREE.BufferGeometry[] = [];
      for (let i = 0; i < mesh.count; i++) {
        const instance = new THREE.Matrix4();
        mesh.getMatrixAt(i, instance);
        geometries.push(
          deform(
            mesh.geometry,
            mesh.matrixWorld.clone().multiply(instance),
          ).applyMatrix4(inverse),
        );
      }
      const geometry = mergeGeometries(geometries);
      for (const part of geometries) part.dispose();
      if (!geometry) throw new Error('Cannot merge relief surface geometry.');
      geometry.computeVertexNormals();
      const replacement = new THREE.Mesh(geometry, mesh.material);
      replacement.name = mesh.name;
      replacement.castShadow = mesh.castShadow;
      replacement.receiveShadow = mesh.receiveShadow;
      mesh.parent.add(replacement);
      mesh.parent.remove(mesh);
      mesh.dispose();
    } else {
      mesh.geometry = deform(mesh.geometry, mesh.matrixWorld).applyMatrix4(
        mesh.matrixWorld.clone().invert(),
      );
      mesh.geometry.computeVertexNormals();
    }
  }
  for (const geometry of retired) geometry.dispose();
  return root;
}
