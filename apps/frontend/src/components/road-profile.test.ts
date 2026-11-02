import { expect, it } from 'vitest';
import type { Road, RoadProfile } from './city-types';
import { getRoadProfile } from './road-profile';

const road: Road = {
  id: 'road',
  start: { x: 0, y: 0 },
  end: { x: 100, y: 0 },
};

it('preserves consumer-specific legacy width fallbacks without mutating roads', () => {
  const before = structuredClone(road);
  expect(getRoadProfile(road).widthInMeters).toBe(6);
  expect(getRoadProfile(road, 8, 3)).toMatchObject({
    widthInMeters: 8,
    sidewalkWidthInMeters: 3,
    motorVehiclesAllowed: true,
  });
  expect(road).toEqual(before);
});

it.each([
  ['avenue', 12, 3, true],
  ['local', 8, 2, true],
  ['alley', 4, 1, false],
] as const)(
  'resolves a local %s profile without applying a legacy override',
  (kind, widthInMeters, sidewalkWidthInMeters, motorVehiclesAllowed) => {
    const profile: RoadProfile = {
      kind,
      widthInMeters,
      sidewalkWidthInMeters,
      motorVehiclesAllowed,
    };
    expect(getRoadProfile({ ...road, profile }, 20, 5)).toEqual(profile);
  },
);

it('rejects invalid local dimensions instead of hiding them with legacy defaults', () => {
  const profile: RoadProfile = {
    kind: 'local',
    widthInMeters: 8,
    sidewalkWidthInMeters: 2,
    motorVehiclesAllowed: true,
  };
  for (const widthInMeters of [0, -1, NaN, Infinity])
    expect(() =>
      getRoadProfile({ ...road, profile: { ...profile, widthInMeters } }),
    ).toThrow(RangeError);
  for (const sidewalkWidthInMeters of [-1, NaN, Infinity])
    expect(() =>
      getRoadProfile({
        ...road,
        profile: { ...profile, sidewalkWidthInMeters },
      }),
    ).toThrow(RangeError);
});
