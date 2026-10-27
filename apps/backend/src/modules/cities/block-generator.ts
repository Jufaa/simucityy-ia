import { CityConfig, Block } from './city.types';
import { validateCityConfig } from './city-validation';

export function generateBlocks(config: CityConfig): Block[] {
  validateCityConfig(config);
  const blocks: Block[] = [];
  const { widthInMeters, heightInMeters, streetSpacingInMeters } = config;

  let indexY = 0;
  for (
    let y = 0;
    y + streetSpacingInMeters <= heightInMeters;
    y += streetSpacingInMeters
  ) {
    let indexX = 0;
    for (
      let x = 0;
      x + streetSpacingInMeters <= widthInMeters;
      x += streetSpacingInMeters
    ) {
      blocks.push({
        id: `block-${indexX}-${indexY}`,
        minCorner: { x, y },
        maxCorner: {
          x: x + streetSpacingInMeters,
          y: y + streetSpacingInMeters,
        },
      });
      indexX++;
    }
    indexY++;
  }

  return blocks;
}
