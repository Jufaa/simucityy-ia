// prng.ts
import { validateSeed } from '../city-validation';

export function createRandom(seed: number): () => number {
  validateSeed(seed);
  let s = seed;
  return function () {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
