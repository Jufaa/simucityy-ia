import { expect, it } from 'vitest';
import { bboxAroundCenter } from './map-projection';
import { ZONE_SIDE_IN_METERS } from './zone-picker';

it('uses one fixed plane size for every imported zone', () => {
  expect(ZONE_SIDE_IN_METERS).toBe(1000);
  const bbox = bboxAroundCenter(
    { lat: 41.3955, lon: 2.164 },
    ZONE_SIDE_IN_METERS,
  );
  const heightInMeters = (bbox.north - bbox.south) * 111_320;
  expect(heightInMeters).toBeGreaterThan(990);
  expect(heightInMeters).toBeLessThan(1010);
});
