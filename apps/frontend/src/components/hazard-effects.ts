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
/** One solver row of the tsunami front: where the water reached and how hard. */
export interface WaveProfileSample {
  readonly zInMeters: number;
  readonly frontXInMeters: number;
  readonly depthInMeters: number;
  readonly speedInMetersPerSecond: number;
}

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

  // --- Ola del tsunami: superficie que sigue el frente real por filas ----
  // El solver dicta, para cada fila de la malla, hasta dónde llegó el agua,
  // con qué profundidad y velocidad (setWaveProfile). La superficie se
  // deforma con ese perfil: avanza más por las calles, se frena y pierde
  // altura contra los edificios (celdas bloqueadas) en vez de cruzar la
  // ciudad como un rectángulo rígido.
  let wave: THREE.Group | null = null;
  let waveFoam: THREE.Points | null = null;
  let waveGeometry: THREE.BufferGeometry | null = null;
  let foamGeometry: THREE.BufferGeometry | null = null;
  const WAVE_SEGMENTS_Z = 48;
  const WAVE_SEGMENTS_Y = 5;
  const WAVE_MAX_HEIGHT = 6.5;
  let waveTargets: { front: number; depth: number; speed: number }[] = [];
  let waveCurrent: { front: number; depth: number; speed: number }[] = [];
  let waveVelocity: number[] = [];
  let waveMaxSpeed = 0;
  const crestLean = (yRatio: number) =>
    Math.sin(yRatio * Math.PI * 0.62) * 2.6 * yRatio;
  const writeWaveGeometry = () => {
    if (!waveGeometry || !foamGeometry || !waveCurrent.length) return;
    const positions = waveGeometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute;
    for (let iz = 0; iz <= WAVE_SEGMENTS_Z; iz++) {
      const current = waveCurrent[iz]!;
      const z = -height * 0.55 + (iz / WAVE_SEGMENTS_Z) * height * 1.1;
      // La cresta crece con la profundidad y con la velocidad del frente:
      // donde el agua golpea un edificio pierde velocidad y se desploma.
      const energy = Math.max(
        0.18,
        Math.min(1.2, 0.22 + current.depth * 0.5 + current.speed * 0.1),
      );
      for (let iy = 0; iy <= WAVE_SEGMENTS_Y; iy++) {
        const yRatio = iy / WAVE_SEGMENTS_Y;
        const vertex = iz * (WAVE_SEGMENTS_Y + 1) + iy;
        const churn =
          Math.sin(elapsed * 2.6 + iz * 0.7) * 0.28 * yRatio +
          Math.sin(z * 0.045) * 0.8 * yRatio;
        positions.setXYZ(
          vertex,
          current.front + crestLean(yRatio) + churn,
          yRatio * WAVE_MAX_HEIGHT * energy,
          z,
        );
      }
    }
    positions.needsUpdate = true;
    waveGeometry.computeVertexNormals();
    const foam = foamGeometry.getAttribute('position') as THREE.BufferAttribute;
    let foamIndex = 0;
    for (let iz = 0; iz <= WAVE_SEGMENTS_Z; iz += 2) {
      const current = waveCurrent[iz]!;
      const z = -height * 0.55 + (iz / WAVE_SEGMENTS_Z) * height * 1.1;
      const energy = Math.max(
        0.18,
        Math.min(1.2, 0.22 + current.depth * 0.5 + current.speed * 0.1),
      );
      foam.setXYZ(
        foamIndex++,
        current.front + crestLean(1) + 0.3,
        WAVE_MAX_HEIGHT * energy + 0.25,
        z,
      );
      foam.setXYZ(foamIndex++, current.front - 0.6, 0.3, z);
      // Salpicadura por delante del frente, donde rompe contra el suelo
      // y los primeros edificios.
      foam.setXYZ(
        foamIndex++,
        current.front + 1.6 + Math.sin(elapsed * 3.1 + iz) * 0.5,
        0.55 + current.speed * 0.22,
        z,
      );
    }
    foam.needsUpdate = true;
  };
  if (hazard === 'tsunami') {
    wave = new THREE.Group();
    wave.name = 'tsunami-wave';
    const positions: number[] = [];
    const indices: number[] = [];
    for (let iz = 0; iz <= WAVE_SEGMENTS_Z; iz++) {
      const z = -height * 0.55 + (iz / WAVE_SEGMENTS_Z) * height * 1.1;
      for (let iy = 0; iy <= WAVE_SEGMENTS_Y; iy++)
        positions.push(-20, (iy / WAVE_SEGMENTS_Y) * WAVE_MAX_HEIGHT, z);
    }
    for (let iz = 0; iz < WAVE_SEGMENTS_Z; iz++)
      for (let iy = 0; iy < WAVE_SEGMENTS_Y; iy++) {
        const a = iz * (WAVE_SEGMENTS_Y + 1) + iy;
        const b = a + WAVE_SEGMENTS_Y + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    waveGeometry = own(new THREE.BufferGeometry());
    waveGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    waveGeometry.setIndex(indices);
    waveGeometry.computeVertexNormals();
    const surface = new THREE.Mesh(
      waveGeometry,
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
    surface.frustumCulled = false;
    wave.add(surface);
    // Segunda cresta del tren de olas: misma superficie, 9 m detrás y al
    // 58 % de altura, más transparente.
    const trail = new THREE.Mesh(
      waveGeometry,
      own(
        new THREE.MeshStandardMaterial({
          color: 0x2aa4cf,
          transparent: true,
          opacity: 0.3,
          roughness: 0.2,
          metalness: 0.05,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      ),
    );
    trail.name = 'tsunami-wave-trail';
    trail.frustumCulled = false;
    trail.position.x = -9;
    trail.scale.y = 0.58;
    wave.add(trail);
    // Espuma: puntos en la cresta y en el pie de la ola.
    const foamCount = (Math.floor(WAVE_SEGMENTS_Z / 2) + 1) * 3;
    foamGeometry = own(new THREE.BufferGeometry());
    foamGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(foamCount * 3), 3),
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
    waveFoam.frustumCulled = false;
    wave.add(waveFoam);
    wave.position.set(0, ground + 0.2, height / 2);
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
    /**
     * Frente de agua real del solver por filas: la ola interpola su perfil
     * (avance, profundidad y velocidad por z) hacia estos objetivos.
     */
    setWaveProfile(samples: readonly WaveProfileSample[]) {
      if (!wave) return;
      waveTargets = [];
      waveMaxSpeed = 0;
      for (let iz = 0; iz <= WAVE_SEGMENTS_Z; iz++) {
        const z = (iz / WAVE_SEGMENTS_Z) * height;
        // Interpola el perfil del solver en la z de este segmento.
        let sample = samples.at(-1);
        for (let i = 0; i < samples.length; i++) {
          const current = samples[i]!;
          if (current.zInMeters >= z || i === samples.length - 1) {
            const previous = samples[i - 1];
            if (previous && current.zInMeters > previous.zInMeters) {
              const t =
                (z - previous.zInMeters) /
                (current.zInMeters - previous.zInMeters);
              sample = {
                zInMeters: z,
                frontXInMeters:
                  previous.frontXInMeters +
                  (current.frontXInMeters - previous.frontXInMeters) *
                    Math.max(0, Math.min(1, t)),
                depthInMeters:
                  previous.depthInMeters +
                  (current.depthInMeters - previous.depthInMeters) *
                    Math.max(0, Math.min(1, t)),
                speedInMetersPerSecond:
                  previous.speedInMetersPerSecond +
                  (current.speedInMetersPerSecond -
                    previous.speedInMetersPerSecond) *
                    Math.max(0, Math.min(1, t)),
              };
            } else sample = current;
            break;
          }
        }
        waveTargets.push({
          front: sample?.frontXInMeters ?? -20,
          depth: sample?.depthInMeters ?? 0,
          speed: sample?.speedInMetersPerSecond ?? 0,
        });
        waveMaxSpeed = Math.max(
          waveMaxSpeed,
          sample?.speedInMetersPerSecond ?? 0,
        );
      }
      if (!waveCurrent.length)
        // La ola entra desde fuera de la costa y barre hacia el frente,
        // no aparece ya colocada sobre la primera fila de edificios.
        waveCurrent = waveTargets.map(() => ({
          front: -20,
          depth: 0,
          speed: 0,
        }));
      waveVelocity = waveTargets.map(() => 0);
    },
    animate(delta: number, running: boolean) {
      if (!Number.isFinite(delta) || delta <= 0 || disposed) return;
      if (running) elapsed += delta;
      if (windStreaks && running) writeWind();
      // Los escombros crecen hasta su tamaño en ~2,2 s, al ritmo del derrumbe.
      for (const [id, growth] of rubbleGrowth) {
        if (growth >= 1) continue;
        const next = Math.min(1, growth + delta / 2.2);
        rubbleGrowth.set(id, next);
        rubbleByBuilding.get(id)?.scale.setScalar(0.15 + 0.85 * next);
      }
      if (wave) {
        const hasWater = waveTargets.some(
          (target) => target.depth > 0.05 && target.front > -10,
        );
        wave.visible = hasWater;
        if (hasWater && waveCurrent.length) {
          // Cada tramo persigue su frente del solver con un resorte
          // subamortiguado: la ola acelera, sobrepasa un poco y se asienta
          // contra los edificios en vez de deslizarse a velocidad constante.
          const blend = Math.min(1, delta * 3);
          const step = Math.min(delta, 0.05);
          for (let iz = 0; iz < waveCurrent.length; iz++) {
            const current = waveCurrent[iz]!;
            const target = waveTargets[iz]!;
            let velocity = waveVelocity[iz] ?? 0;
            velocity +=
              ((target.front - current.front) * 7 - velocity * 3.2) * step;
            velocity = Math.max(-60, Math.min(60, velocity));
            waveVelocity[iz] = velocity;
            current.front += velocity * step;
            current.depth += (target.depth - current.depth) * blend;
            current.speed += (target.speed - current.speed) * blend;
          }
          writeWaveGeometry();
          wave.position.y = ground + 0.2 + Math.sin(elapsed * 2.1) * 0.18;
          if (waveFoam) {
            const material = waveFoam.material as THREE.PointsMaterial;
            material.size =
              1.3 +
              Math.min(1.2, waveMaxSpeed * 0.25) +
              Math.abs(Math.sin(elapsed * 3)) * 0.6;
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
        wave.position.set(0, ground + 0.2, height / 2);
        wave.visible = false;
        waveTargets = [];
        waveCurrent = [];
        waveVelocity = [];
        waveMaxSpeed = 0;
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
