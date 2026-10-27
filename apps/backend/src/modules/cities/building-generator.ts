// building-generator.ts
import type { Block, Building } from './city.types';
import { createRandom } from './utils/prng';
export function generateBuildings(
  blocks: Block[],
  marginInMeters: number = 5,
  heightOrMin: number = 10,
  maxHeight?: number,
  seed?: number,
): Building[] {
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
      throw new Error(
        `El margen de ${marginInMeters}m es demasiado grande para la manzana ${block.id}.`,
      );
    }

    let heightInMeters: number;

    if (useRandom && random) {
      // Si se especificó rango y semilla, calculamos altura pseudoaleatoria
      const rawHeight = heightOrMin + random() * (maxHeight - heightOrMin);
      heightInMeters = Math.round(rawHeight * 10) / 10;
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
