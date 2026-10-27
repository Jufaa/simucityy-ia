import { describe, it, expect } from 'vitest';
import { CityConfig, TerrainConfig } from '../../modules/cities/city.types';
import { getElevation } from '../../modules/cities/terrain';

describe('Terrain Evaluator', () => {
  const cityConfig: CityConfig = {
    widthInMeters: 100,
    heightInMeters: 100,
    streetSpacingInMeters: 50,
  };

  const flatTerrain: TerrainConfig = {
    kind: 'flat',
    elevationInMeters: 25,
  };

  it('devuelve la misma elevación constante para puntos válidos en terreno plano', () => {
    expect(getElevation(flatTerrain, { x: 0, y: 0 }, cityConfig)).toBe(25);
    expect(getElevation(flatTerrain, { x: 50, y: 50 }, cityConfig)).toBe(25);
    expect(getElevation(flatTerrain, { x: 100, y: 100 }, cityConfig)).toBe(25);
  });

  it('lanza un error si el punto está fuera de los límites de la ciudad', () => {
    expect(() =>
      getElevation(flatTerrain, { x: 150, y: 50 }, cityConfig),
    ).toThrow(RangeError);

    expect(() =>
      getElevation(flatTerrain, { x: 10, y: -5 }, cityConfig),
    ).toThrow(RangeError);
  });

  it('lanza un error si la elevación configurada no es un número finito', () => {
    const invalidTerrain: TerrainConfig = {
      kind: 'flat',
      elevationInMeters: NaN,
    };

    expect(() =>
      getElevation(invalidTerrain, { x: 50, y: 50 }, cityConfig),
    ).toThrow(RangeError);
  });
});
