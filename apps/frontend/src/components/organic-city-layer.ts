import * as THREE from 'three';
import { getRoadProfile } from './road-profile';
import type { CityResponse } from './city-types';
import {
  createTerrainGeometry,
  sampleTerrainHeight,
  drapeSurfaceLayer,
} from './terrain-view';
import { createWaterNormals } from './water-normal-map';

/** Owns local permanent water, road shoulders and explicit bridge decks. */
export function createOrganicCityLayer(city: CityResponse) {
  const group = new THREE.Group();
  group.name = 'organic-geography';
  const resources = new Set<{ dispose(): void }>();
  const own = <T extends { dispose(): void }>(item: T): T => {
    resources.add(item);
    return item;
  };
  const normals = own(createWaterNormals());
  const geography = city.organic;
  if (geography && city.terrainGrid) {
    const terrain = createTerrainGeometry(city);
    const source = terrain.getAttribute('position');
    const indices = terrain.getIndex()!;
    const positions: number[] = [],
      uv: number[] = [];
    const level = geography.lake.level;
    // Connected lake/channel use one level. Clip against the displayed terrain triangles.
    for (let i = 0; i < indices.count; i += 3) {
      const triangle = [0, 1, 2].map((n) =>
        new THREE.Vector3().fromBufferAttribute(source, indices.getX(i + n)),
      );
      const polygon: THREE.Vector3[] = [];
      triangle.forEach((a, j) => {
        const b = triangle[(j + 1) % 3]!;
        if (a.y <= level) polygon.push(a);
        if ((a.y < level && b.y > level) || (a.y > level && b.y < level))
          polygon.push(a.clone().lerp(b, (level - a.y) / (b.y - a.y)));
      });
      for (let j = 1; j < polygon.length - 1; j++)
        for (const p of [polygon[0]!, polygon[j]!, polygon[j + 1]!]) {
          positions.push(p.x, level, p.z);
          uv.push(p.x / 30, p.z / 30);
        }
    }
    terrain.dispose();
    const waterGeometry = own(new THREE.BufferGeometry());
    waterGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    waterGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    waterGeometry.computeVertexNormals();
    const waterMaterial = own(
      new THREE.MeshStandardMaterial({
        color: 0x247d99,
        roughness: 0.27,
        metalness: 0.12,
        normalMap: normals,
        normalScale: new THREE.Vector2(0.1, 0.1),
        side: THREE.DoubleSide,
      }),
    );
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.name = 'organic-water';
    group.add(water);
    const box = own(new THREE.BoxGeometry(1, 1, 1));
    const asphalt = own(
      new THREE.MeshStandardMaterial({ color: 0x464c52, roughness: 0.95 }),
    );
    const concrete = own(
      new THREE.MeshStandardMaterial({ color: 0xbcbdb6, roughness: 0.9 }),
    );
    const paint = own(
      new THREE.MeshStandardMaterial({ color: 0xf1dfad, roughness: 0.8 }),
    );
    const grass = own(
      new THREE.MeshStandardMaterial({ color: 0x74925c, roughness: 1 }),
    );
    const bridgeSteel = own(
      new THREE.MeshStandardMaterial({
        color: 0x385c69,
        metalness: 0.65,
        roughness: 0.4,
      }),
    );
    // Emissive surfaces, not dynamic lights or additional shadow maps.
    const bridgeLight = own(
      new THREE.MeshStandardMaterial({
        color: 0xffe0a6,
        emissive: 0xffc16b,
        emissiveIntensity: 1.8,
        roughness: 0.5,
      }),
    );
    const bridgeRoads = new Set(geography.bridges.flatMap((b) => b.roadIds));
    // Wide thin shoulders sit below the separately rendered asphalt, never across the water.
    for (const road of city.roads) {
      if (bridgeRoads.has(road.id)) continue;
      const dx = road.end.x - road.start.x,
        dz = road.end.y - road.start.y;
      const profile = getRoadProfile(
        road,
        city.district?.roadWidthInMeters ?? 6,
        city.district?.sidewalkWidthInMeters ?? 2,
      );
      const geometry = new THREE.BoxGeometry(
        Math.hypot(dx, dz),
        0.025,
        profile.widthInMeters + 2 * profile.sidewalkWidthInMeters,
      );
      const mesh = new THREE.Mesh(geometry, concrete);
      mesh.name = `organic-sidewalk:${road.id}`;
      mesh.position.set(
        (road.start.x + road.end.x) / 2,
        city.terrain.elevationInMeters + 0.01,
        (road.start.y + road.end.y) / 2,
      );
      mesh.rotation.y = -Math.atan2(dz, dx);
      const draped = drapeSurfaceLayer(mesh, city);
      resources.add(draped.geometry);
      group.add(draped);
    }
    for (const bridge of geography.bridges) {
      const length = Math.hypot(
        bridge.end.x - bridge.start.x,
        bridge.end.y - bridge.start.y,
      );
      const root = new THREE.Group();
      root.name = `bridge:${bridge.id}`;
      root.position.set(
        (bridge.start.x + bridge.end.x) / 2,
        bridge.deckElevationInMeters,
        (bridge.start.y + bridge.end.y) / 2,
      );
      root.rotation.y = Math.atan2(
        bridge.end.x - bridge.start.x,
        bridge.end.y - bridge.start.y,
      );
      const part = (
        name: string,
        material: THREE.Material,
        x: number,
        y: number,
        z: number,
        w: number,
        h: number,
        d: number,
      ) => {
        const mesh = new THREE.Mesh(box, material);
        mesh.name = name;
        mesh.position.set(x, y, z);
        mesh.scale.set(w, h, d);
        mesh.castShadow = mesh.receiveShadow = true;
        root.add(mesh);
      };
      part(
        'bridge-deck',
        asphalt,
        0,
        -0.22,
        0,
        bridge.widthInMeters,
        0.44,
        length,
      );
      // Above-deck side arches keep the existing transport corridor and water
      // bed untouched. Their geometry is decorative, not a structural model.
      const tubeRadius = Math.min(0.18, bridge.widthInMeters * 0.025);
      const archX = bridge.widthInMeters / 2 - tubeRadius - 0.08;
      const archRise = Math.min(
        14,
        Math.max(3, Math.min(length * 0.06, bridge.widthInMeters * 0.9)),
      );
      const archCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 0.3, -length * 0.48),
        new THREE.Vector3(0, 0.3 + 2 * archRise, 0),
        new THREE.Vector3(0, 0.3, length * 0.48),
      );
      const archGeometry = own(
        new THREE.TubeGeometry(archCurve, 48, tubeRadius, 6, false),
      );
      const hangersPerSide = Math.max(6, Math.min(24, Math.floor(length / 16)));
      const lightsPerSide = Math.max(3, Math.min(12, Math.floor(length / 30)));
      const hangers = own(
        new THREE.InstancedMesh(box, bridgeSteel, 2 * hangersPerSide),
      );
      hangers.name = 'bridge-arch-hangers';
      const lights = own(
        new THREE.InstancedMesh(box, bridgeLight, 2 * lightsPerSide),
      );
      lights.name = 'bridge-landmark-lights';
      const transform = new THREE.Object3D();
      for (const [sideIndex, side] of [-1, 1].entries()) {
        const arch = new THREE.Mesh(archGeometry, bridgeSteel);
        arch.name = 'bridge-side-arch';
        arch.position.x = side * archX;
        arch.castShadow = arch.receiveShadow = true;
        root.add(arch);
        for (let i = 0; i < hangersPerSide; i++) {
          const t = (i + 1) / (hangersPerSide + 1);
          const point = archCurve.getPoint(t);
          const height = point.y - 0.25;
          transform.position.set(side * archX, 0.25 + height / 2, point.z);
          transform.scale.set(0.07, height, 0.07);
          transform.updateMatrix();
          hangers.setMatrixAt(sideIndex * hangersPerSide + i, transform.matrix);
        }
        for (let i = 0; i < lightsPerSide; i++) {
          const t = (i + 1) / (lightsPerSide + 1);
          transform.position.set(side * archX, 0.85, (t - 0.5) * length * 0.96);
          transform.scale.set(0.16, 0.1, 0.4);
          transform.updateMatrix();
          lights.setMatrixAt(sideIndex * lightsPerSide + i, transform.matrix);
        }
        for (const end of [-1, 1])
          part(
            'bridge-landmark-anchor',
            bridgeSteel,
            side * archX,
            0.14,
            end * length * 0.48,
            Math.min(0.28, bridge.widthInMeters * 0.035),
            0.16,
            0.6,
          );
      }
      hangers.instanceMatrix.needsUpdate =
        lights.instanceMatrix.needsUpdate = true;
      hangers.computeBoundingSphere();
      lights.computeBoundingSphere();
      root.add(hangers, lights);
      for (const side of [-1, 1]) {
        const x = side * (bridge.widthInMeters / 2 - 0.18);
        part('bridge-curb', concrete, x, 0.1, 0, 0.35, 0.2, length);
        part('bridge-rail', concrete, x, 1, 0, 0.12, 0.1, length);
        for (let z = -length / 2 + 1; z < length / 2; z += 8)
          part('bridge-post', concrete, x, 0.55, z, 0.12, 1.1, 0.12);
      }
      for (let z = -length / 2 + 3; z < length / 2; z += 8)
        part('bridge-lane-mark', paint, 0, 0.015, z, 0.14, 0.025, 3);
      // Estribos bajo cada extremo del tablero: apoyan el puente sobre el
      // terreno sin tocar la superficie de las calles (nada de losas
      // superpuestas en la conexión; la calzada llega al nudo a la misma
      // cota que el tablero).
      for (const side of [-1, 1] as const) {
        const nodePoint = side === 1 ? bridge.end : bridge.start;
        const groundAtEnd = sampleTerrainHeight(city, nodePoint.x, nodePoint.y);
        const supportHeight = Math.max(
          0.3,
          bridge.deckElevationInMeters - 0.44 - groundAtEnd,
        );
        const abutment = new THREE.Mesh(box, concrete);
        abutment.name = 'bridge-abutment';
        abutment.scale.set(bridge.widthInMeters * 0.82, supportHeight, 2.4);
        abutment.position.set(
          0,
          -0.44 - supportHeight / 2,
          side * (length / 2 - 1.2),
        );
        abutment.castShadow = abutment.receiveShadow = true;
        root.add(abutment);
        // Terraplén de césped bajo el extremo: rellena el hueco entre el
        // tablero plano y el terreno en pendiente para que no se vea el
        // césped "dentro" del puente ni un corte flotante al llegar.
        const embankLength = Math.min(13, length * 0.3);
        const axisX = (bridge.end.x - bridge.start.x) / length;
        const axisZ = (bridge.end.y - bridge.start.y) / length;
        const far = {
          x: nodePoint.x + axisX * side * embankLength,
          y: nodePoint.y + axisZ * side * embankLength,
        };
        const topFar =
          sampleTerrainHeight(city, far.x, far.y) -
          bridge.deckElevationInMeters +
          0.02;
        const topNear = -0.06;
        const embankment = new THREE.Mesh(box, grass);
        embankment.name = 'bridge-embankment';
        embankment.scale.set(bridge.widthInMeters * 1.06, 1.4, embankLength);
        embankment.position.set(
          0,
          (topNear + topFar) / 2 - 0.7,
          side * (length / 2 + embankLength / 2 - 1),
        );
        embankment.rotation.x =
          -side * Math.atan2(topFar - topNear, embankLength);
        embankment.castShadow = embankment.receiveShadow = true;
        root.add(embankment);
      }
      for (const t of [0.3, 0.7]) {
        const x = bridge.start.x + (bridge.end.x - bridge.start.x) * t;
        const z = bridge.start.y + (bridge.end.y - bridge.start.y) * t;
        const height = Math.max(
          0.3,
          bridge.deckElevationInMeters - sampleTerrainHeight(city, x, z),
        );
        part(
          'bridge-pier',
          concrete,
          0,
          -height / 2 - 0.22,
          (t - 0.5) * length,
          1.8,
          height,
          2.2,
        );
      }
      group.add(root);
    }
  }
  let disposed = false;
  return {
    group,
    animate(seconds: number) {
      if (seconds > 0) {
        normals.offset.x += seconds * 0.015;
        normals.offset.y += seconds * 0.008;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const resource of resources) resource.dispose();
      group.clear();
    },
  };
}
