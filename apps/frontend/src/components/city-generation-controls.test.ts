import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import {
  CityGenerationControls,
  parseCitySeed,
} from './city-generation-controls';

it('accepts only complete unsigned 32-bit seed strings', () => {
  expect(parseCitySeed('0')).toBe(0);
  expect(parseCitySeed('4294967295')).toBe(4294967295);
  for (const value of ['', '-1', '4294967296', '1.5', '1e3', '123abc'])
    expect(parseCitySeed(value)).toBeNull();
});

it('shows independent random generation and replay with the active generation mode', () => {
  const html = renderToStaticMarkup(
    createElement(CityGenerationControls, {
      seed: 123,
      randomized: true,
      onGenerate: () => {},
      onRandom: () => {},
    }),
  );
  expect(html).toContain('Ciudad aleatoria');
  expect(html).toContain('Semilla de ciudad');
  expect(html).toContain('Reproducir ciudad');
  expect(html).toContain('value="123"');
  expect(html).toContain('Perfil aleatorio');
});
