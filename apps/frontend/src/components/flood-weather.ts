import * as THREE from 'three';

/** Decorative rain; simulation depth continues to come exclusively from FloodEngine. */
export function createFloodWeather(
  extent: { widthInMeters: number; heightInMeters: number },
  ground: number,
  tallestBuilding: number,
) {
  const group = new THREE.Group();
  group.name = 'storm-weather';
  group.visible = false;
  const count = 4200;
  const height = Math.max(180, tallestBuilding + 100);
  const width = extent.widthInMeters + 100;
  const depth = extent.heightInMeters + 100;
  const positions = new Float32Array(count * 6);
  const seeds = new Float32Array(count * 3);
  let seed = 123;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < seeds.length; i++) seeds[i] = random();
  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(positions, 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  geometry.setAttribute('position', attribute);
  const material = new THREE.LineBasicMaterial({
    color: 0xc4e8ff,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const rain = new THREE.LineSegments(geometry, material);
  rain.name = 'flood-rain';
  rain.frustumCulled = false;
  group.add(rain);
  let elapsed = 0;
  const wrap = (value: number, span: number) => ((value % span) + span) % span;
  function writePositions() {
    for (let i = 0; i < count; i++) {
      const x = wrap(seeds[i * 3]! * width + elapsed * 18, width) - 50;
      const y =
        ground + wrap(seeds[i * 3 + 1]! * height - elapsed * 100, height);
      const z = wrap(seeds[i * 3 + 2]! * depth + elapsed * 6, depth) - 50;
      positions.set([x, y, z, x + 1.08, y - 6, z + 0.36], i * 6);
    }
    attribute.needsUpdate = true;
  }
  writePositions();
  return {
    group,
    animate(delta: number, active: boolean, running: boolean) {
      group.visible = active;
      if (!active) {
        if (elapsed !== 0) {
          elapsed = 0;
          writePositions();
        }
      } else if (running && Number.isFinite(delta) && delta > 0) {
        elapsed += delta;
        writePositions();
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
