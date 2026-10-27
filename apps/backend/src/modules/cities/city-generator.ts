import type { City, CityConfig, Road } from './city.types';

const MAX_STREETS = 1000; // podemos agregar mas es un stimate
export function generateCity(config: CityConfig): City {
  const roads: Road[] = [];
  if (
    config.widthInMeters <= 0 ||
    config.heightInMeters <= 0 ||
    config.streetSpacingInMeters <= 0 ||
    !Number.isFinite(config.widthInMeters) ||
    !Number.isFinite(config.heightInMeters) ||
    !Number.isFinite(config.streetSpacingInMeters)
  ) {
    throw new RangeError(
      'Las dimensiones y el espaciado deben ser números finitos mayores a cero.',
    );
  }

  const horizontalStimate =
    Math.floor(config.heightInMeters / config.streetSpacingInMeters) + 1;
  const verticalStimate =
    Math.floor(config.heightInMeters / config.streetSpacingInMeters) + 1;
  const totalStreetStimate = horizontalStimate + verticalStimate;
  if (
    !Number.isFinite(totalStreetStimate) ||
    totalStreetStimate > MAX_STREETS
  ) {
    throw new RangeError(
      `La cantidad estimada de calles (${totalStreetStimate}) supera el límite máximo permitido de ${MAX_STREETS}.`,
    );
  }

  for (
    let y = 0;
    y <= config.heightInMeters;
    y += config.streetSpacingInMeters
  ) {
    roads.push({
      id: `horizontal-${y}`,
      start: { x: 0, y },
      end: { x: config.widthInMeters, y },
    });
  }
  for (
    let x = 0;
    x <= config.widthInMeters;
    x += config.streetSpacingInMeters
  ) {
    roads.push({
      id: `vertical-${x}`,
      start: { x, y: 0 },
      end: { x, y: config.heightInMeters },
    });
  }
  return {
    config,
    roads,
  };
}
