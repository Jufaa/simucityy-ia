import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { WorldControls } from './world-controls';
it('labels world generation and its visibility-only controls without implying AI or real data', () => {
  const html = renderToStaticMarkup(
    createElement(WorldControls, {
      seed: 123,
      width: 1850,
      height: 1450,
      fields: 6,
      visible: { sea: true, lake: true, fields: true, expansion: true },
      view: 'world',
      onGenerate: () => {},
      onLayer: () => {},
      onView: () => {},
    }),
  );
  for (const label of [
    'Semilla',
    'Generar otro entorno',
    'Mar',
    'Lago',
    'Campos',
    'Reservas',
    'Vista ciudad',
    'sintético',
  ])
    expect(html).toContain(label);
  expect(html).toContain('reinicia la simulación');
});
