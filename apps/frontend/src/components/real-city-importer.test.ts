import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { RealCityImporter } from './real-city-importer';

it('presents search, plan upload, the zone map and a clear primary action', () => {
  const html = renderToStaticMarkup(
    createElement(RealCityImporter, { onImported: () => {} }),
  );
  expect(html).toContain('Buscar ciudad/barrio');
  expect(html).toContain('Subir plano');
  expect(html).toContain('Zonas guardadas');
  const planHtml = renderToStaticMarkup(
    createElement(RealCityImporter, {
      onImported: () => {},
      initialTab: 'plan',
    }),
  );
  // The file picker reads as a real button, not the raw browser control.
  expect(planHtml).toContain('Elegir plano GeoJSON…');
  expect(planHtml).toContain('Ningún archivo elegido');
  expect(planHtml).toContain('type="file"');
  expect(planHtml).toContain('hidden=""');
  expect(html).toContain('Ciudad o barrio a buscar');
  expect(html).toContain('Ciudades ofrecidas:');
  expect(html).toContain('Eixample, Barcelona');
  expect(html).toContain('Mapa para elegir la zona a representar');
  expect(html).toContain('Tamaño de la zona:');
  // The main action must read as a button, with the primary styling inline.
  expect(html).toContain('Representar esta zona en la simulación');
  expect(html).toContain('background:#24655e');
});
