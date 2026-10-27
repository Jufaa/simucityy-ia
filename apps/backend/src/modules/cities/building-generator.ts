// building-generator.ts
import type { Block, Building } from './city.types';
import { createRandom } from './utils/prng';
import { validateSeed } from './city-validation';
export function generateBuildings(
  blocks: Block[],
  marginInMeters: number = 5,
  heightOrMin: number = 10,
  maxHeight?: number,
  seed?: number,
): Building[] {
  if (!Number.isFinite(marginInMeters) || marginInMeters < 0) {
    throw new RangeError('Building margin must be finite and non-negative.');
  }
  if (!Number.isFinite(heightOrMin) || heightOrMin <= 0) {
    throw new RangeError('Building height must be finite and positive.');
  }
  if ((maxHeight === undefined) !== (seed === undefined)) {
    throw new RangeError(
      'Random building heights require both maximum height and seed.',
    );
  }
  if (
    maxHeight !== undefined &&
    (!Number.isFinite(maxHeight) || maxHeight < heightOrMin)
  ) {
    throw new RangeError(
      'Maximum building height must be finite and at least the minimum height.',
    );
  }
  if (seed !== undefined) validateSeed(seed);
  const ids = new Set<string>();
  for (const block of blocks) {
    if (
      !block.id.trim() ||
      ids.has(block.id) ||
      !Number.isFinite(block.minCorner.x) ||
      !Number.isFinite(block.minCorner.y) ||
      !Number.isFinite(block.maxCorner.x) ||
      !Number.isFinite(block.maxCorner.y) ||
      block.minCorner.x < 0 ||
      block.minCorner.y < 0 ||
      block.maxCorner.x <= block.minCorner.x ||
      block.maxCorner.y <= block.minCorner.y
    ) {
      throw new RangeError(
        'Blocks must have unique non-empty IDs and finite, positive-area bounds in local coordinates.',
      );
    }
    ids.add(block.id);
  }
  // Verificamos si nos pasaron los parámetros para usar aleatoriedad con semilla
  const useRandom = maxHeight !== undefined && seed !== undefined;
  const random = useRandom ? createRandom(seed) : null;

  return blocks.map((block, index) => {
    const minCorner = {
      x: block.minCorner.x + marginInMeters,
      y: block.minCorner.y + marginInMeters,
    };
    const maxCorner = {
      x: block.maxCorner.x - marginInMeters,
      y: block.maxCorner.y - marginInMeters,
    };

    // Validar que el margen no sea excesivo
    if (maxCorner.x <= minCorner.x || maxCorner.y <= minCorner.y) {
      throw new RangeError(
        `El margen de ${marginInMeters}m es demasiado grande para la manzana ${block.id}.`,
      );
    }

    let heightInMeters: number;

    if (useRandom && random) {
      // Si se especificó rango y semilla, calculamos altura pseudoaleatoria
      const rawHeight = heightOrMin + random() * (maxHeight - heightOrMin);
      const rounded = Math.round(rawHeight * 10) / 10;
      heightInMeters = Math.min(
        maxHeight,
        Math.max(heightOrMin, Number.isFinite(rounded) ? rounded : rawHeight),
      );
    } else {
      // Si solo se pasó un valor, se toma como altura fija (retrocompatibilidad)
      heightInMeters = heightOrMin;
    }

    return {
      id: `building-${index}`,
      minCorner,
      maxCorner,
      heightInMeters,
    };
  });
}
