import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('district homepage', () => {
  it('renders the initial loading state before the client requests a district', () => {
    const markup = renderToStaticMarkup(createElement(Home));

    expect(markup).toBe('<div style="padding:20px">Cargando ciudad...</div>');
    expect(markup).not.toMatch(/<(button|input|select|canvas)\b/);
  });
});
