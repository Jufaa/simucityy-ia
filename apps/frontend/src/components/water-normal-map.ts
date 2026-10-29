import * as THREE from 'three';

/** Tileable normals create moving highlights without displacing the water surface. */
export function createWaterNormals() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const normal = new THREE.Vector3();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      normal
        .set(0.35 * Math.cos(u * 3 + v * 2), 0.3 * Math.sin(v * 4 - u), 1)
        .normalize();
      const offset = (y * size + x) * 4;
      data[offset] = (normal.x * 0.5 + 0.5) * 255;
      data[offset + 1] = (normal.y * 0.5 + 0.5) * 255;
      data[offset + 2] = (normal.z * 0.5 + 0.5) * 255;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.repeat.set(3, 3);
  texture.needsUpdate = true;
  return texture;
}
