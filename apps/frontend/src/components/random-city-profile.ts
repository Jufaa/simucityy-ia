/** Local generation controls, not part of the persisted/HTTP city contract. */
export interface RandomCityProfile {
  readonly buildingTarget: number;
  readonly parkTarget: number;
  readonly heightScale: number;
  readonly lakeScale: number;
  readonly riverWidthScale: number;
}

/** The organic generator's existing seeded stream, shared without changing its sequence. */
export function createCityRandom(seed: number): () => number {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new RangeError(
      'Organic city seed must be an unsigned 32-bit integer.',
    );
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function validateCityProfile(profile: RandomCityProfile): void {
  for (const [key, min, max, integer] of [
    ['buildingTarget', 110, 190, true],
    ['parkTarget', 2, 7, true],
    ['heightScale', 0.65, 1.4, false],
    ['lakeScale', 0.8, 1.1, false],
    ['riverWidthScale', 0.8, 1.15, false],
  ] as const) {
    const value = profile[key];
    if (
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (integer && !Number.isInteger(value))
    )
      throw new RangeError(
        `City profile ${key} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`,
      );
  }
}

/** A seed reproduces both the profile and the organic city's independent random stream. */
export function createRandomCityProfile(seed: number): RandomCityProfile {
  const random = createCityRandom(seed);
  return {
    buildingTarget: 110 + Math.floor(random() * 81),
    parkTarget: 2 + Math.floor(random() * 6),
    heightScale: 0.65 + random() * 0.75,
    lakeScale: 0.8 + random() * 0.3,
    riverWidthScale: 0.8 + random() * 0.35,
  };
}
