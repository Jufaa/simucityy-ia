import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { CityToolbar } from './city-toolbar';
import { LanguageContext } from './language';

it('defaults the toolbar to English and switches it to Spanish from context', () => {
  const props = {
    buildings: 20,
    people: 2,
    seed: 1,
    organic: true,
    running: false,
    ready: true,
    panelOpen: false,
    view: 'city' as const,
    elapsedSeconds: 0,
    assetStatus: 'ready' as const,
    onPanelToggle: () => {},
    onView: () => {},
    onToggle: () => {},
    onReset: () => {},
  };
  const english = renderToStaticMarkup(createElement(CityToolbar, props));
  expect(english).toContain('Settings');
  expect(english).toContain('Continue');
  const spanish = renderToStaticMarkup(
    createElement(
      LanguageContext.Provider,
      { value: 'es' },
      createElement(CityToolbar, props),
    ),
  );
  expect(spanish).toContain('Ajustes');
  expect(spanish).toContain('Continuar');
});
