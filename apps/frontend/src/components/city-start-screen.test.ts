import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { CityStartScreen } from './city-start-screen';

it('offers AI chat, random-or-seed and a specific real zone as the three entry options', () => {
  const html = renderToStaticMarkup(
    createElement(CityStartScreen, {
      aiBusy: false,
      onAiChat: async () => {
        throw new Error('not used in static render');
      },
      onBuildAi: () => {},
      onRandom: () => {},
      onImportZone: () => {},
      onSeed: () => {},
    }),
  );
  expect(html).toContain('Crear ciudad con IA');
  expect(html).toContain('Abrir chat con IA');
  expect(html).toContain('Ciudad random');
  expect(html).toContain('Semilla');
  expect(html).toContain('Ciudad en específico');
  expect(html).toContain('Abrir el mapa');
});
