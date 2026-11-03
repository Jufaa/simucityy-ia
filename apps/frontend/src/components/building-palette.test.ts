import { expect, it } from 'vitest';
import {
  buildingTint,
  roofColorForBuilding,
  ROOF_COLORS,
} from './building-palette';

it('gives a stable near-white tint per building id', () => {
  const first = buildingTint('real-building-17');
  expect(buildingTint('real-building-17')).toEqual(first);
  for (const channel of first) {
    expect(channel).toBeGreaterThanOrEqual(0.78);
    expect(channel).toBeLessThanOrEqual(1.02);
  }
});

it('varies tints and roof colours across buildings', () => {
  const ids = Array.from({ length: 40 }, (_, i) => `real-building-${i}`);
  expect(
    new Set(ids.map((id) => buildingTint(id).join(','))).size,
  ).toBeGreaterThan(20);
  const roofs = new Set(ids.map((id) => roofColorForBuilding(id)));
  expect(roofs.size).toBeGreaterThan(2);
  for (const roof of roofs) expect(ROOF_COLORS).toContain(roof);
});

it('keeps tints warm and subtle (no pastel casts)', () => {
  for (let i = 0; i < 60; i++) {
    const [r, g, b] = buildingTint(`real-building-${i}`);
    expect(r).toBeGreaterThanOrEqual(g);
    expect(g).toBeGreaterThanOrEqual(b);
    expect(r).toBeGreaterThanOrEqual(0.86);
    expect(b).toBeGreaterThanOrEqual(0.78);
  }
});

it('makes neutral roofs the majority and terracotta the accent', () => {
  const ids = Array.from({ length: 200 }, (_, i) => `real-building-${i}`);
  const terracotta = ids.filter(
    (id) => roofColorForBuilding(id) === 0x8c4c39,
  ).length;
  expect(terracotta).toBeLessThan(50);
});
