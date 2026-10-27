import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('frontend reset homepage', () => {
  it('renders only the neutral pending page without simulator controls', () => {
    const markup = renderToStaticMarkup(createElement(Home));

    expect(markup).toBe(
      '<main><h1>Simulicity IA</h1><p>Frontend implementation pending.</p></main>',
    );
    expect(markup).not.toMatch(/<(button|input|select|canvas)\b/);
  });
});
