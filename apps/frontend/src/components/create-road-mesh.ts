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
 * concrete slab underneath, shortened at both ends so slabs never cross
 * a junction or a side street. Every shared node gets an asphalt infill
 * polygon: the convex hull of its arm corners, exactly bounded by the
 * carriageway widths. That seals the wedge gaps segment boxes leave at
 * bends and intersections without discs or boxes overlapping buildings.
 * True intersections (3+ arms) get zebra crosswalks across wide arms
 * only, and never on top of a building footprint. All of it is chunked
 * or merged geometry: draw calls stay bounded regardless of city size.
 *
 * Elevation stack (metres above ground): sidewalk top +0.03, asphalt
 * top +0.06, junction infill +0.065, crosswalk markings +0.075, flood
 * water dynamic above that.
 */
export function createRoadLayer(
  roads: Road[],
  groundElevationInMeters: number,
  material: THREE.MeshStandardMaterial,
  widthInMeters = 6,
  sidewalkMaterial?: THREE.MeshStandardMaterial,
  blockedFootprints: readonly {
    minCorner: { x: number; y: number };
    maxCorner: { x: number; y: number };
  }[] = [],
): THREE.Group {
  const thickness = 0.3;
  const group = new THREE.Group();
  group.name = 'road-layer';
  const placements: InstancePlacementLike[] = [];
  const sidewalkPlacements: InstancePlacementLike[] = [];
  const pendingSidewalks: {
    road: Road;
    length: number;
    ux: number;
    uz: number;
    totalWidth: number;
  }[] = [];
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
    const profile = getRoadProfile(road, widthInMeters);
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
    if (sidewalkWidth > 0)
      pendingSidewalks.push({
        road,
        length,
        ux,
        uz,
        totalWidth: profile.widthInMeters + 2 * sidewalkWidth,
      });
  }
  for (const pending of pendingSidewalks) {
    // Shorten the slab at shared nodes: an unshortened slab runs to the
    // node centre and its width spills across the side street and the
    // corner buildings. The junction zone itself is ground concrete,
    // so a stopped slab reads as a continuous pavement.
    const clearanceAt = (point: { x: number; y: number }) =>
      (ends.get(keyOf(point.x, point.y))?.length ?? 0) >= 2
        ? pending.totalWidth / 2
        : 0;
    const startClearance = clearanceAt(pending.road.start);
    const endClearance = clearanceAt(pending.road.end);
    const slabLength = pending.length - startClearance - endClearance;
    if (slabLength <= 2) continue;
    const shift = (startClearance - endClearance) / 2;
    sidewalkPlacements.push({
      position: new THREE.Vector3(
        (pending.road.start.x + pending.road.end.x) / 2 + pending.ux * shift,
        groundElevationInMeters + 0.03 - thickness / 2,
        (pending.road.start.y + pending.road.end.y) / 2 + pending.uz * shift,
      ),
      scale: new THREE.Vector3(slabLength, thickness, pending.totalWidth),
      yaw: -Math.atan2(
        pending.road.end.y - pending.road.start.y,
        pending.road.end.x - pending.road.start.x,
      ),
    });
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
  {
    // Asphalt infill at every shared node: convex hull of the arm
    // corners (node +/- perpendicular * carriageway half width). It is
    // bounded by the road widths themselves, so it seals wedge gaps at
    // bends/intersections and covers the segment-box overlap at the
    // node (+0.065, just above the +0.06 carriageway tops) without
    // spilling onto sidewalks or buildings the way discs did.
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let base = 0;
    for (const list of ends.values()) {
      if (list.length < 2) continue;
      const { x, z } = list[0]!;
      const corners: { x: number; z: number }[] = [];
      for (const end of list) {
        const px = -end.dz,
          pz = end.dx;
        corners.push({
          x: x + px * (end.roadWidth / 2),
          z: z + pz * (end.roadWidth / 2),
        });
        corners.push({
          x: x - px * (end.roadWidth / 2),
          z: z - pz * (end.roadWidth / 2),
        });
      }
      const hull = convexHull(corners);
      if (hull.length < 3) continue;
      for (const point of hull) {
        positions.push(point.x, groundElevationInMeters + 0.065, point.z);
        normals.push(0, 1, 0);
        uvs.push(point.x / 10, point.z / 10);
      }
      for (let i = 1; i < hull.length - 1; i++)
        indices.push(base, base + i + 1, base + i);
      base += hull.length;
    }
    if (indices.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute(
        'normal',
        new THREE.Float32BufferAttribute(normals, 3),
      );
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      const infill = new THREE.Mesh(geometry, material);
      infill.name = 'road-junction-infill';
      infill.receiveShadow = true;
      group.add(infill);
    }
  }
  if (sidewalkMaterial) {
    const crosswalks: InstancePlacementLike[] = [];
    // Crosswalks belong to true intersections only. Segment joints along
    // a straight or gently curving way (2 arms) seal with the skirted
    // boxes themselves. Nearby true intersections (dual carriageways
    // split one crossing into several nodes a few metres apart) cluster
    // into one crosswalk set. Narrow arms (< 7.5 m) get no zebra: at
    // that width the bars crowd the carriageway and read as noise.
    const junctions = [...ends.values()]
      .filter((list) => list.length >= 3)
      .sort((a, b) => a[0]!.x - b[0]!.x || a[0]!.z - b[0]!.z);
    const acceptedCrosswalks: { x: number; z: number }[] = [];
    for (const list of junctions) {
      const { x, z } = list[0]!;
      const clustered = acceptedCrosswalks.some(
        (point) => Math.hypot(point.x - x, point.z - z) < 40,
      );
      if (clustered) continue;
      acceptedCrosswalks.push({ x, z });
      for (const end of list) {
        if (end.roadWidth < 7.5) continue;
        const centreX = x + end.dx * (end.totalWidth / 2 + 1.4);
        const centreZ = z + end.dz * (end.totalWidth / 2 + 1.4);
        // Never paint a zebra through a building: imported footprints
        // can sit closer than the crosswalk offset at chamfered corners.
        if (
          blockedFootprints.some(
            (footprint) =>
              centreX >= footprint.minCorner.x - 1 &&
              centreX <= footprint.maxCorner.x + 1 &&
              centreZ >= footprint.minCorner.y - 1 &&
              centreZ <= footprint.maxCorner.y + 1,
          )
        )
          continue;
        // Zebra: four bars across the arm, outside the junction area.
        // totalWidth includes both sidewalks, so the centre sits past
        // the carriageway edge and the near sidewalk.
        const px = -end.dz,
          pz = end.dx;
        const centre = end.totalWidth / 2 + 1.4;
        for (const across of [-0.33, -0.11, 0.11, 0.33]) {
          crosswalks.push({
            position: new THREE.Vector3(
              x + end.dx * centre + px * across * end.roadWidth,
              groundElevationInMeters + 0.075,
              z + end.dz * centre + pz * across * end.roadWidth,
            ),
            scale: new THREE.Vector3(1.7, 0.012, 0.55),
            yaw: -Math.atan2(end.dz, end.dx),
          });
        }
      }
    }
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

/** Monotone-chain convex hull in the XZ plane, counter-clockwise. */
function convexHull(
  points: { x: number; z: number }[],
): { x: number; z: number }[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  const unique = sorted.filter(
    (point, i) =>
      i === 0 || point.x !== sorted[i - 1]!.x || point.z !== sorted[i - 1]!.z,
  );
  if (unique.length < 3) return unique;
  const cross = (
    o: { x: number; z: number },
    a: { x: number; z: number },
    b: { x: number; z: number },
  ) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower: { x: number; z: number }[] = [];
  for (const point of unique) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0
    )
      lower.pop();
    lower.push(point);
  }
  const upper: { x: number; z: number }[] = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const point = unique[i]!;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0
    )
      upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
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
