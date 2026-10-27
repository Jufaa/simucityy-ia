import { describe, expect, it } from 'vitest';
import { generateCity } from '../../modules/cities/city-generator';
it('generar horizontal la calle y configuracion del spacing', () => {
  const config = {
    widthInMeters: 100,
    heightInMeters: 100,
    streetSpacingInMeters: 50,
  };
  const city = generateCity(config);

  expect(city.config).toEqual(config);
  expect(
    city.roads
      .filter(({ start, end }) => start.y === end.y)
      .map(({ start, end }) => [start.x, start.y, end.x, end.y]),
  ).toEqual([
    [0, 0, 100, 0],
    [0, 50, 100, 50],
    [0, 100, 100, 100],
  ]);
});

it('genera calles verticales usando el ancho y el alto de la ciudad', () => {
  const config = {
    widthInMeters: 150,
    heightInMeters: 100,
    streetSpacingInMeters: 50,
  };
  const city = generateCity(config);

  expect(city.config).toEqual(config);
  expect(city.roads.filter(({ start, end }) => start.x === end.x)).toEqual([
    {
      id: 'vertical-0',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 100 },
    },
    {
      id: 'vertical-50',
      start: { x: 50, y: 0 },
      end: { x: 50, y: 100 },
    },
    {
      id: 'vertical-100',
      start: { x: 100, y: 0 },
      end: { x: 100, y: 100 },
    },
    {
      id: 'vertical-150',
      start: { x: 150, y: 0 },
      end: { x: 150, y: 100 },
    },
  ]);
  expect(city.roads).toHaveLength(7);
  expect(new Set(city.roads.map(({ id }) => id)).size).toBe(city.roads.length);
});

it('rejects negative city dimensions', () => {
  expect(() =>
    generateCity({
      widthInMeters: -100,
      heightInMeters: 100,
      streetSpacingInMeters: 50,
    }),
  ).toThrow(RangeError);
});

describe('generateCity- limit d callae', () => {
  //caso aceptado
  it('acepta una ciudad dentro del limite', () => {
    const city = generateCity({
      widthInMeters: 100,
      heightInMeters: 100,
      streetSpacingInMeters: 50,
    });
    expect(city.roads.length).toBe(6); // horizontales (3) + verticales (3) = 6
  });

  it('acepta una ciudad que se encuentra justo en el límite permitido', () => {
    // Si MAX_STREETS es 1000, podemos buscar una combinación que dé <= 1000
    const city = generateCity({
      widthInMeters: 490,
      heightInMeters: 490,
      streetSpacingInMeters: 1,
    });
    // horizontales: 491, verticales: 491 -> total: 982 (menor o igual a 1000)
    expect(city.roads.length).toBe(982);
  });

  // 3. Caso por encima del límite
  it('rechaza una ciudad que excede el límite máximo de calles', () => {
    expect(() =>
      generateCity({
        widthInMeters: 10000,
        heightInMeters: 10000,
        streetSpacingInMeters: 1,
      }),
    ).toThrow(RangeError);
  });
});
