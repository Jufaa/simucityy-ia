import * as THREE from 'three';
import type { EvacuationStatus, FloodDrain } from '@simulicity/hazards';
import type { CityResponse, Point } from './city-types';
import { sampleTerrainHeight } from './terrain-view';
import { bridgeAtPoint, sampleRoadSurfaceHeight } from './road-surface';
import { waterSurfaceAt } from './organic-city-model';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  citizenAppearance,
  createCitizenGait,
  writeCitizenGait,
  type CitizenAppearance,
} from './citizen-anatomy';

/** Rendering data only; animation and arrival slots never modify simulation positions. */
export interface CitizenLayerState {
  elapsedTimeInSeconds?: number;
  citizens: readonly {
    id: string;
    position: Point;
    status?: EvacuationStatus;
    walking?: boolean;
  }[];
}

export function createCitizenLayer(city: CityResponse, capacity: number) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  const limit = Number.isFinite(capacity)
    ? Math.max(0, Math.floor(capacity))
    : 0;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const torso = box.clone();
  const vertices = torso.getAttribute('position');
  for (let index = 0; index < vertices.count; index++)
    vertices.setX(
      index,
      vertices.getX(index) * (vertices.getY(index) > 0 ? 1 : 0.74),
    );
  torso.computeVertexNormals();
  const sphere = new THREE.SphereGeometry(0.5, 8, 6);
  const cone = new THREE.ConeGeometry(0.15, 0.28, 5);
  const eyeParts = [-0.09, 0.09].map((x) =>
    new THREE.BoxGeometry(0.055, 0.055, 0.025).translate(x, 0, 0),
  );
  const eyes = mergeGeometries(eyeParts);
  for (const geometry of eyeParts) geometry.dispose();
  type Part = {
    name: string;
    geometry: THREE.BufferGeometry;
    color: keyof CitizenAppearance | 'status' | 'eyes';
  };
  const part = (
    name: string,
    geometry: THREE.BufferGeometry,
    color: Part['color'],
  ): Part => ({ name: `evacuation-${name}`, geometry, color });
  const parts: Part[] = [
    part('citizens', torso, 'status'),
    part('hips', box, 'trousers'),
    part('neck', sphere, 'skin'),
    part('heads', sphere, 'skin'),
    part('hair', sphere, 'hair'),
    part('eyes', eyes, 'eyes'),
    part('status', cone, 'status'),
    part('left-leg', box, 'trousers'),
    part('right-leg', box, 'trousers'),
    part('left-shin', box, 'trousers'),
    part('right-shin', box, 'trousers'),
    part('left-shoe', box, 'shoes'),
    part('right-shoe', box, 'shoes'),
    part('left-arm', box, 'shirt'),
    part('right-arm', box, 'shirt'),
    part('left-forearm', box, 'skin'),
    part('right-forearm', box, 'skin'),
    part('left-hand', sphere, 'skin'),
    part('right-hand', sphere, 'skin'),
    part('nose', sphere, 'skin'),
  ];
  const meshes = parts.map((part) => {
    const mesh = new THREE.InstancedMesh(
      part.geometry,
      material,
      Math.max(1, limit),
    );
    mesh.name = part.name;
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  });
  const gait = createCitizenGait();
  const instanceColor = new THREE.Color();
  let disposed = false;
  const transform = new THREE.Object3D();
  const palette = {
    waiting: 0xe0aa3e,
    evacuating: 0x229bff,
    evacuated: 0x33b56b,
    stranded: 0xe6483d,
    trapped: 0x8e44ad,
  };
  type Motion = {
    position: Point;
    heading: number;
    phase: number;
    walking: boolean;
    appearance: CitizenAppearance;
    status: EvacuationStatus | undefined;
  };
  const motion = new Map<string, Motion>();
  const arrivals = new Map<string, Point>();
  const slots = new Map<string, Generator<Point>>();
  let previousTime = 0;
  let previousContext = 'default';
  const clear = (p: Point) =>
    p.x >= 0 &&
    p.y >= 0 &&
    p.x <= city.config.widthInMeters &&
    p.y <= city.config.heightInMeters &&
    (!city.organic ||
      bridgeAtPoint(city, p.x, p.y) !== undefined ||
      (waterSurfaceAt(city.organic, p) === undefined &&
        sampleTerrainHeight(city, p.x, p.y) > city.organic.lake.level)) &&
    !city.buildings.some(
      (b) =>
        p.x > b.minCorner.x - 1 &&
        p.x < b.maxCorner.x + 1 &&
        p.y > b.minCorner.y - 1 &&
        p.y < b.maxCorner.y + 1,
    );
  // Presentation-only queue around each shared shelter node; square rings avoid overlap.
  function* shelterSlots(anchor: Point): Generator<Point> {
    for (let ring = 0; ring <= 64; ring++) {
      for (let x = -ring; x <= ring; x++) {
        for (let y = -ring; y <= ring; y++) {
          if (Math.max(Math.abs(x), Math.abs(y)) !== ring) continue;
          const p = { x: anchor.x + x * 1.8, y: anchor.y + y * 1.8 };
          if (clear(p)) yield p;
        }
      }
    }
  }
  const resetMotion = () => {
    motion.clear();
    arrivals.clear();
    slots.clear();
  };
  return {
    group,
    resetMotion,
    update(snapshot: CitizenLayerState, realSeconds = 0, context = 'default') {
      if (disposed) return;
      const visibleCitizens = snapshot.citizens.slice(0, limit);
      const time = snapshot.elapsedTimeInSeconds ?? previousTime;
      if (
        time < previousTime ||
        context !== previousContext ||
        snapshot.citizens.some(
          (c) =>
            c.status === 'waiting' && motion.get(c.id)?.status === 'evacuated',
        )
      )
        resetMotion();
      previousTime = time;
      previousContext = context;
      const dt = Number.isFinite(realSeconds)
        ? Math.max(0, Math.min(realSeconds, 0.25))
        : 0;
      // Assign simultaneous arrivals by ID, independent of the snapshot's render order.
      for (const citizen of [...visibleCitizens].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      )) {
        if (citizen.status !== 'evacuated' || arrivals.has(citizen.id))
          continue;
        const key = `${citizen.position.x},${citizen.position.y}`;
        if (!slots.has(key)) slots.set(key, shelterSlots(citizen.position));
        arrivals.set(
          citizen.id,
          slots.get(key)!.next().value ?? citizen.position,
        );
      }
      visibleCitizens.forEach((citizen, i) => {
        const previous = motion.get(citizen.id);
        const dx =
          citizen.position.x - (previous?.position.x ?? citizen.position.x);
        const dy =
          citizen.position.y - (previous?.position.y ?? citizen.position.y);
        const mobile =
          citizen.status === 'evacuating' || citizen.walking === true;
        const walking = mobile && Math.hypot(dx, dy) > 1e-5;
        const phase =
          (previous?.phase ?? 0) + (dt > 0 && walking ? dt * 10 : 0);
        const heading = walking ? Math.atan2(dx, dy) : (previous?.heading ?? 0);
        const poseWalking =
          dt === 0 && mobile ? (previous?.walking ?? false) : walking;
        const appearance =
          previous?.appearance ?? citizenAppearance(citizen.id);
        writeCitizenGait(gait, phase, poseWalking);
        motion.set(citizen.id, {
          position: { ...citizen.position },
          heading,
          phase,
          walking: poseWalking,
          appearance,
          status: citizen.status,
        });
        const position =
          citizen.status === 'evacuated'
            ? arrivals.get(citizen.id)!
            : citizen.position;
        const ground = sampleRoadSurfaceHeight(city, position.x, position.y);
        const color = palette[citizen.status ?? 'waiting'];
        const cosine = Math.cos(heading),
          sine = Math.sin(heading);
        const write = (
          index: number,
          x: number,
          y: number,
          z: number,
          width: number,
          height: number,
          depth: number,
          angle = 0,
        ) => {
          const mesh = meshes[index],
            part = parts[index];
          if (!mesh || !part) return;
          transform.position.set(
            position.x + cosine * x + sine * z,
            ground + y,
            position.y - sine * x + cosine * z,
          );
          transform.rotation.set(angle, heading, 0, 'YXZ');
          transform.scale.set(width, height, depth);
          transform.updateMatrix();
          mesh.setMatrixAt(i, transform.matrix);
          instanceColor.setHex(
            part.color === 'status'
              ? color
              : part.color === 'eyes'
                ? 0x20262c
                : appearance[part.color],
          );
          mesh.setColorAt(i, instanceColor);
        };
        const rootY = gait.rootY;
        write(0, 0, 1.35 + rootY, 0, 0.72, 0.7, 0.38);
        write(1, 0, 1 + rootY, 0, 0.54, 0.22, 0.34);
        write(2, 0, 1.79 + rootY, 0, 0.18, 0.2, 0.18);
        const headY = 2 + rootY + gait.headBob;
        write(3, 0, headY, 0, 0.49, 0.55, 0.47);
        write(4, 0, headY + 0.13, -0.035, 0.51, 0.35, 0.47);
        write(5, 0, headY + 0.025, 0.228, 1, 1, 1);
        write(6, 0, 2.75 + rootY, 0, 1, 1, 1);
        write(19, 0, headY - 0.025, 0.26, 0.075, 0.09, 0.08);
        for (const [side, limb] of [
          [-1, gait.left],
          [1, gait.right],
        ] as const) {
          const index = side < 0 ? 0 : 1;
          const hipY = 1 + rootY;
          const kneeY = hipY - 0.45 * Math.cos(limb.hip),
            kneeZ = -0.45 * Math.sin(limb.hip);
          const shinAngle = limb.hip + limb.knee;
          write(
            7 + index,
            side * 0.17,
            hipY - 0.225 * Math.cos(limb.hip),
            -0.225 * Math.sin(limb.hip),
            0.235,
            0.45,
            0.25,
            limb.hip,
          );
          write(
            9 + index,
            side * 0.17,
            kneeY - 0.225 * Math.cos(shinAngle),
            kneeZ - 0.225 * Math.sin(shinAngle),
            0.205,
            0.45,
            0.22,
            shinAngle,
          );
          write(
            11 + index,
            side * 0.17,
            limb.footY - 0.045,
            limb.footZ + 0.065,
            0.24,
            0.11,
            0.39,
          );
          const shoulderY = 1.65 + rootY,
            shoulderX = side * 0.44;
          const elbowY = shoulderY - 0.33 * Math.cos(limb.arm),
            elbowZ = -0.33 * Math.sin(limb.arm);
          const forearmAngle = limb.arm + limb.elbow;
          const handY = elbowY - 0.3 * Math.cos(forearmAngle),
            handZ = elbowZ - 0.3 * Math.sin(forearmAngle);
          write(
            13 + index,
            shoulderX,
            shoulderY - 0.165 * Math.cos(limb.arm),
            -0.165 * Math.sin(limb.arm),
            0.21,
            0.33,
            0.24,
            limb.arm,
          );
          write(
            15 + index,
            shoulderX,
            elbowY - 0.15 * Math.cos(forearmAngle),
            elbowZ - 0.15 * Math.sin(forearmAngle),
            0.16,
            0.3,
            0.18,
            forearmAngle,
          );
          write(
            17 + index,
            shoulderX,
            handY,
            handZ,
            0.18,
            0.2,
            0.18,
            forearmAngle,
          );
        }
      });
      for (const mesh of meshes) {
        mesh.count = visibleCitizens.length;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      resetMotion();
      for (const mesh of meshes) mesh.dispose();
      for (const geometry of new Set(parts.map((part) => part.geometry)))
        geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}

export function createDrainLayer(
  city: CityResponse,
  drains: readonly FloodDrain[],
) {
  const group = new THREE.Group();
  group.name = 'local-drains';
  const geometry = new THREE.BoxGeometry(2.5, 0.2, 2.5);
  const material = new THREE.MeshStandardMaterial({
    color: 0x00c7cf,
    roughness: 0.6,
  });
  for (const drain of drains) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = drain.id;
    mesh.position.set(
      drain.position.x,
      sampleTerrainHeight(city, drain.position.x, drain.position.y) + 0.2,
      drain.position.y,
    );
    group.add(mesh);
  }
  return {
    group,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
