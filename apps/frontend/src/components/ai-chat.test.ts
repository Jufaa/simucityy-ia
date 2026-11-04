import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AiChatPanel } from './city-start-screen';

it('shows the conversation, an input to describe the city and a build button once a plan exists', () => {
  const html = renderToStaticMarkup(
    createElement(AiChatPanel, {
      busy: false,
      plan: {
        name: 'Ribera Baja',
        summary: 'Ciudad junto al rio',
        seed: 42,
        mode: 'district',
        source: 'meta',
        profile: {
          buildingTarget: 130,
          parkTarget: 4,
          heightScale: 0.7,
          lakeScale: 0.9,
          riverWidthScale: 1.15,
        },
      },
      messages: [
        { role: 'user', text: 'quiero un rio ancho' },
        { role: 'assistant', text: 'Propongo Ribera Baja' },
      ],
      onSend: () => {},
      onBuild: () => {},
      onBack: () => {},
    }),
  );
  expect(html).toContain('quiero un rio ancho');
  expect(html).toContain('Propongo Ribera Baja');
  expect(html).toContain('Describe your city');
  expect(html).toContain('Build this city');
  expect(html).toContain('Meta AI');
  expect(html).toContain('Dictate');
});
