import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('district homepage', () => {
  it('renders the city creation screen first, before any city is generated', () => {
    const markup = renderToStaticMarkup(createElement(Home));

    // The initial screen only offers the three creation paths; no district
    // is requested, generated or rendered until the user picks one.
    expect(markup).toContain('Create your city');
    expect(markup).toContain('Open AI chat');
    expect(markup).toContain('Generate random');
    expect(markup).toContain('Open the map');
    expect(markup).not.toContain('Generating the city…');
  });
});
