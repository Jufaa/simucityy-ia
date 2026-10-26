import { describe, expect, it } from 'vitest';
import { MetaPlannerProvider, validateToolCall } from './index';
describe('bounded AI contracts', () => {
  it('is unavailable rather than generating a fabricated answer', async () => {
    await expect(
      new MetaPlannerProvider().analyze({
        scenarioId: 'demo',
        question: 'Compare',
      }),
    ).rejects.toThrow(/not configured/);
  });
  it('accepts only known tools and strictly validated bounded arguments', () => {
    expect(
      validateToolCall({
        name: 'runSimulation',
        arguments: { scenarioId: 'demo', steps: 10 },
      }).name,
    ).toBe('runSimulation');
    expect(() =>
      validateToolCall({ name: 'eval', arguments: { code: 'anything' } }),
    ).toThrow();
    expect(() =>
      validateToolCall({
        name: 'runSimulation',
        arguments: { scenarioId: 'demo', steps: 1000000 },
      }),
    ).toThrow();
    expect(() =>
      validateToolCall({
        name: 'getCityState',
        arguments: { cityId: 'demo', code: 'no' },
      }),
    ).toThrow();
  });
});
