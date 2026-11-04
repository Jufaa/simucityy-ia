import type { CSSProperties } from 'react';

/**
 * Shared visual language of the creation screens (start, AI chat and the
 * full-screen real-zone importer): dark glass panels, light ink and a
 * teal accent. Map/simulation rendering must not consume these tokens;
 * they only style chrome around the canvas.
 */
export const simTheme = {
  panel: 'rgba(13,27,32,0.78)',
  panelStrong: 'rgba(13,27,32,0.92)',
  border: 'rgba(233,242,240,0.14)',
  ink: '#e9f2f0',
  muted: 'rgba(233,242,240,0.62)',
  accent: '#2dd4bf',
  primaryBackground: 'linear-gradient(135deg, #0f766e, #14b8a6)',
  fieldBackground: 'rgba(233,242,240,0.06)',
} as const;

export const simGlassPanel: CSSProperties = {
  background: simTheme.panel,
  color: simTheme.ink,
  border: `1px solid ${simTheme.border}`,
  borderRadius: 16,
  boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
  backdropFilter: 'blur(12px)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

export const simPrimaryButton: CSSProperties = {
  border: 0,
  borderRadius: 10,
  padding: '9px 14px',
  background: simTheme.primaryBackground,
  color: '#fff',
  cursor: 'pointer',
  font: 'inherit',
  fontWeight: 700,
};

export const simGhostButton: CSSProperties = {
  border: `1px solid ${simTheme.border}`,
  borderRadius: 10,
  padding: '9px 14px',
  background: simTheme.fieldBackground,
  color: simTheme.ink,
  cursor: 'pointer',
  font: 'inherit',
  fontWeight: 600,
};

export const simSelectedButton: CSSProperties = {
  border: `1px solid ${simTheme.accent}`,
  background: 'rgba(45,212,191,0.16)',
  color: '#fff',
};

export const simField: CSSProperties = {
  background: simTheme.fieldBackground,
  color: simTheme.ink,
  border: `1px solid ${simTheme.border}`,
  borderRadius: 9,
};
