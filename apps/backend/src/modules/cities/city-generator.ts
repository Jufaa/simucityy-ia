import type { City, CityConfig, Road } from './city.types';
import { validateCityConfig } from './city-validation';

export function generateCity(config: CityConfig): City {
  validateCityConfig(config);
  const roads: Road[] = [];

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
