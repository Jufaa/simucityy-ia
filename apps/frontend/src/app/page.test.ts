import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('district homepage', () => {
  it('renders the city creation screen first, before any city is generated', () => {
    const markup = renderToStaticMarkup(createElement(Home));

    // The initial screen only offers the three creation paths; no district
    // is requested, generated or rendered until the user picks one.
    expect(markup).toContain('Crear tu ciudad');
    expect(markup).toContain('Abrir chat con IA');
    expect(markup).toContain('Generar random');
    expect(markup).toContain('Abrir el mapa');
    expect(markup).not.toContain('Generando la ciudad…');
  });
});
