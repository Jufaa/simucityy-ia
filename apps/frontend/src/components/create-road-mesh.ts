import * as THREE from 'three';
import type { Road } from './city-types';
import { createChunkedInstances } from './instanced-chunks';
import { getRoadProfile } from './road-profile';

/** Visual road width only; the simulation still consumes centerlines. */
export function createRoadMesh(
  road: Road,
  groundElevationInMeters: number,
  material: THREE.MeshStandardMaterial,
  widthInMeters = 6,
) {
  const dx = road.end.x - road.start.x;
  const dz = road.end.y - road.start.y;
  const length = Math.hypot(dx, dz);
  // Deep skirt, same +0.06 top: segment joints and drape gaps can never
  // open a wedge of terrain through the carriageway.
  const thickness = 0.3;
  const geometry = new THREE.BoxGeometry(
    length,
    thickness,
    getRoadProfile(road, widthInMeters).widthInMeters,
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;

  mesh.position.set(
    (road.start.x + road.end.x) / 2,
    groundElevationInMeters + 0.06 - thickness / 2,
    (road.start.y + road.end.y) / 2,
  );
  mesh.rotation.y = -Math.atan2(dz, dx);
  return mesh;
}

/**
 * Roads are instanced in spatial chunks (one draw call per visible chunk).
 * On relief terrain drapeSurfaceLayer merges each chunk into a draped mesh.
 *
 * When a sidewalk material is supplied (real imported zones, which carry
 * no sidewalk blocks of their own), each segment also gets a wider
 * concrete slab underneath, every shared node gets round junction plates
 * so segment boxes never read as overlapping patches, and true
 * intersections (3+ arms) get zebra crosswalks across each arm. All of it
 * is chunked instances: draw calls stay bounded regardless of city size.
 */
export function createRoadLayer(
  roads: Road[],
  groundElevationInMeters: number,
  material: THREE.MeshStandardMaterial,
  widthInMeters = 6,
  sidewalkMaterial?: THREE.MeshStandardMaterial,
  presentationScale = 1,
): THREE.Group {
  const thickness = 0.3;
  const group = new THREE.Group();
  group.name = 'road-layer';
  const placements: InstancePlacementLike[] = [];
  const sidewalkPlacements: InstancePlacementLike[] = [];
  type End = {
    x: number;
    z: number;
    totalWidth: number;
    roadWidth: number;
    dx: number;
    dz: number;
  };
  const ends = new Map<string, End[]>();
  const keyOf = (x: number, z: number) =>
    `${Math.round(x * 50)},${Math.round(z * 50)}`;
  for (const road of roads) {
    const dx = road.end.x - road.start.x;
    const dz = road.end.y - road.start.y;
    const rawProfile = getRoadProfile(road, widthInMeters);
    const profile = {
      ...rawProfile,
      widthInMeters: rawProfile.widthInMeters * presentationScale,
      sidewalkWidthInMeters:
        rawProfile.sidewalkWidthInMeters * presentationScale,
    };
    const length = Math.hypot(dx, dz);
    if (!(length > 0)) continue;
    placements.push({
      position: new THREE.Vector3(
        (road.start.x + road.end.x) / 2,
        groundElevationInMeters + 0.06 - thickness / 2,
        (road.start.y + road.end.y) / 2,
      ),
      scale: new THREE.Vector3(length, thickness, profile.widthInMeters),
      yaw: -Math.atan2(dz, dx),
    });
    const sidewalkWidth = sidewalkMaterial ? profile.sidewalkWidthInMeters : 0;
    if (sidewalkWidth > 0)
      sidewalkPlacements.push({
        position: new THREE.Vector3(
          (road.start.x + road.end.x) / 2,
          groundElevationInMeters + 0.03 - thickness / 2,
          (road.start.y + road.end.y) / 2,
        ),
        scale: new THREE.Vector3(
          length,
          thickness,
          profile.widthInMeters + 2 * sidewalkWidth,
        ),
        yaw: -Math.atan2(dz, dx),
      });
    if (sidewalkMaterial) {
      const ux = dx / length,
        uz = dz / length;
      for (const [point, sign] of [
        [road.start, 1],
        [road.end, -1],
      ] as const) {
        const key = keyOf(point.x, point.y);
        const list = ends.get(key) ?? [];
        list.push({
          x: point.x,
          z: point.y,
          totalWidth: profile.widthInMeters + 2 * sidewalkWidth,
          roadWidth: profile.widthInMeters,
          dx: ux * sign,
          dz: uz * sign,
        });
        ends.set(key, list);
      }
    }
  }
  const roadsGroup = createChunkedInstances({
    name: 'roads',
    geometry: new THREE.BoxGeometry(1, 1, 1),
    material,
    placements,
    receiveShadow: true,
  });
  roadsGroup.userData.roadIds = roads.map((road) => road.id);
  group.userData.roadIds = roads.map((road) => road.id);
  group.add(roadsGroup);
  if (sidewalkMaterial && sidewalkPlacements.length)
    group.add(
      createChunkedInstances({
        name: 'road-sidewalks',
        geometry: new THREE.BoxGeometry(1, 1, 1),
        material: sidewalkMaterial,
        placements: sidewalkPlacements,
        receiveShadow: true,
      }),
    );
  if (sidewalkMaterial) {
    const sidewalkPlates: InstancePlacementLike[] = [];
    const asphaltPlates: InstancePlacementLike[] = [];
    const crosswalks: InstancePlacementLike[] = [];
    // Plates and crosswalks belong to true intersections only. Segment
    // joints along a straight or gently curving way (2 arms) seal with
    // the skirted boxes themselves; plating every joint spammed discs
    // along avenues. Nearby true intersections (dual carriageways split
    // one crossing into several nodes a few metres apart) cluster into
    // one crosswalk set.
    const junctions = [...ends.values()]
      .filter((list) => list.length >= 3)
      .sort((a, b) => a[0]!.x - b[0]!.x || a[0]!.z - b[0]!.z);
    const acceptedCrosswalks: { x: number; z: number }[] = [];
    for (const list of junctions) {
      const { x, z } = list[0]!;
      const total = Math.max(...list.map((end) => end.totalWidth));
      const road = Math.max(...list.map((end) => end.roadWidth));
      sidewalkPlates.push({
        position: new THREE.Vector3(
          x,
          groundElevationInMeters + 0.03 - thickness / 2,
          z,
        ),
        scale: new THREE.Vector3(total / 2, thickness, total / 2),
        yaw: 0,
      });
      asphaltPlates.push({
        position: new THREE.Vector3(
          x,
          groundElevationInMeters + 0.062 - thickness / 2,
          z,
        ),
        scale: new THREE.Vector3(road / 2, thickness, road / 2),
        yaw: 0,
      });
      const clustered = acceptedCrosswalks.some(
        (point) => Math.hypot(point.x - x, point.z - z) < 30,
      );
      if (!clustered) {
        acceptedCrosswalks.push({ x, z });
        for (const end of list) {
          // Zebra: four bars across the arm, just outside the junction plate.
          const px = -end.dz,
            pz = end.dx;
          const centre = total / 2 + 1.4;
          for (const across of [-0.33, -0.11, 0.11, 0.33]) {
            crosswalks.push({
              position: new THREE.Vector3(
                x + end.dx * centre + px * across * end.roadWidth,
                groundElevationInMeters + 0.075,
                z + end.dz * centre + pz * across * end.roadWidth,
              ),
              scale: new THREE.Vector3(
                1.7 * presentationScale,
                0.012,
                0.55 * presentationScale,
              ),
              yaw: -Math.atan2(end.dz, end.dx),
            });
          }
        }
      }
    }
    const plateGeometry = new THREE.CylinderGeometry(1, 1, 1, 20);
    if (sidewalkPlates.length)
      group.add(
        createChunkedInstances({
          name: 'road-junction-sidewalks',
          geometry: plateGeometry,
          material: sidewalkMaterial,
          placements: sidewalkPlates,
          receiveShadow: true,
        }),
      );
    if (asphaltPlates.length)
      group.add(
        createChunkedInstances({
          name: 'road-junction-asphalt',
          geometry: plateGeometry.clone(),
          material,
          placements: asphaltPlates,
          receiveShadow: true,
        }),
      );
    plateGeometry.dispose();
    if (crosswalks.length)
      group.add(
        createChunkedInstances({
          name: 'road-crosswalks',
          geometry: new THREE.BoxGeometry(1, 1, 1),
          material: crosswalkMaterial,
          placements: crosswalks,
          receiveShadow: true,
        }),
      );
  }
  return group;
}

const crosswalkMaterial = new THREE.MeshStandardMaterial({
  color: 0xe8e6da,
  roughness: 0.9,
  polygonOffset: true,
  polygonOffsetFactor: -3,
  polygonOffsetUnits: -3,
});

type InstancePlacementLike = {
  position: THREE.Vector3;
  scale: THREE.Vector3;
  yaw?: number;
};
