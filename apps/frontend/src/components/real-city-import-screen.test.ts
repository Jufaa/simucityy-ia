import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { RealCityImportScreen } from './real-city-import-screen';

it('renders the real-zone importer as a standalone full-screen step', () => {
  const html = renderToStaticMarkup(
    createElement(RealCityImportScreen, {
      onImported: () => {},
      onBack: () => {},
    }),
  );

  expect(html).toContain('Choose a real zone');
  expect(html).toContain('width:100vw');
  expect(html).toContain('height:100vh');
  expect(html).toContain('Back to options');
  expect(html).toContain('Search city/neighborhood');
  expect(html).toContain('Map to choose the zone to render');
  expect(html).not.toContain('Generating the city');
  expect(html).not.toContain('Synthetic organic city');
});
