import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AgentPanel, AiCityPanel } from './ai-panels';

it('labels the Meta source and shows the applied plan summary', () => {
  const html = renderToStaticMarkup(
    createElement(AiCityPanel, {
      busy: false,
      onCreate: () => {},
      plan: {
        name: 'Ciudad del río',
        summary: 'Resumen',
        seed: 42,
        mode: 'district',
        source: 'meta',
        profile: {
          buildingTarget: 150,
          parkTarget: 4,
          heightScale: 1,
          lakeScale: 1,
          riverWidthScale: 1.1,
        },
      },
    }),
  );
  expect(html).toContain('Meta AI');
  expect(html).toContain('Ciudad del río');
  expect(html).toContain('Crear con IA');
});

it('labels the honest local fallback and agent history', () => {
  const html = renderToStaticMarkup(
    createElement(AgentPanel, {
      busy: false,
      iteration: 1,
      done: false,
      disabledReason: null,
      onRun: () => {},
      history: [
        {
          iteration: 1,
          drains: 4,
          source: 'fallback',
          rationale: 'Motivo medido',
        },
      ],
    }),
  );
  expect(html).toContain('Sin IA (local)');
  expect(html).toContain('Motivo medido');
  expect(html).toContain('iteración 2 de 3');
});
