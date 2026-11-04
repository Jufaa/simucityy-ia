import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HazardSelector } from './hazard-selector';

it('offers every catastrophe with its key parameter and marks the active one', () => {
  const html = renderToStaticMarkup(
    createElement(HazardSelector, { value: 'tsunami', onChange: () => {} }),
  );
  for (const label of [
    'Intense rain',
    'River overflow',
    'Tsunami',
    'Earthquake',
    'Strong winds',
  ])
    expect(html).toContain(label);
  expect(html).toContain('Magnitude 6.8');
  expect(html).toContain('Gusts 110 km/h');
  expect(html).toContain('Wave 2.2 m');
  // Solo el botón activo va presionado.
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  expect(html.match(/aria-pressed="false"/g)).toHaveLength(4);
});

it('marks the active catastrophe with the teal accent of the app theme', () => {
  const html = renderToStaticMarkup(
    createElement(HazardSelector, { value: 'rain', onChange: () => {} }),
  );
  expect(html).toContain('#2dd4bf');
  expect(html).not.toContain('background:#fff');
});
