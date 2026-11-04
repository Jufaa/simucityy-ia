import { describe, expect, it } from 'vitest';
import { fallbackCityPlan } from './ai-city';
import { validateCityProfile } from './random-city-profile';

describe('fallbackCityPlan', () => {
  it('builds a valid deterministic plan without AI', () => {
    const a = fallbackCityPlan('ciudad con rio y edificios bajos', 7);
    const b = fallbackCityPlan('ciudad con rio y edificios bajos', 7);
    expect(a).toEqual(b);
    expect(() => validateCityProfile(a.profile)).not.toThrow();
    expect(a.source).toBe('fallback');
  });

  it('lowers buildings for a low-rise request', () => {
    const plan = fallbackCityPlan('edificios bajos', 3);
    expect(plan.profile.heightScale).toBeLessThanOrEqual(0.85);
  });
});
