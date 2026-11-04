import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoadingScreen } from './loading-screen';
import { LanguageContext } from './language';
import { BeforeAfterSlider, clampWipePercent } from './before-after-slider';

describe('loading screen and comparison slider', () => {
  it('blocks interaction and shows the mini-game', () => {
    const html = renderToStaticMarkup(
      createElement(LoadingScreen, { message: 'Generating city…' }),
    );
    expect(html).toContain('Generating city…');
    expect(html).toContain('jump the cacti');
    expect(html).toContain('Dino runner game');
    expect(html).toContain('Please wait, we are preparing the city…');
    expect(html).not.toContain('Generando la ciudad');
    expect(html).toContain('aria-busy="true"');
  });

  it('follows the active language instead of always using Spanish', () => {
    const html = renderToStaticMarkup(
      createElement(
        LanguageContext.Provider,
        { value: 'es' },
        createElement(LoadingScreen, { message: 'Generando la ciudad…' }),
      ),
    );
    expect(html).toContain('Generando la ciudad…');
    expect(html).toContain('Cargando');
    expect(html).toContain('saltar los cactus');
    expect(html).not.toContain('jump the cacti');
  });

  it('renders the game canvas with the Chrome offline light look', () => {
    const html = renderToStaticMarkup(
      createElement(LoadingScreen, { message: 'Generating…' }),
    );
    expect(html).toContain('#f7f7f7');
    expect(html).not.toContain('#ffffff14');
  });

  it('clamps the wipe percentage', () => {
    expect(clampWipePercent(-20)).toBe(0);
    expect(clampWipePercent(130)).toBe(100);
    expect(clampWipePercent(Number.NaN)).toBe(50);
    expect(clampWipePercent(42)).toBe(42);
  });

  it('asks for an after capture until one exists', () => {
    const html = renderToStaticMarkup(
      createElement(BeforeAfterSlider, {
        beforeImage: 'data:image/png;base64,x',
        afterImage: null,
        wipePercent: 50,
        onWipeChange: () => {},
        onCaptureAfter: () => {},
      }),
    );
    expect(html).toContain('Capturar el “después” ahora');
    expect(html).toContain('ANTES');
  });
});
