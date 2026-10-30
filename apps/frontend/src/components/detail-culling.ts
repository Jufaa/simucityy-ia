import type * as THREE from 'three';

/** Sub-metre details that are invisible from a city-wide view. */
export const DETAIL_NAME_PREFIXES = [
  'building-doors',
  'building-storefronts',
  'building-sign-',
  'balcony-rails',
  'balcony-slabs',
  'street-',
  'bench-',
  'lamp-heads',
] as const;

export function collectDetailObjects(root: THREE.Object3D): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (DETAIL_NAME_PREFIXES.some((prefix) => object.name.startsWith(prefix)))
      found.push(object);
  });
  return found;
}

/** Details render only when the camera is close enough for them to resolve. */
export function detailsVisible(
  cameraDistanceInMeters: number,
  viewExtentInMeters: number,
): boolean {
  return cameraDistanceInMeters < viewExtentInMeters * 1.1;
}
