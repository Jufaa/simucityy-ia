import * as THREE from 'three';

export type AtmosphereMood = 'clear' | 'storm' | 'tsunami' | 'dust' | 'wind';

const MOODS: Record<
  AtmosphereMood,
  { zenith: number; horizon: number; cloud: number; cloudOpacity: number }
> = {
  clear: {
    zenith: 0x6fa8cf,
    horizon: 0xdfeef2,
    cloud: 0xffffff,
    cloudOpacity: 0.5,
  },
  storm: {
    zenith: 0x5d707c,
    horizon: 0xb9cdd4,
    cloud: 0x9fb2ba,
    cloudOpacity: 0.72,
  },
  tsunami: {
    zenith: 0x4d748c,
    horizon: 0xc3d8dc,
    cloud: 0xa8c2c8,
    cloudOpacity: 0.6,
  },
  dust: {
    zenith: 0x9a8a72,
    horizon: 0xe3d3ae,
    cloud: 0xcbb98f,
    cloudOpacity: 0.55,
  },
  wind: {
    zenith: 0x7e97a3,
    horizon: 0xd5e2df,
    cloud: 0xd8e2e0,
    cloudOpacity: 0.62,
  },
};

/**
 * Cielo en degradado y nubes bajas a la deriva. Es solo presentación:
 * no toca terreno, agua de simulación ni entidades de la ciudad.
 */
export function createCityAtmosphere(
  center: { x: number; z: number },
  extentInMeters: number,
  mood: AtmosphereMood = 'clear',
) {
  const group = new THREE.Group();
  group.name = 'city-atmosphere';
  const palette = MOODS[mood];
  const radius = Math.max(400, extentInMeters * 2.4);
  const skyGeometry = new THREE.SphereGeometry(radius, 24, 12);
  const positions = skyGeometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const zenith = new THREE.Color(palette.zenith);
  const horizon = new THREE.Color(palette.horizon);
  const mixed = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const t = Math.max(0, Math.min(1, positions.getY(i) / radius / 2 + 0.5));
    mixed.copy(horizon).lerp(zenith, Math.pow(t, 0.75));
    colors.set([mixed.r, mixed.g, mixed.b], i * 3);
  }
  skyGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const skyMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.name = 'sky-dome';
  sky.position.set(center.x, 0, center.z);
  sky.renderOrder = -10;
  group.add(sky);

  let seed = 987654321;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const cloudCount = 14;
  const cloudGeometry = new THREE.SphereGeometry(1, 10, 7);
  const cloudMaterial = new THREE.MeshBasicMaterial({
    color: palette.cloud,
    transparent: true,
    opacity: palette.cloudOpacity,
    depthWrite: false,
    fog: false,
  });
  const clouds = new THREE.InstancedMesh(
    cloudGeometry,
    cloudMaterial,
    cloudCount,
  );
  clouds.name = 'clouds';
  clouds.frustumCulled = false;
  const cloudData = Array.from({ length: cloudCount }, () => ({
    x: center.x + (random() - 0.5) * extentInMeters * 1.1,
    y: extentInMeters * (0.3 + random() * 0.22),
    z: center.z + (random() - 0.5) * extentInMeters * 1.1,
    scaleX: 90 + random() * 120,
    scaleZ: 40 + random() * 60,
    speed: 1.5 + random() * 2.5,
  }));
  const transform = new THREE.Object3D();
  const writeClouds = () => {
    cloudData.forEach((cloud, index) => {
      transform.position.set(cloud.x, cloud.y, cloud.z);
      transform.scale.set(cloud.scaleX, 12, cloud.scaleZ);
      transform.rotation.set(0, 0, 0);
      transform.updateMatrix();
      clouds.setMatrixAt(index, transform.matrix);
    });
    clouds.instanceMatrix.needsUpdate = true;
  };
  writeClouds();
  group.add(clouds);
  let disposed = false;
  return {
    group,
    animate(delta: number) {
      if (!Number.isFinite(delta) || delta <= 0 || disposed) return;
      const span = extentInMeters * 1.3;
      for (const cloud of cloudData) {
        cloud.x += cloud.speed * delta;
        if (cloud.x - center.x > span / 2) cloud.x -= span;
      }
      writeClouds();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      skyGeometry.dispose();
      skyMaterial.dispose();
      cloudGeometry.dispose();
      cloudMaterial.dispose();
      clouds.dispose();
      group.clear();
    },
  };
}
