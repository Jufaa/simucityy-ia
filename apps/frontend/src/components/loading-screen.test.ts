import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoadingScreen } from './loading-screen';
import { BeforeAfterSlider, clampWipePercent } from './before-after-slider';

describe('loading screen and comparison slider', () => {
  it('blocks interaction and shows the mini-game', () => {
    const html = renderToStaticMarkup(
      createElement(LoadingScreen, { message: 'Importando la zona…' }),
    );
    expect(html).toContain('Importando la zona…');
    expect(html).toContain('dino saltando cactus');
    expect(html).toContain('Mini-juego');
    expect(html).toContain('aria-busy="true"');
  });

  it('renders the game canvas on an opaque dark background', () => {
    const html = renderToStaticMarkup(
      createElement(LoadingScreen, { message: 'Generando…' }),
    );
    expect(html).toContain('#0a1f16');
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
