import type { CellKind, FloodConfig, FloodTerrainInput } from './types.js';

export const DEFAULT_FLOOD_CONFIG: FloodConfig = {
  rainRatePerTick: 0.02,
  flowTransferRatio: 0.5,
  drainRatePerTick: 0.002,
  roadFloodedThreshold: 0.15,
  buildingExposedThreshold: 0.3,
};

/**
 * Crea una grilla sintética demostrativa con relieve suave (valle central),
 * calles en cuadrícula y edificios, compatible con las dimensiones de A.
 */
export function createSyntheticTerrain(
  width = 16,
  height = 16,
): FloodTerrainInput {
  const size = width * height;
  const elevation = new Float64Array(size);
  const cellKinds: CellKind[] = new Array<CellKind>(size).fill('empty');
  const entityIds: (string | undefined)[] = new Array<string | undefined>(size);

  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const maxDist = Math.hypot(centerX, centerY) || 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      // Relieve en forma de cuenco/valle hacia el centro para que el agua acumule
      const dist = Math.hypot(x - centerX, y - centerY);
      elevation[idx] = Number(((dist / maxDist) * 2.0).toFixed(4));

      if (x % 4 === 0 || y % 4 === 0) {
        cellKinds[idx] = 'road';
        entityIds[idx] = `road-${x}-${y}`;
      } else if (x % 2 === 1 && y % 2 === 1) {
        cellKinds[idx] = 'building';
        entityIds[idx] = `bldg-${x}-${y}`;
      }
    }
  }

  return { width, height, elevation, cellKinds, entityIds };
}
