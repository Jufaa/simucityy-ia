import { describe, expect, it } from 'vitest';
import { fallbackCitizenVoice } from './citizen-voice';

describe('fallbackCitizenVoice', () => {
  it('narrates only the measured status in first person', () => {
    const trapped = fallbackCitizenVoice({
      status: 'trapped',
      hazardKind: 'earthquake',
      shelterAssigned: false,
      elapsedMinutes: 12,
    });
    expect(trapped.source).toBe('fallback');
    expect(trapped.text).toContain('atrapado');
    expect(
      fallbackCitizenVoice({
        status: 'evacuated',
        hazardKind: 'rain',
        shelterAssigned: true,
        elapsedMinutes: 30,
      }).text,
    ).toContain('a salvo');
  });
});
