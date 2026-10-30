import { expect, it } from 'vitest';
import * as THREE from 'three';
import { applyCameraMove } from './camera-move';

const setup = () => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 50, 100);
  const target = new THREE.Vector3(0, 0, 0);
  camera.lookAt(target);
  return { camera, target };
};

it('moves camera and target together so the orbit point travels', () => {
  const { camera, target } = setup();
  const before = camera.position.clone();
  expect(applyCameraMove(camera, target, new Set(['w']), 0.5, 40)).toBe(true);
  // Forward is -z on the ground plane; both endpoints shift identically.
  expect(target.z).toBeCloseTo(-20);
  expect(camera.position.z).toBeCloseTo(80);
  expect(camera.position.clone().sub(target)).toEqual(before.clone().setY(50));
});

it('strafes, rises and normalizes diagonals', () => {
  const { camera, target } = setup();
  applyCameraMove(camera, target, new Set(['d', 'w']), 1, 10);
  const moved = target.length();
  expect(moved).toBeCloseTo(10);
  expect(target.x).toBeGreaterThan(0);
  applyCameraMove(camera, target, new Set(['e']), 1, 5);
  expect(target.y).toBeCloseTo(5);
  expect(camera.position.y).toBeCloseTo(55);
});

it('does nothing without keys or time', () => {
  const { camera, target } = setup();
  expect(applyCameraMove(camera, target, new Set(), 1, 10)).toBe(false);
  expect(applyCameraMove(camera, target, new Set(['w']), 0, 10)).toBe(false);
  expect(target).toEqual(new THREE.Vector3(0, 0, 0));
});
