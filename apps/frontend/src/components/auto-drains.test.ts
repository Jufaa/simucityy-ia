import { describe, expect, it } from 'vitest';
import { pickAutoDrainPoints } from './auto-drains';

const grid = {
  xCoordinates: [0, 10, 20, 30],
  yCoordinates: [0, 10, 20, 30],
  // Lowest corner is (0,0); a valley runs along x=10.
  elevationsInMeters: [
    [1, 5, 9, 12],
    [2, 4, 8, 11],
    [3, 6, 7, 10],
    [4, 7, 8, 13],
  ],
};

describe('pickAutoDrainPoints', () => {
  it('places drains on the lowest cells first', () => {
    const points = pickAutoDrainPoints(grid, 2, 0);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points).toHaveLength(2);
  });

  it('is deterministic and bounded', () => {
    expect(pickAutoDrainPoints(grid, 12, 15)).toEqual(
      pickAutoDrainPoints(grid, 12, 15),
    );
    expect(pickAutoDrainPoints(grid, 99, 15).length).toBeLessThanOrEqual(12);
    expect(pickAutoDrainPoints(grid, 0, 15)).toEqual([]);
  });
});
