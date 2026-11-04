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
  expect(html).toContain('Create a city with AI');
  expect(html).toContain('Open AI chat');
  expect(html).toContain('Random city');
  expect(html).toContain('Seed');
  expect(html).toContain('A specific city');
  expect(html).toContain('Open the map');
});
