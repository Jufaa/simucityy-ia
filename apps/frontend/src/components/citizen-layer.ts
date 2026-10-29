import * as THREE from 'three';
import type { EvacuationStatus, FloodDrain } from '@simulicity/hazards';
import type { CityResponse, Point } from './city-types';
import { sampleTerrainHeight } from './terrain-view';
import { bridgeAtPoint, sampleRoadSurfaceHeight } from './road-surface';
import { waterSurfaceAt } from './organic-city-model';

/** Rendering data only; animation and arrival slots never modify simulation positions. */
export interface CitizenLayerState {
  elapsedTimeInSeconds?: number;
  citizens: readonly {
    id: string;
    position: Point;
    status?: EvacuationStatus;
  }[];
}

export function createCitizenLayer(city: CityResponse, capacity: number) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  const parts = [
    {
      name: 'evacuation-citizens',
      geometry: new THREE.CylinderGeometry(0.4, 0.45, 0.85, 6),
      x: 0,
      y: 1.35,
      limb: 0,
    },
    {
      name: 'evacuation-heads',
      geometry: new THREE.SphereGeometry(0.35, 6, 4),
      x: 0,
      y: 2,
      limb: 0,
    },
    {
      name: 'evacuation-status',
      geometry: new THREE.ConeGeometry(0.4, 1, 5),
      x: 0,
      y: 3,
      limb: 0,
    },
    {
      name: 'evacuation-left-leg',
      geometry: new THREE.BoxGeometry(0.25, 0.9, 0.3).translate(0, -0.45, 0),
      x: -0.23,
      y: 0.95,
      limb: 1,
    },
    {
      name: 'evacuation-right-leg',
      geometry: new THREE.BoxGeometry(0.25, 0.9, 0.3).translate(0, -0.45, 0),
      x: 0.23,
      y: 0.95,
      limb: -1,
    },
    {
      name: 'evacuation-left-arm',
      geometry: new THREE.BoxGeometry(0.2, 0.8, 0.2).translate(0, -0.4, 0),
      x: -0.55,
      y: 1.65,
      limb: -1,
    },
    {
      name: 'evacuation-right-arm',
      geometry: new THREE.BoxGeometry(0.2, 0.8, 0.2).translate(0, -0.4, 0),
      x: 0.55,
      y: 1.65,
      limb: 1,
    },
  ];
  const meshes = parts.map((part) => {
    const mesh = new THREE.InstancedMesh(
      part.geometry,
      material,
      Math.max(1, capacity),
    );
    mesh.name = part.name;
    mesh.count = 0;
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  });
  const transform = new THREE.Object3D();
  const palette = {
    waiting: 0xe0aa3e,
    evacuating: 0x229bff,
    evacuated: 0x33b56b,
    stranded: 0xe6483d,
  };
  type Motion = {
    position: Point;
    heading: number;
    phase: number;
    swing: number;
    bob: number;
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
      for (const citizen of [...snapshot.citizens].sort((a, b) =>
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
      snapshot.citizens.forEach((citizen, i) => {
        const previous = motion.get(citizen.id);
        const dx =
          citizen.position.x - (previous?.position.x ?? citizen.position.x);
        const dy =
          citizen.position.y - (previous?.position.y ?? citizen.position.y);
        const walking =
          citizen.status === 'evacuating' && Math.hypot(dx, dy) > 1e-5;
        const phase =
          (previous?.phase ?? 0) + (dt > 0 && walking ? dt * 10 : 0);
        const heading = walking ? Math.atan2(dx, dy) : (previous?.heading ?? 0);
        const swing =
          dt === 0 && citizen.status === 'evacuating'
            ? (previous?.swing ?? 0)
            : walking
              ? Math.sin(phase) * 0.6
              : 0;
        const bob =
          dt === 0 && citizen.status === 'evacuating'
            ? (previous?.bob ?? 0)
            : walking
              ? Math.abs(Math.sin(phase)) * 0.04
              : 0;
        motion.set(citizen.id, {
          position: { ...citizen.position },
          heading,
          phase,
          swing,
          bob,
          status: citizen.status,
        });
        const position =
          citizen.status === 'evacuated'
            ? arrivals.get(citizen.id)!
            : citizen.position;
        const ground = sampleRoadSurfaceHeight(city, position.x, position.y);
        const color = new THREE.Color(palette[citizen.status ?? 'waiting']);
        meshes.forEach((mesh, j) => {
          const part = parts[j]!;
          transform.position.set(
            position.x + Math.cos(heading) * part.x,
            ground + part.y + bob,
            position.y - Math.sin(heading) * part.x,
          );
          transform.rotation.set(part.limb * swing, heading, 0, 'YXZ');
          transform.updateMatrix();
          mesh.setMatrixAt(i, transform.matrix);
          mesh.setColorAt(i, color);
        });
      });
      for (const mesh of meshes) {
        mesh.count = snapshot.citizens.length;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    },
    dispose() {
      resetMotion();
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
      material.dispose();
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
