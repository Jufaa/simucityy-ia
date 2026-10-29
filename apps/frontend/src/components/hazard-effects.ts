import * as THREE from 'three';
import {
  hazardHash,
  type BuildingImpact,
  type HazardKind,
  type StructuralAssessment,
} from '@simulicity/hazards';
import type { CityResponse } from './city-types';
import { buildingBaseHeight, sampleTerrainHeight } from './terrain-view';

/**
 * Efectos visuales por catástrofe. Capa de presentación: lee el estado
 * físico (intacto/dañado/derrumbado) que calcula la simulación y lo dibuja,
 * sin modificar la ciudad ni el solver.
 * - dañados: rejilla naranja/roja sobre el edificio
 * - derrumbados: montón de escombros propio que crece al caer + restos en
 *   las calles cortadas por ese derrumbe
 * - terremoto: grietas desde el epicentro
 * - viento: estelas animadas
 * - tsunami: ola curvada con espuma cuya posición sigue al frente de agua
 *   real del solver (no un temporizador)
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
  const buildingById = new Map(city.buildings.map((b) => [b.id, b]));
  const nodes = new Map(
    (city.roadGraph?.nodes ?? []).map((node) => [node.id, node]),
  );
  const edgeById = new Map(
    (city.roadGraph?.edges ?? []).map((edge) => [edge.id, edge]),
  );
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // --- Edificios dañados (rejilla) -------------------------------------
  const severeMaterial = own(
    new THREE.MeshBasicMaterial({ color: 0xd32f2f, wireframe: true }),
  );
  const moderateMaterial = own(
    new THREE.MeshBasicMaterial({ color: 0xef7d1a, wireframe: true }),
  );
  const damagedMeshes = new Map<string, THREE.Mesh>();
  for (const item of assessment.buildings) {
    if (!item.damaged) continue;
    const building = buildingById.get(item.buildingId);
    if (!building) continue;
    const mesh = new THREE.Mesh(
      own(
        new THREE.BoxGeometry(
          building.maxCorner.x - building.minCorner.x + 0.5,
          building.heightInMeters + 0.5,
          building.maxCorner.y - building.minCorner.y + 0.5,
        ),
      ),
      item.severity >= 0.8 ? severeMaterial : moderateMaterial,
    );
    mesh.name = `hazard-damaged:${building.id}`;
    mesh.position.set(
      (building.minCorner.x + building.maxCorner.x) / 2,
      buildingBaseHeight(city, building) + building.heightInMeters / 2,
      (building.minCorner.y + building.maxCorner.y) / 2,
    );
    if (item.severity >= 0.8) mesh.rotation.z = 0.025;
    mesh.visible = false;
    damagedMeshes.set(building.id, mesh);
    group.add(mesh);
  }

  // --- Escombros de derrumbes (se crean al primer derrumbe) ------------
  const rubbleMaterial = own(
    new THREE.MeshStandardMaterial({ color: 0x8a7f74, roughness: 1 }),
  );
  const dustMaterial = own(
    new THREE.MeshStandardMaterial({ color: 0xa79a86, roughness: 1 }),
  );
  const rubbleChunks = own(new THREE.BoxGeometry(1, 1, 1));
  const rubbleByBuilding = new Map<string, THREE.Group>();
  const rubbleGrowth = new Map<string, number>();
  function rubbleFor(buildingId: string): THREE.Group {
    const existing = rubbleByBuilding.get(buildingId);
    if (existing) return existing;
    const building = buildingById.get(buildingId)!;
    const pile = new THREE.Group();
    pile.name = `hazard-rubble:${buildingId}`;
    const w = building.maxCorner.x - building.minCorner.x;
    const d = building.maxCorner.y - building.minCorner.y;
    const base = buildingBaseHeight(city, building);
    const cx = (building.minCorner.x + building.maxCorner.x) / 2;
    const cz = (building.minCorner.y + building.maxCorner.y) / 2;
    // Montón irregular: bloques caídos dentro de la propia parcela.
    for (let i = 0; i < 6; i++) {
      const r = hazardHash(`rubble:${buildingId}:${i}`);
      const chunk = new THREE.Mesh(
        rubbleChunks,
        i % 3 === 0 ? dustMaterial : rubbleMaterial,
      );
      chunk.position.set(
        cx + (r - 0.5) * w * 0.8,
        base + 0.4 + r * Math.min(2.2, building.heightInMeters * 0.12),
        cz + (hazardHash(`rubble-z:${buildingId}:${i}`) - 0.5) * d * 0.8,
      );
      chunk.scale.set(
        1.6 + r * w * 0.32,
        0.7 + r * 1.5,
        1.4 + hazardHash(`rubble-s:${buildingId}:${i}`) * d * 0.3,
      );
      chunk.rotation.y = r * Math.PI;
      chunk.castShadow = chunk.receiveShadow = true;
      pile.add(chunk);
    }
    pile.visible = false;
    rubbleByBuilding.set(buildingId, pile);
    group.add(pile);
    return pile;
  }

  // --- Restos sobre calles cortadas por derrumbes ----------------------
  const debrisByEdge = new Map<string, THREE.Group>();
  function debrisFor(edgeId: string): THREE.Group {
    const existing = debrisByEdge.get(edgeId);
    if (existing) return existing;
    const edge = edgeById.get(edgeId)!;
    const from = nodes.get(edge.from)!;
    const to = nodes.get(edge.to)!;
    const pile = new THREE.Group();
    pile.name = `hazard-debris:${edgeId}`;
    for (const t of [0.25, 0.5, 0.75]) {
      const x = from.x + (to.x - from.x) * t;
      const z = from.y + (to.y - from.y) * t;
      const chunk = new THREE.Mesh(rubbleChunks, rubbleMaterial);
      chunk.position.set(x, sampleTerrainHeight(city, x, z) + 0.35, z);
      chunk.scale.set(2.2, 0.7, 1.6);
      chunk.rotation.y = hazardHash(`${edgeId}:${t}`) * Math.PI;
      chunk.castShadow = true;
      pile.add(chunk);
    }
    pile.visible = false;
    debrisByEdge.set(edgeId, pile);
    group.add(pile);
    return pile;
  }

  // --- Grietas del terremoto -------------------------------------------
  if (hazard === 'earthquake') {
    const points: number[] = [];
    const center = { x: width / 2, z: height / 2 };
    for (let branch = 0; branch < 7; branch++) {
      const angle = (branch / 7) * Math.PI * 2 + 0.35;
      let x = center.x;
      let z = center.z;
      for (let step = 1; step <= 7; step++) {
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
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(points, 3),
    );
    const cracks = new THREE.LineSegments(
      geometry,
      own(new THREE.LineBasicMaterial({ color: 0x2e2118 })),
    );
    cracks.name = 'earthquake-cracks';
    group.add(cracks);
  }

  // --- Estelas de viento -------------------------------------------------
  let windStreaks: THREE.LineSegments | null = null;
  let windPositions: Float32Array | null = null;
  let windSeeds: Float32Array | null = null;
  if (hazard === 'strong-wind') {
    const count = 110;
    windSeeds = new Float32Array(count * 3);
    for (let i = 0; i < windSeeds.length; i++)
      windSeeds[i] = hazardHash(`wind:${i}`);
    windPositions = new Float32Array(count * 6);
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(windPositions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    windStreaks = new THREE.LineSegments(
      geometry,
      own(
        new THREE.LineBasicMaterial({
          color: 0xf4fbff,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        }),
      ),
    );
    windStreaks.name = 'wind-streaks';
    windStreaks.frustumCulled = false;
    group.add(windStreaks);
  }

  // --- Ola del tsunami: superficie curvada con espuma --------------------
  // La cresta se curva hacia adelante (como una ola rompiendo) y ondula a
  // lo largo de la costa; la espuma marca cresta y pie. Su posición X la
  // dicta el frente de agua del solver vía setWaveFront().
  let wave: THREE.Group | null = null;
  let waveFoam: THREE.Points | null = null;
  let waveTargetX = -20;
  let waveMaxDepth = 0;
  if (hazard === 'tsunami') {
    wave = new THREE.Group();
    wave.name = 'tsunami-wave';
    const segmentsZ = 48;
    const segmentsY = 5;
    const waveHeight = 6.5;
    const positions: number[] = [];
    const indices: number[] = [];
    const crestAt = (z: number, yRatio: number) =>
      Math.sin(yRatio * Math.PI * 0.62) * 2.6 * yRatio +
      Math.sin(z * 0.045) * 0.8 * yRatio;
    for (let iz = 0; iz <= segmentsZ; iz++) {
      const z = -height * 0.55 + (iz / segmentsZ) * height * 1.1;
      for (let iy = 0; iy <= segmentsY; iy++) {
        const yRatio = iy / segmentsY;
        positions.push(crestAt(z, yRatio), yRatio * waveHeight, z);
      }
    }
    for (let iz = 0; iz < segmentsZ; iz++)
      for (let iy = 0; iy < segmentsY; iy++) {
        const a = iz * (segmentsY + 1) + iy;
        const b = a + segmentsY + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const surface = new THREE.Mesh(
      geometry,
      own(
        new THREE.MeshStandardMaterial({
          color: 0x2aa4cf,
          transparent: true,
          opacity: 0.68,
          roughness: 0.15,
          metalness: 0.05,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      ),
    );
    surface.name = 'tsunami-wave-surface';
    wave.add(surface);
    // Espuma: puntos en la cresta y en el pie de la ola.
    const foamPositions: number[] = [];
    for (let iz = 0; iz <= segmentsZ; iz += 2) {
      const z = -height * 0.55 + (iz / segmentsZ) * height * 1.1;
      foamPositions.push(crestAt(z, 1) + 0.3, waveHeight + 0.25, z);
      foamPositions.push(crestAt(z, 0) - 0.6, 0.3, z);
    }
    const foamGeometry = own(new THREE.BufferGeometry());
    foamGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(foamPositions, 3),
    );
    waveFoam = new THREE.Points(
      foamGeometry,
      own(
        new THREE.PointsMaterial({
          color: 0xffffff,
          size: 1.7,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        }),
      ),
    );
    waveFoam.name = 'tsunami-foam';
    wave.add(waveFoam);
    wave.position.set(-20, ground + 0.2, height / 2);
    wave.visible = false;
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
    /** Aplica el estado físico actual de la simulación. */
    update(
      impacts: readonly BuildingImpact[],
      collapsedBlockedRoadIds: readonly string[],
    ) {
      const byId = new Map(impacts.map((item) => [item.buildingId, item]));
      for (const [id, mesh] of damagedMeshes) {
        const impact = byId.get(id);
        mesh.visible = impact?.condition === 'damaged';
      }
      for (const impact of impacts) {
        if (impact.condition !== 'collapsed') continue;
        const pile = rubbleFor(impact.buildingId);
        if (!pile.visible) {
          pile.visible = true;
          rubbleGrowth.set(impact.buildingId, 0);
          pile.scale.setScalar(0.15);
        }
      }
      for (const [id, pile] of rubbleByBuilding) {
        if (byId.get(id)?.condition !== 'collapsed') pile.visible = false;
      }
      const blocked = new Set(collapsedBlockedRoadIds);
      for (const edgeId of blocked) debrisFor(edgeId).visible = true;
      for (const [edgeId, pile] of debrisByEdge)
        if (!blocked.has(edgeId)) pile.visible = false;
    },
    /** Frente de agua real del solver: posición y energía de la ola. */
    setWaveFront(frontXInMeters: number, maxDepthInMeters: number) {
      waveTargetX = frontXInMeters;
      waveMaxDepth = maxDepthInMeters;
    },
    animate(delta: number, running: boolean) {
      if (!Number.isFinite(delta) || delta <= 0 || disposed) return;
      if (running) elapsed += delta;
      if (windStreaks && running) writeWind();
      // Los escombros crecen hasta su tamaño en ~0,9 s reales.
      for (const [id, growth] of rubbleGrowth) {
        if (growth >= 1) continue;
        const next = Math.min(1, growth + delta / 0.9);
        rubbleGrowth.set(id, next);
        rubbleByBuilding.get(id)?.scale.setScalar(0.15 + 0.85 * next);
      }
      if (wave) {
        const hasWater = waveMaxDepth > 0.05 && waveTargetX > -10;
        wave.visible = hasWater;
        if (hasWater) {
          // La ola persigue al frente del solver y respira sobre él.
          wave.position.x +=
            (waveTargetX - wave.position.x) * Math.min(1, delta * 3);
          wave.position.y = ground + 0.2 + Math.sin(elapsed * 2.1) * 0.18;
          const energy = Math.max(0.45, Math.min(2.2, waveMaxDepth * 1.4));
          wave.scale.set(1, energy, 1);
          if (waveFoam) {
            const material = waveFoam.material as THREE.PointsMaterial;
            material.size = 1.4 + Math.abs(Math.sin(elapsed * 3)) * 0.7;
          }
        }
      }
    },
    reset() {
      elapsed = 0;
      writeWind();
      rubbleGrowth.clear();
      for (const pile of rubbleByBuilding.values()) pile.visible = false;
      for (const pile of debrisByEdge.values()) pile.visible = false;
      if (wave) {
        wave.position.set(-20, ground + 0.2, height / 2);
        wave.visible = false;
        waveTargetX = -20;
        waveMaxDepth = 0;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const item of disposables) item.dispose();
      group.clear();
    },
  };
}
