import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CityToolbar } from './city-toolbar';

it('keeps compact primary controls and truthful local-asset/automatic simulation status visible', () => {
  const noop = () => {};
  const html = renderToStaticMarkup(
    CityToolbar({
      buildings: 190,
      people: 200,
      seed: 123,
      organic: true,
      running: true,
      ready: true,
      panelOpen: false,
      view: 'city',
      elapsedSeconds: 120,
      assetStatus: 'ready',
      onPanelToggle: noop,
      onRegenerate: noop,
      onView: noop,
      onToggle: noop,
      onReset: noop,
    }),
  );
  expect(html).toContain('Modelos locales CC0');
  expect(html).toContain('190 edificios');
  expect(html).toContain('Simulación automática');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('Otra ciudad');
  expect(html).toContain('Pausar');
});

it('does not pretend failed assets loaded and keeps pause/reset available', () => {
  const noop = () => {};
  const html = renderToStaticMarkup(
    CityToolbar({
      buildings: 20,
      people: 2,
      seed: 1,
      organic: false,
      running: false,
      ready: true,
      panelOpen: true,
      view: 'world',
      elapsedSeconds: 0,
      assetStatus: 'fallback',
      onPanelToggle: noop,
      onRegenerate: noop,
      onView: noop,
      onToggle: noop,
      onReset: noop,
    }),
  );
  expect(html).toContain('Vista procedural de respaldo');
  expect(html).toContain('Continuar');
  expect(html).toContain('Reiniciar');
  expect(html).toContain('aria-expanded="true"');
});

it('offers random generation separately without replacing the existing seed-step action', () => {
  const noop = () => {};
  const html = renderToStaticMarkup(
    CityToolbar({
      buildings: 120,
      people: 200,
      seed: 55,
      organic: true,
      running: false,
      ready: true,
      panelOpen: false,
      view: 'city',
      elapsedSeconds: 0,
      assetStatus: 'ready',
      onPanelToggle: noop,
      onRegenerate: noop,
      onRandom: noop,
      onView: noop,
      onToggle: noop,
      onReset: noop,
    }),
  );
  expect(html).toContain('Otra ciudad');
  expect(html).toContain('Ciudad aleatoria');
});

it('keeps secondary hazard choices available without covering the default city view', () => {
  const noop = () => {};
  const html = renderToStaticMarkup(
    CityToolbar({
      buildings: 850,
      people: 300,
      seed: 123,
      organic: true,
      running: true,
      ready: true,
      panelOpen: false,
      view: 'world',
      elapsedSeconds: 0,
      assetStatus: 'ready',
      hazard: 'rain',
      onHazard: noop,
      onPanelToggle: noop,
      onRegenerate: noop,
      onView: noop,
      onToggle: noop,
      onReset: noop,
    }),
  );
  expect(html).toContain('<summary');
  expect(html).toContain('Catástrofes');
  expect(html).not.toMatch(/<details[^>]*\bopen/);
  expect(html).toContain('Tsunami');
});

it('keeps peaceful mode and pedestrian inspection explicit without hiding pause/reset', () => {
  const noop = () => {};
  const html = renderToStaticMarkup(
    CityToolbar({
      buildings: 420,
      people: 300,
      seed: 123,
      organic: true,
      running: true,
      ready: true,
      panelOpen: false,
      view: 'city',
      elapsedSeconds: 40,
      assetStatus: 'ready',
      hazardsEnabled: false,
      onModeToggle: noop,
      onStreetView: noop,
      onPanelToggle: noop,
      onRegenerate: noop,
      onView: noop,
      onToggle: noop,
      onReset: noop,
    }),
  );
  expect(html).toContain('Vista peatonal');
  expect(html).toContain('Iniciar catástrofe');
  expect(html).toContain('Vida cotidiana');
  expect(html).toContain('Pausar');
  expect(html).toContain('Reiniciar');
});
