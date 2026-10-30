import { expect, it } from 'vitest';
import {
  AdaptivePixelRatio,
  PIXEL_RATIO_STEPS,
  loadCachedPixelRatio,
  saveCachedPixelRatio,
} from './render-quality';

const fakeStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
};

it('starts at 1.5 on a hi-dpi display and never above the device ratio', () => {
  expect(loadCachedPixelRatio(2, fakeStorage())).toBe(1.5);
  expect(loadCachedPixelRatio(1, fakeStorage())).toBe(1);
});

it('reuses the cached ratio on the next visit, clamped to the device', () => {
  const storage = fakeStorage();
  saveCachedPixelRatio(0.85, storage);
  expect(loadCachedPixelRatio(2, storage)).toBe(0.85);
  expect(loadCachedPixelRatio(0.8, storage)).toBe(0.8);
  saveCachedPixelRatio(99, storage);
  expect(loadCachedPixelRatio(2, storage)).toBe(PIXEL_RATIO_STEPS[0]);
});

it('steps down while slow and only back up after sustained fast seconds', () => {
  const quality = new AdaptivePixelRatio(2, 1.5);
  expect(quality.value).toBe(1.5);
  expect(quality.evaluate(12)).toBe(1.25);
  // Cooldown: two evaluations without change.
  expect(quality.evaluate(12)).toBeNull();
  expect(quality.evaluate(12)).toBeNull();
  expect(quality.evaluate(12)).toBe(1);
  for (let i = 0; i < 6; i++) quality.evaluate(60);
  // Four fast seconds after the cooldown step back up.
  expect(quality.value).toBe(1.25);
});

it('never goes below the cheapest step', () => {
  const quality = new AdaptivePixelRatio(2, PIXEL_RATIO_STEPS.at(-1)!);
  for (let i = 0; i < 10; i++) quality.evaluate(5);
  expect(quality.value).toBe(PIXEL_RATIO_STEPS.at(-1)!);
});
