import { getElevation } from './terrain';
import type { CityConfig, TerrainConfig, TerrainGrid } from './city.types';
import { validateCityConfig } from './city-validation';

export function generateTerrainGrid(
  config: CityConfig,
  terrain: TerrainConfig,
  cellSize: number,
): TerrainGrid {
  validateCityConfig(config);
  if (!Number.isFinite(cellSize) || cellSize <= 0)
    throw new RangeError('Terrain cell size must be finite and positive.');
  const columns = Math.ceil(config.widthInMeters / cellSize) + 1;
  const rows = Math.ceil(config.heightInMeters / cellSize) + 1;
  if (!Number.isSafeInteger(columns * rows) || columns * rows > 10000)
    throw new RangeError('Terrain grid exceeds the 10000 sample limit.');
  const xCoordinates = Array.from({ length: columns }, (_, i) =>
    Math.min(i * cellSize, config.widthInMeters),
  );
  const yCoordinates = Array.from({ length: rows }, (_, i) =>
    Math.min(i * cellSize, config.heightInMeters),
  );
  return {
    source: 'synthetic',
    xCoordinates,
    yCoordinates,
    elevationsInMeters: yCoordinates.map((y) =>
      xCoordinates.map((x) => getElevation(terrain, { x, y }, config)),
    ),
  };
}
