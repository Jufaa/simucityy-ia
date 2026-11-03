import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('district homepage', () => {
  it('renders the initial loading state before the client requests a district', () => {
    const markup = renderToStaticMarkup(createElement(Home));

    // The loading screen blocks the app behind an aria-busy overlay with
    // the drop-catching mini-game while the first district is requested.
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Generando la ciudad…');
  });
});
