import {
  validateCityProfile,
  type RandomCityProfile,
} from './random-city-profile';

export type CityGenerationMode = 'district' | 'city';

/** Bounded local presets; existing API/saved profiles are not expanded. */
export function getCityGenerationPreset(
  mode: CityGenerationMode = 'district',
  profile?: RandomCityProfile,
) {
  if (profile) validateCityProfile(profile);
  if (mode !== 'district' && mode !== 'city')
    throw new RangeError('City generation mode must be district or city.');
  const large = mode === 'city';
  return {
    mode,
    widthInMeters: large ? 1200 : null,
    heightInMeters: large ? 1200 : null,
    objectScale: large ? 1 : null,
    cellSizeInMeters: large ? 20 : 10,
    roadRows: large ? 10 : 5,
    buildingTarget: large
      ? profile
        ? 600 + Math.round(((profile.buildingTarget - 110) * 200) / 80)
        : 800
      : (profile?.buildingTarget ?? 190),
    parkTarget: large
      ? profile
        ? 8 + Math.round(((profile.parkTarget - 2) * 8) / 5)
        : 12
      : (profile?.parkTarget ?? 4),
    buildingAttemptLimit: large ? 96000 : 24000,
    parkAttemptLimit: large ? 15000 : 5000,
  };
}

interface GenerationIdentity {
  seed: number;
  randomized: boolean;
  layout: 'organic' | 'grid';
  mode: CityGenerationMode;
}

export function sameCityGeneration(
  a: GenerationIdentity,
  b: GenerationIdentity,
): boolean {
  return (
    a.seed === b.seed &&
    a.randomized === b.randomized &&
    a.layout === b.layout &&
    a.mode === b.mode
  );
}
