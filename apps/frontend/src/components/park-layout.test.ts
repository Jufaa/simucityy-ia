import { expect, it } from 'vitest';
import { createParkLayout } from './park-layout';

it.each([false, true])(
  'composes bounded public-space footprints (civic=%s)',
  (civic) => {
    const park = {
      id: 'park',
      minCorner: { x: 20, y: 30 },
      maxCorner: { x: 52, y: 58 },
    };
    const before = structuredClone(park);
    const layout = createParkLayout(park, civic);
    expect(
      layout.parkPaths.filter((path) => path.kind === 'path').length,
    ).toBeGreaterThanOrEqual(civic ? 2 : 1);
    expect(layout.parkPaths.some((path) => path.kind === 'entrance')).toBe(
      true,
    );
    expect(layout.parkPaths.some((path) => path.kind === 'plaza')).toBe(civic);
    expect(layout.amenities.some((item) => item.kind === 'fountain')).toBe(
      civic,
    );
    for (const item of layout.amenities) {
      const radius =
        item.kind === 'bench'
          ? Math.max(0.85, item.radiusInMeters)
          : item.radiusInMeters;
      expect(item.position.x - radius).toBeGreaterThanOrEqual(park.minCorner.x);
      expect(item.position.x + radius).toBeLessThanOrEqual(park.maxCorner.x);
      expect(item.position.y - radius).toBeGreaterThanOrEqual(park.minCorner.y);
      expect(item.position.y + radius).toBeLessThanOrEqual(park.maxCorner.y);
      if (item.kind === 'fountain') continue;
      for (const path of layout.parkPaths) {
        const dx = Math.max(
          path.minCorner.x - item.position.x,
          0,
          item.position.x - path.maxCorner.x,
        );
        const dy = Math.max(
          path.minCorner.y - item.position.y,
          0,
          item.position.y - path.maxCorner.y,
        );
        expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(radius);
      }
    }
    const pavedArea = layout.parkPaths.reduce(
      (area, path) =>
        area +
        (path.maxCorner.x - path.minCorner.x) *
          (path.maxCorner.y - path.minCorner.y),
      0,
    );
    if (!civic) expect(pavedArea).toBeLessThan(32 * 28 * 0.25);
    expect(park).toEqual(before);
    expect(createParkLayout(park, civic)).toEqual(layout);
  },
);
