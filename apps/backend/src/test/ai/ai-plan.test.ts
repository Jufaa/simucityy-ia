import { describe, expect, it } from 'vitest';
import {
  parseAiCityPlan,
  parseInterventionPlan,
} from '../../modules/ai/ai-plan';

const validCityPlan = {
  name: 'Ciudad del rio',
  summary: 'Rio central, edificios bajos.',
  seed: 42,
  mode: 'district',
  profile: {
    buildingTarget: 150,
    parkTarget: 4,
    heightScale: 0.8,
    lakeScale: 0.9,
    riverWidthScale: 1.1,
  },
};

describe('parseAiCityPlan', () => {
  it('accepts a plan inside the generator bounds', () => {
    expect(parseAiCityPlan(validCityPlan)).toEqual(validCityPlan);
  });

  it('rejects a profile the generator cannot build', () => {
    expect(() =>
      parseAiCityPlan({
        ...validCityPlan,
        profile: { ...validCityPlan.profile, buildingTarget: 999 },
      }),
    ).toThrow();
  });

  it('rejects unknown fields instead of passing them through', () => {
    expect(() => parseAiCityPlan({ ...validCityPlan, code: 'x' })).toThrow();
  });
});

describe('parseInterventionPlan', () => {
  it('accepts bounded interventions', () => {
    const plan = parseInterventionPlan({
      drains: 6,
      earlyWarning: true,
      reinforcement: false,
      done: false,
      rationale: 'Mas drenajes en la zona baja.',
    });
    expect(plan.drains).toBe(6);
  });

  it('rejects more drains than the simulator accepts', () => {
    expect(() =>
      parseInterventionPlan({
        drains: 40,
        earlyWarning: false,
        reinforcement: false,
        done: false,
        rationale: 'x',
      }),
    ).toThrow();
  });
});
