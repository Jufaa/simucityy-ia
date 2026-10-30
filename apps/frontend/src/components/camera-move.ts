import * as THREE from 'three';

const FORWARD_KEYS = ['w', 'arrowup'];
const BACK_KEYS = ['s', 'arrowdown'];
const LEFT_KEYS = ['a', 'arrowleft'];
const RIGHT_KEYS = ['d', 'arrowright'];
const UP_KEYS = ['e'];
const DOWN_KEYS = ['q'];

const anyPressed = (keys: ReadonlySet<string>, candidates: string[]) =>
  candidates.some((key) => keys.has(key));

/**
 * Free camera translation: moves the camera and the orbit target by the same
 * ground-plane offset, so after panning/flying the user orbits around the new
 * spot instead of being pulled back to the original fixed point.
 */
export function applyCameraMove(
  camera: THREE.Camera,
  target: THREE.Vector3,
  keys: ReadonlySet<string>,
  deltaSeconds: number,
  unitsPerSecond: number,
): boolean {
  if (!(deltaSeconds > 0) || !(unitsPerSecond > 0)) return false;
  const forward = new THREE.Vector3()
    .subVectors(target, camera.position)
    .setY(0);
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(
    forward,
    new THREE.Vector3(0, 1, 0),
  );
  const offset = new THREE.Vector3();
  if (anyPressed(keys, FORWARD_KEYS)) offset.add(forward);
  if (anyPressed(keys, BACK_KEYS)) offset.sub(forward);
  if (anyPressed(keys, RIGHT_KEYS)) offset.add(right);
  if (anyPressed(keys, LEFT_KEYS)) offset.sub(right);
  if (anyPressed(keys, UP_KEYS)) offset.y += 1;
  if (anyPressed(keys, DOWN_KEYS)) offset.y -= 1;
  if (offset.lengthSq() === 0) return false;
  offset.normalize().multiplyScalar(unitsPerSecond * deltaSeconds);
  camera.position.add(offset);
  target.add(offset);
  return true;
}

/** True when a key event comes from a form field and must not move the camera. */
export function isFormFieldEvent(event: KeyboardEvent): boolean {
  const target = event.target;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
