import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CityToolbar } from './city-toolbar';

it('keeps compact primary controls and truthful local-asset/automatic simulation status visible', () => {
  const noop = () => {};
  const html = renderToStaticMarkup(
    createElement(CityToolbar, {
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
      onView: noop,
      onToggle: noop,
      onReset: noop,
    }),
  );
  expect(html).toContain('Local CC0 models');
  expect(html).toContain('190 buildings');
  expect(html).toContain('Simulation running');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain('Another city');
  expect(html).toContain('Pause');
});

it('offers time speed multipliers up to x64 in the main controls', () => {
  const noop = () => {};
  const html = renderToStaticMarkup(
    createElement(CityToolbar, {
      buildings: 20,
      people: 2,
      seed: 1,
      organic: true,
      running: true,
      ready: true,
      panelOpen: false,
      view: 'city',
      elapsedSeconds: 0,
      assetStatus: 'ready',
      timeScale: 2,
      onTimeScale: noop,
      onPanelToggle: noop,
      onView: noop,
      onToggle: noop,
      onReset: noop,
    }),
  );
  expect(html).toContain('Time speed');
  expect(html).toContain('×1');
  expect(html).toContain('×2');
  expect(html).toContain('×4');
  expect(html).toContain('×8');
  expect(html).toContain('×16');
  expect(html).toContain('×32');
  expect(html).toContain('×64');
  expect(html).toContain('aria-pressed="true"');
});

it('does not pretend failed assets loaded and keeps pause/reset available', () => {
  const noop = () => {};
  const html = renderToStaticMarkup(
    createElement(CityToolbar, {
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
      onView: noop,
      onToggle: noop,
      onReset: noop,
    }),
  );
  expect(html).toContain('Procedural fallback view');
  expect(html).toContain('Continue');
  expect(html).toContain('Reset');
  expect(html).toContain('aria-expanded="true"');
});

it('shows a primary real-zone import action next to the example-city actions', () => {
  const noop = () => {};
  const html = renderToStaticMarkup(
    createElement(CityToolbar, {
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
      onRandom: noop,
      onImportZone: noop,
      onView: noop,
      onToggle: noop,
      onReset: noop,
    }),
  );
  expect(html).toContain('Real zone or plan');
  expect(html).toContain('Random city');
  expect(html).not.toContain('Another city');
  expect(html).toContain('Settings');
});

it('offers random generation without a duplicate next-city action', () => {
  const noop = () => {};
  const html = renderToStaticMarkup(
    createElement(CityToolbar, {
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
      onRandom: noop,
      onView: noop,
      onToggle: noop,
      onReset: noop,
    }),
  );
  expect(html).not.toContain('Another city');
  expect(html).toContain('Random city');
});

it('uses the dark glass and teal theme of the creation screens', () => {
  const noop = () => {};
  const html = renderToStaticMarkup(
    createElement(CityToolbar, {
      buildings: 20,
      people: 2,
      seed: 1,
      organic: true,
      running: false,
      ready: true,
      panelOpen: false,
      view: 'city',
      elapsedSeconds: 0,
      assetStatus: 'ready',
      onPanelToggle: noop,
      onImportZone: noop,
      onView: noop,
      onToggle: noop,
      onReset: noop,
    }),
  );
  expect(html).toContain('rgba(13,27,32,0.78)');
  expect(html).toContain('linear-gradient(135deg, #0f766e, #14b8a6)');
  expect(html).not.toContain('background:#fff');
});
