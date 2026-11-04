import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { CitizenVoicePanel, NewsTicker, WhatsAppPanel } from './extras-panel';

it('renders the WhatsApp alerts, the citizen answer and the news ticker without icons', () => {
  const alerts = renderToStaticMarkup(
    createElement(WhatsAppPanel, {
      messages: [
        { timeLabel: '5 min', from: 'Municipalidad', text: 'ALERTA de prueba' },
      ],
    }),
  );
  expect(alerts).toContain('WhatsApp');
  expect(alerts).toContain('ALERTA de prueba');
  const citizen = renderToStaticMarkup(
    createElement(CitizenVoicePanel, {
      citizens: [{ id: 'citizen-1', status: 'evacuating' }],
      busy: false,
      answer: {
        citizenId: 'citizen-1',
        text: 'Estoy evacuando.',
        source: 'meta',
      },
      onAsk: () => {},
    }),
  );
  expect(citizen).toContain('Estoy evacuando.');
  expect(citizen).toContain('Meta AI');
  const ticker = renderToStaticMarkup(
    createElement(NewsTicker, {
      headline: 'La ola llego a la costa',
      detail: '3 edificios expuestos',
    }),
  );
  expect(ticker).toContain('BREAKING');
  expect(ticker).toContain('La ola llego a la costa');
  // The ticker floats above the bottom control bar, never over it.
  expect(ticker).toContain('bottom:84px');
});
