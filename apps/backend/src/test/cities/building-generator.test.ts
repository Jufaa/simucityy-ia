import { describe, it, expect } from 'vitest';
import { generateBlocks } from '../../modules/cities/block-generator';
import { generateBuildings } from '../../modules/cities/building-generator';

describe('generateBuildings', () => {
  it('genera edificios con margen y altura correctos dentro de sus manzanas', () => {
    const blocks = generateBlocks({
      widthInMeters: 100,
      heightInMeters: 100,
      streetSpacingInMeters: 50,
    });

    const buildings = generateBuildings(blocks, 5, 10);

    expect(buildings).toHaveLength(4);
    expect(buildings[0]).toEqual({
      id: 'building-0',
      minCorner: { x: 5, y: 5 },
      maxCorner: { x: 45, y: 45 },
      heightInMeters: 10,
    });
    expect(buildings[1]).toEqual({
      id: 'building-1',
      minCorner: { x: 55, y: 5 },
      maxCorner: { x: 95, y: 45 },
      heightInMeters: 10,
    });
  });

  it('lanza un error si el margen es excesivo y no deja espacio para el edificio', () => {
    const blocks = generateBlocks({
      widthInMeters: 100,
      heightInMeters: 100,
      streetSpacingInMeters: 50,
    });

    // Manzana de 50x50, un margen de 30 dejaría dimensiones negativas (-10)
    expect(() => generateBuildings(blocks, 30, 10)).toThrow();
  });
});

describe('generateBuildings con Semilla (Variación de Alturas)', () => {
  const cityConfig = {
    widthInMeters: 100,
    heightInMeters: 100,
    streetSpacingInMeters: 50,
  };

  it('produce exactamente los mismos edificios con la misma semilla (reproducibilidad)', () => {
    const blocks = generateBlocks(cityConfig);

    const runA = generateBuildings(blocks, 5, 5, 15, 12345);
    const runB = generateBuildings(blocks, 5, 5, 15, 12345);

    expect(runA).toEqual(runB);
  });

  it('produce variaciones distintas con semillas diferentes', () => {
    const blocks = generateBlocks(cityConfig);

    const runA = generateBuildings(blocks, 5, 5, 15, 111);
    const runB = generateBuildings(blocks, 5, 5, 15, 999);

    // Las alturas deberían diferir al menos en algún edificio
    const heightsA = runA.map((b) => b.heightInMeters);
    const heightsB = runB.map((b) => b.heightInMeters);

    expect(heightsA).not.toEqual(heightsB);
  });

  it('mantiene todas las alturas estrictamente dentro del rango de 5 a 15 metros', () => {
    const blocks = generateBlocks(cityConfig);
    const buildings = generateBuildings(blocks, 5, 5, 15, 777);

    buildings.forEach((building) => {
      expect(building.heightInMeters).toBeGreaterThanOrEqual(5);
      expect(building.heightInMeters).toBeLessThanOrEqual(15);
    });
  });

  it('conserva la cantidad y las posiciones geométricas intactas', () => {
    const blocks = generateBlocks(cityConfig);
    const buildings = generateBuildings(blocks, 5, 5, 15, 42);

    expect(buildings).toHaveLength(4);
    // Verificamos que las esquinas no cambien, solo la altura
    expect(buildings[0].minCorner).toEqual({ x: 5, y: 5 });
    expect(buildings[0].maxCorner).toEqual({ x: 45, y: 45 });
  });
});
