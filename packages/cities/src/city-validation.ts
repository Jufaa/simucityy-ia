import type { CityConfig } from './city.types';

export const MAX_STREETS = 1000;

export function validateSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('Seed must be an integer between 0 and 4294967295.');
  }
}

export function validateCityConfig(config: CityConfig): void {
  if (
    !Number.isFinite(config.widthInMeters) ||
    config.widthInMeters <= 0 ||
    !Number.isFinite(config.heightInMeters) ||
    config.heightInMeters <= 0 ||
    !Number.isFinite(config.streetSpacingInMeters) ||
    config.streetSpacingInMeters <= 0
  ) {
    throw new RangeError(
      'Las dimensiones y el espaciado deben ser números finitos mayores a cero.',
    );
  }
  if (config.seed !== undefined) validateSeed(config.seed);

  const horizontal =
    Math.floor(config.heightInMeters / config.streetSpacingInMeters) + 1;
  const vertical =
    Math.floor(config.widthInMeters / config.streetSpacingInMeters) + 1;
  const total = horizontal + vertical;
  if (!Number.isSafeInteger(total) || total > MAX_STREETS) {
    throw new RangeError(
      `La cantidad estimada de calles (${total}) supera el límite máximo permitido de ${MAX_STREETS}.`,
    );
  }
}
