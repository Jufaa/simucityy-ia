import { expect, it } from 'vitest';
import { buildAlertMessages } from './alerts';

it('builds the municipal alert chain from measured state only', () => {
  expect(
    buildAlertMessages({
      hazardLabel: 'tsunami',
      alarmMinutes: null,
      evacuated: 0,
      total: 10,
      trapped: 0,
      score: null,
    }),
  ).toEqual([]);
  const messages = buildAlertMessages({
    hazardLabel: 'tsunami',
    alarmMinutes: 12,
    evacuated: 10,
    total: 10,
    trapped: 0,
    score: 82,
  });
  expect(messages[0]?.text).toContain('ALERTA');
  expect(messages.some((m) => m.text.includes('10/10'))).toBe(true);
  expect(messages.some((m) => m.text.includes('82/100'))).toBe(true);
});
