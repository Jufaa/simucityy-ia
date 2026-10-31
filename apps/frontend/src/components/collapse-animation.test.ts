import { expect, it } from 'vitest';
import {
  collapseDurationSeconds,
  collapseEase,
  collapsePose,
} from './collapse-animation';

it('creeps first, then falls with gravitational acceleration', () => {
  expect(collapseEase(0)).toBe(0);
  expect(collapseEase(1)).toBeCloseTo(1);
  // La fase de agrietamiento apenas mueve el edificio.
  expect(collapseEase(0.18)).toBeCloseTo(0.045);
  // La segunda mitad del tiempo produce la mayor parte de la caída.
  expect(collapseEase(0.9) - collapseEase(0.5)).toBeGreaterThan(
    collapseEase(0.5) - collapseEase(0.18),
  );
  const samples = Array.from({ length: 11 }, (_, i) => collapseEase(i / 10));
  for (let i = 1; i < samples.length; i++)
    expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]!);
});

it('poses the fall in phases: lean on the base edge, then pancake down', () => {
  expect(collapsePose(0)).toEqual({ tiltFactor: 0, scaleY: 1, driftFactor: 0 });
  const mid = collapsePose(0.5);
  // A mitad de caída ya se inclinó bastante pero apenas se comprimió.
  expect(mid.tiltFactor).toBeGreaterThan(0.5);
  expect(mid.scaleY).toBeGreaterThan(0.85);
  const end = collapsePose(1);
  expect(end.scaleY).toBeCloseTo(0.32);
  // Al final la inclinación se asienta sobre los escombros.
  expect(end.tiltFactor).toBeLessThan(collapsePose(0.8).tiltFactor);
  expect(end.driftFactor).toBe(1);
});

it('scales fall duration with building height', () => {
  expect(collapseDurationSeconds(4)).toBeCloseTo(1.8);
  expect(collapseDurationSeconds(40)).toBeCloseTo(3);
  expect(collapseDurationSeconds(Number.NaN)).toBeCloseTo(2);
});
