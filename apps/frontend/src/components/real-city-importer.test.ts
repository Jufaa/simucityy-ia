import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { RealCityImporter } from './real-city-importer';

it('presents search, plan upload, the zone map and a clear primary action', () => {
  const html = renderToStaticMarkup(
    createElement(RealCityImporter, { onImported: () => {} }),
  );
  expect(html).toContain('Search city/neighborhood');
  expect(html).toContain('Upload plan');
  expect(html).toContain('Saved zones');
  const planHtml = renderToStaticMarkup(
    createElement(RealCityImporter, {
      onImported: () => {},
      initialTab: 'plan',
    }),
  );
  // The file picker reads as a real button, not the raw browser control.
  expect(planHtml).toContain('Choose GeoJSON plan…');
  expect(planHtml).toContain('No file chosen yet');
  expect(planHtml).toContain('type="file"');
  expect(planHtml).toContain('hidden=""');
  expect(html).toContain('City or neighborhood to search');
  expect(html).toContain('Suggested cities:');
  expect(html).toContain('Eixample, Barcelona');
  expect(html).toContain('Map to choose the zone to render');
  expect(html).toContain('Fixed zone: 1000 m per side');
  // The main action must read as a button, with the primary styling inline.
  expect(html).toContain('Render this zone in the simulation');
  expect(html).toContain('background:#24655e');
});
