import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HazardSelector } from './hazard-selector';

it('offers every catastrophe with its key parameter and marks the active one', () => {
  const html = renderToStaticMarkup(
    createElement(HazardSelector, { value: 'tsunami', onChange: () => {} }),
  );
  for (const label of [
    'Lluvia intensa',
    'Desborde de río',
    'Tsunami',
    'Terremoto',
    'Vientos fuertes',
    'Incendio urbano',
    'Tornado',
  ])
    expect(html).toContain(label);
  expect(html).toContain('Magnitud 6.8');
  expect(html).toContain('Rachas 110 km/h');
  expect(html).toContain('Ola 1.6 m');
  // Solo el botón activo va presionado.
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  expect(html.match(/aria-pressed="false"/g)).toHaveLength(6);
  expect(html).toContain('Propagación localizada');
  expect(html).toContain('Corredor móvil');
  expect(html).not.toContain('Lluvia 0 mm/h');
});
