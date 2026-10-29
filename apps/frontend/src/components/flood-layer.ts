import * as THREE from 'three';
import type {
  CellBounds,
  CityScenarioInput,
  FloodSnapshot,
} from '@simulicity/hazards';
import { createReliefWater } from './relief-water';
import { buildingBaseHeight, drapeSurfaceLayer } from './terrain-view';

/** Tileable normals create moving highlights without displacing the water surface. */
function createWaterNormals() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const normal = new THREE.Vector3();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      normal
        .set(0.35 * Math.cos(u * 3 + v * 2), 0.3 * Math.sin(v * 4 - u), 1)
        .normalize();
      const offset = (y * size + x) * 4;
      data[offset] = (normal.x * 0.5 + 0.5) * 255;
      data[offset + 1] = (normal.y * 0.5 + 0.5) * 255;
      data[offset + 2] = (normal.z * 0.5 + 0.5) * 255;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.repeat.set(3, 3);
  texture.needsUpdate = true;
  return texture;
}

/** Overlay only: never changes original city meshes or their shared materials. */
export function createFloodLayer(
  city: CityScenarioInput,
  cells: readonly CellBounds[],
) {
  const group = new THREE.Group();
  group.name = 'flood-overlay';
  const normals = createWaterNormals();
  const water = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0x087dad,
      transparent: true,
      opacity: 0.88,
      roughness: 0.18,
      metalness: 0.12,
      normalMap: normals,
      normalScale: new THREE.Vector2(0.7, 0.7),
      depthWrite: false,
    }),
    cells.length,
  );
  water.name = 'flood-water';
  water.count = 0;
  water.frustumCulled = false;
  group.add(water);
  const relief = cells.some(
    (cell) =>
      cell.groundElevationInMeters !== cells[0]?.groundElevationInMeters,
  )
    ? createReliefWater(city, cells, water.material)
    : null;
  if (relief) group.add(relief.mesh);
  const nodes = new Map(city.roadGraph.nodes.map((node) => [node.id, node]));
  const roadMaterial = new THREE.MeshBasicMaterial({ color: 0xe53935 });
  const buildingMaterial = new THREE.MeshBasicMaterial({
    color: 0xff8c00,
    wireframe: true,
  });
  const roads = new Map<string, THREE.Mesh>();
  const buildings = new Map<string, THREE.Mesh>();
  for (const edge of city.roadGraph.edges) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to) continue;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        Math.hypot(to.x - from.x, to.y - from.y),
        0.08,
        1.5,
      ),
      roadMaterial,
    );
    mesh.name = `flood-road:${edge.id}`;
    mesh.position.set(
      (from.x + to.x) / 2,
      city.terrain.elevationInMeters,
      (from.y + to.y) / 2,
    );
    mesh.rotation.y = -Math.atan2(to.y - from.y, to.x - from.x);
    mesh.visible = false;
    if (relief) drapeSurfaceLayer(mesh, city);
    roads.set(edge.id, mesh);
    group.add(mesh);
  }
  for (const building of city.buildings) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        building.maxCorner.x - building.minCorner.x + 0.3,
        building.heightInMeters + 0.3,
        building.maxCorner.y - building.minCorner.y + 0.3,
      ),
      buildingMaterial,
    );
    mesh.name = `flood-building:${building.id}`;
    mesh.position.set(
      (building.minCorner.x + building.maxCorner.x) / 2,
      buildingBaseHeight(city, building) + building.heightInMeters / 2,
      (building.minCorner.y + building.maxCorner.y) / 2,
    );
    mesh.visible = false;
    buildings.set(building.id, mesh);
    group.add(mesh);
  }
  const transform = new THREE.Object3D();
  return {
    group,
    animate(delta: number) {
      if (!Number.isFinite(delta) || delta <= 0) return;
      normals.offset.x = (normals.offset.x + delta * 0.045) % 1;
      normals.offset.y = (normals.offset.y + delta * 0.025) % 1;
    },
    update(snapshot: FloodSnapshot) {
      if (snapshot.tick === 0) normals.offset.set(0, 0);
      let count = 0;
      relief?.update(snapshot);
      if (!relief)
        cells.forEach((cell, index) => {
          const depth = snapshot.waterDepthInMeters[index] ?? 0;
          if (depth <= 0) return;
          transform.position.set(
            (cell.minX + cell.maxX) / 2,
            cell.groundElevationInMeters + depth / 2,
            (cell.minY + cell.maxY) / 2,
          );
          transform.scale.set(
            cell.maxX - cell.minX,
            depth,
            cell.maxY - cell.minY,
          );
          transform.updateMatrix();
          water.setMatrixAt(count++, transform.matrix);
        });
      water.count = count;
      water.instanceMatrix.needsUpdate = true;
      for (const mesh of roads.values()) mesh.visible = false;
      for (const edge of snapshot.roadEdges) {
        const mesh = roads.get(edge.edgeId);
        if (!mesh) continue;
        mesh.visible = edge.blocked;
        mesh.position.y =
          city.terrain.elevationInMeters + edge.maxWaterDepthInMeters + 0.15;
      }
      const exposed = new Set(snapshot.exposedBuildingIds);
      for (const [id, mesh] of buildings) mesh.visible = exposed.has(id);
    },
    dispose() {
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      normals.dispose();
      water.dispose();
      water.material.dispose();
      roadMaterial.dispose();
      buildingMaterial.dispose();
    },
  };
}
