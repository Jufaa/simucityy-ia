import { expect, it } from 'vitest';
import { streetLabelPlacements } from './street-labels';
import type { Road } from './city-types';

const road = (id: string, name: string | undefined, length: number): Road => ({
  id,
  ...(name ? { name } : {}),
  start: { x: 0, y: 0 },
  end: { x: length, y: 0 },
});

it('places one label per street name on its longest segment', () => {
  const placements = streetLabelPlacements([
    road('a', 'Calle Mayor', 60),
    road('b', 'Calle Mayor', 120),
    road('c', 'Calle Corta', 30),
    road('d', undefined, 200),
    road('e', '  ', 200),
  ]);
  expect(placements).toEqual([
    {
      name: 'Calle Mayor',
      x: 60,
      y: 0,
      segmentLengthInMeters: 120,
    },
  ]);
});

it('caps the number of labels, keeping the longest streets', () => {
  const roads = Array.from({ length: 40 }, (_, i) =>
    road(`r${i}`, `Calle ${i}`, 60 + i),
  );
  const placements = streetLabelPlacements(roads);
  expect(placements).toHaveLength(24);
  expect(placements[0]!.name).toBe('Calle 39');
});
