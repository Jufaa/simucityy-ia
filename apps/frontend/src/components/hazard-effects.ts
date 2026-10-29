import * as THREE from 'three';
import {
  hazardHash,
  type HazardKind,
  type StructuralAssessment,
} from '@simulicity/hazards';
import type { CityResponse } from './city-types';
import { buildingBaseHeight, sampleTerrainHeight } from './terrain-view';

/**
 * Efectos visuales por catástrofe. Capa de presentación: lee la evaluación
 * estructural y el grafo vial, pero no modifica la ciudad ni la simulación.
 * - terremoto: grietas desde el epicentro, edificios dañados y escombros
 * - viento fuerte: estelas de viento animadas, daños y escombros
 * - tsunami: frente de ola que entra desde el oeste (el agua la da FloodEngine)
 * - desborde / lluvia: sin capa propia; el agua y la lluvia ya los representan
 */
export function createHazardEffects(
  city: CityResponse,
  hazard: HazardKind,
  assessment: StructuralAssessment,
) {
  const group = new THREE.Group();
  group.name = 'hazard-effects';
  const width = city.config.widthInMeters;
  const height = city.config.heightInMeters;
  const ground = city.terrain.elevationInMeters;
  const damagedById = new Map(
    assessment.buildings.map((item) => [item.buildingId, item]),
  );

  const severeMaterial = new THREE.MeshBasicMaterial({
    color: 0xd32f2f,
    wireframe: true,
  });
  const moderateMaterial = new THREE.MeshBasicMaterial({
    color: 0xef7d1a,
    wireframe: true,
  });
  for (const building of city.buildings) {
    const damage = damagedById.get(building.id);
    if (!damage?.damaged) continue;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        building.maxCorner.x - building.minCorner.x + 0.5,
        building.heightInMeters + 0.5,
        building.maxCorner.y - building.minCorner.y + 0.5,
      ),
      damage.severity >= 0.8 ? severeMaterial : moderateMaterial,
    );
    mesh.name = `hazard-damaged:${building.id}`;
    mesh.position.set(
      (building.minCorner.x + building.maxCorner.x) / 2,
      buildingBaseHeight(city, building) + building.heightInMeters / 2,
      (building.minCorner.y + building.maxCorner.y) / 2,
    );
    // Inclinación leve solo en la copia visual de daño severo.
    if (damage.severity >= 0.8) mesh.rotation.z = 0.025;
    group.add(mesh);
  }

  // Escombros sobre los tramos bloqueados por daño estructural.
  const blocked = new Set(assessment.blockedRoadEdgeIds);
  const nodes = new Map(
    (city.roadGraph?.nodes ?? []).map((node) => [node.id, node]),
  );
  const debrisPlacements: { x: number; y: number; z: number; yaw: number }[] =
    [];
  for (const edge of city.roadGraph?.edges ?? []) {
    if (!blocked.has(edge.id)) continue;
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to) continue;
    for (const t of [0.25, 0.5, 0.75]) {
      const x = from.x + (to.x - from.x) * t;
      const z = from.y + (to.y - from.y) * t;
      debrisPlacements.push({
        x,
        y: sampleTerrainHeight(city, x, z) + 0.35,
        z,
        yaw: hazardHash(`${edge.id}:${t}`) * Math.PI,
      });
    }
  }
  let debris: THREE.InstancedMesh | null = null;
  if (debrisPlacements.length) {
    debris = new THREE.InstancedMesh(
      new THREE.BoxGeometry(2.2, 0.7, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x8a7f74, roughness: 1 }),
      debrisPlacements.length,
    );
    debris.name = 'hazard-debris';
    debris.castShadow = true;
    const transform = new THREE.Object3D();
    debrisPlacements.forEach((item, index) => {
      transform.position.set(item.x, item.y, item.z);
      transform.rotation.set(0, item.yaw, 0);
      transform.scale.setScalar(0.7 + hazardHash(`debris:${index}`) * 0.7);
      transform.updateMatrix();
      debris!.setMatrixAt(index, transform.matrix);
    });
    group.add(debris);
  }

  if (hazard === 'earthquake') {
    const points: number[] = [];
    const center = { x: width / 2, z: height / 2 };
    for (let branch = 0; branch < 7; branch++) {
      const angle = (branch / 7) * Math.PI * 2 + 0.35;
      let x = center.x;
      let z = center.z;
      const steps = 7;
      for (let step = 1; step <= steps; step++) {
        const jitter = (hazardHash(`crack:${branch}:${step}`) - 0.5) * 0.35;
        const nextX = center.x + Math.cos(angle + jitter) * step * 16;
        const nextZ = center.z + Math.sin(angle + jitter) * step * 16;
        points.push(
          x,
          sampleTerrainHeight(city, x, z) + 0.22,
          z,
          nextX,
          sampleTerrainHeight(city, nextX, nextZ) + 0.22,
          nextZ,
        );
        x = nextX;
        z = nextZ;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(points, 3),
    );
    const cracks = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: 0x2e2118 }),
    );
    cracks.name = 'earthquake-cracks';
    group.add(cracks);
  }

  // Estelas de viento: líneas cortas que cruzan la ciudad hacia el este.
  let windStreaks: THREE.LineSegments | null = null;
  let windPositions: Float32Array | null = null;
  let windSeeds: Float32Array | null = null;
  if (hazard === 'strong-wind') {
    const count = 110;
    windSeeds = new Float32Array(count * 3);
    for (let i = 0; i < windSeeds.length; i++)
      windSeeds[i] = hazardHash(`wind:${i}`);
    windPositions = new Float32Array(count * 6);
    const geometry = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(windPositions, 3).setUsage(
      THREE.DynamicDrawUsage,
    );
    geometry.setAttribute('position', attribute);
    windStreaks = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0xf4fbff,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    );
    windStreaks.name = 'wind-streaks';
    windStreaks.frustumCulled = false;
    group.add(windStreaks);
  }

  // Frente de ola del tsunami: pared translúcida que cruza desde el oeste.
  let wave: THREE.Mesh | null = null;
  if (hazard === 'tsunami') {
    wave = new THREE.Mesh(
      new THREE.BoxGeometry(5, 7, height * 1.05),
      new THREE.MeshStandardMaterial({
        color: 0x2e9bc6,
        transparent: true,
        opacity: 0.45,
        roughness: 0.25,
        depthWrite: false,
      }),
    );
    wave.name = 'tsunami-wave';
    wave.position.set(-12, ground + 3.2, height / 2);
    group.add(wave);
  }

  let elapsed = 0;
  const writeWind = () => {
    if (!windStreaks || !windPositions || !windSeeds) return;
    const spanX = width + 80;
    for (let i = 0; i < windSeeds.length / 3; i++) {
      const x = ((windSeeds[i * 3]! * spanX + elapsed * 95) % spanX) - 40;
      const y = ground + 4 + windSeeds[i * 3 + 1]! * 34;
      const z = windSeeds[i * 3 + 2]! * height;
      windPositions.set([x, y, z, x + 9, y + 0.7, z], i * 6);
    }
    windStreaks.geometry.getAttribute('position').needsUpdate = true;
  };
  writeWind();

  let disposed = false;
  return {
    group,
    animate(delta: number, running: boolean) {
      if (!Number.isFinite(delta) || delta <= 0 || disposed) return;
      if (running) elapsed += delta;
      if (windStreaks && running) writeWind();
      if (wave) {
        const progress = Math.min(1, (elapsed * 14) / Math.max(1, width));
        wave.position.x = -12 + progress * (width + 30);
        const material = wave.material as THREE.MeshStandardMaterial;
        material.opacity = 0.45 * (1 - progress * 0.75);
        wave.visible = running || elapsed > 0;
      }
    },
    reset() {
      elapsed = 0;
      writeWind();
      if (wave) {
        wave.position.x = -12;
        (wave.material as THREE.MeshStandardMaterial).opacity = 0.45;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      group.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.LineSegments
        ) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            materials.add(material);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      debris?.dispose();
      group.clear();
    },
  };
}
