import type { Road, RoadProfile } from './city-types';

/** Keep each legacy consumer's fallback; local metadata takes precedence. */
export function getRoadProfile(
  road: Road,
  legacyWidthInMeters = 6,
  legacySidewalkWidthInMeters = 2,
): RoadProfile {
  const profile = road.profile;
  if (!profile)
    return {
      kind: 'local',
      widthInMeters: legacyWidthInMeters,
      sidewalkWidthInMeters: legacySidewalkWidthInMeters,
      motorVehiclesAllowed: true,
    };
  if (
    !['avenue', 'local', 'alley'].includes(profile.kind) ||
    !Number.isFinite(profile.widthInMeters) ||
    profile.widthInMeters <= 0 ||
    !Number.isFinite(profile.sidewalkWidthInMeters) ||
    profile.sidewalkWidthInMeters < 0 ||
    typeof profile.motorVehiclesAllowed !== 'boolean'
  )
    throw new RangeError(
      'Local road profiles require a valid class, positive width, nonnegative sidewalk and motor access.',
    );
  return { ...profile };
}
