// terrain.ts
import type { TerrainConfig, Point, CityConfig } from './city.types';
import { validateCityConfig } from './city-validation';

export function getElevation(
  terrain: TerrainConfig,
  point: Point,
  cityConfig: CityConfig,
): number {
  validateCityConfig(cityConfig);
  // Validar que la elevación sea un número finito
  if (!Number.isFinite(terrain.elevationInMeters)) {
    throw new RangeError('La elevación del terreno debe ser un número finito.');
  }

  // Validar que el punto esté dentro de los límites de la ciudad
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    point.x < 0 ||
    point.x > cityConfig.widthInMeters ||
    point.y < 0 ||
    point.y > cityConfig.heightInMeters
  ) {
    throw new RangeError(
      'Las coordenadas consultadas están fuera de los límites de la ciudad.',
    );
  }

  if (terrain.kind === 'flat') {
    return terrain.elevationInMeters;
  }

  throw new Error(
    `Tipo de terreno desconocido o no soportado: ${terrain.kind}`,
  );
}
