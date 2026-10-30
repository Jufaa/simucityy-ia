import { expect, it } from 'vitest';
import * as THREE from 'three';
import { collectDetailObjects, detailsVisible } from './detail-culling';

it('collects only small-detail objects by name prefix', () => {
  const root = new THREE.Group();
  for (const name of [
    'building-doors@0,0',
    'building-sign-1@0,0',
    'balcony-rails@1,0',
    'street-curb@0,1',
    'tree-crowns@0,0',
    'building-facade-sand@0,0',
  ]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.name = name;
    root.add(mesh);
  }
  expect(collectDetailObjects(root).map((o) => o.name)).toEqual([
    'building-doors@0,0',
    'building-sign-1@0,0',
    'balcony-rails@1,0',
    'street-curb@0,1',
  ]);
});

it('shows details only when the camera is near', () => {
  expect(detailsVisible(100, 200)).toBe(true);
  expect(detailsVisible(300, 200)).toBe(false);
});
