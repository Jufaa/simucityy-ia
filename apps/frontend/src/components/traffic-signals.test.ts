import { expect, it } from 'vitest';
import { signalAxis, signalStateAt } from './traffic-signals';

it('runs deterministic opposing phases with amber and all-red clearance', () => {
  const seen = new Set<string>();
  for (let time = 0; time < 56; time += 0.25) {
    const state = signalStateAt('junction', time, 42);
    expect(state).toEqual(signalStateAt('junction', time + 28, 42));
    expect(
      state['north-south'] === 'green' && state['east-west'] === 'green',
    ).toBe(false);
    if (state['north-south'] !== 'red') expect(state['east-west']).toBe('red');
    if (state['east-west'] !== 'red') expect(state['north-south']).toBe('red');
    seen.add(`${state['north-south']}/${state['east-west']}`);
  }
  expect(seen).toEqual(
    new Set(['green/red', 'amber/red', 'red/red', 'red/green', 'red/amber']),
  );
  expect(signalAxis(1, 1)).toBe('east-west');
  expect(signalAxis(-0.2, 1)).toBe('north-south');
  expect(signalStateAt('junction', NaN, 42)).toEqual(
    signalStateAt('junction', 0, 42),
  );
});
