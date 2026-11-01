import { expect, it } from 'vitest';
import {
  citizenAppearance,
  createCitizenGait,
  writeCitizenGait,
} from './citizen-anatomy';

it('derives stable skin, hair and clothing from identity without runtime randomness', () => {
  const first = citizenAppearance('person-1');
  expect(citizenAppearance('person-1')).toEqual(first);
  const people = Array.from({ length: 30 }, (_, i) =>
    citizenAppearance(`person-${i}`),
  );
  expect(new Set(people.map((p) => p.shirt)).size).toBeGreaterThan(2);
  expect(new Set(people.map((p) => p.skin)).size).toBeGreaterThan(2);
  expect(new Set(people.map((p) => p.trousers)).size).toBeGreaterThan(1);
});

it('articulates opposed shoulders and knees while keeping stance feet grounded', () => {
  const gait = createCitizenGait();
  for (let phase = 0; phase < Math.PI * 2; phase += 0.1) {
    writeCitizenGait(gait, phase, true);
    expect(gait.left.knee).toBeGreaterThanOrEqual(0);
    expect(gait.right.knee).toBeGreaterThanOrEqual(0);
    expect(gait.left.footY).toBeGreaterThanOrEqual(0.1);
    expect(gait.right.footY).toBeGreaterThanOrEqual(0.1);
    expect(Math.min(gait.left.footY, gait.right.footY)).toBeCloseTo(0.1);
    expect(gait.left.arm).toBeCloseTo(-gait.right.arm);
    // Reconstruct both ankle positions from their hip and knee angles.
    for (const leg of [gait.left, gait.right]) {
      const ankleY =
        1 +
        gait.rootY -
        0.45 * Math.cos(leg.hip) -
        0.45 * Math.cos(leg.hip + leg.knee);
      const ankleZ =
        -0.45 * Math.sin(leg.hip) - 0.45 * Math.sin(leg.hip + leg.knee);
      expect(ankleY).toBeCloseTo(leg.footY, 5);
      expect(ankleZ).toBeCloseTo(leg.footZ, 5);
    }
  }
  writeCitizenGait(gait, 2, false);
  expect(gait.rootY).toBe(0);
  expect(gait.left.hip).toBe(0);
  expect(gait.left.knee).toBe(0);
  expect(gait.left.footZ).toBe(0);
});
