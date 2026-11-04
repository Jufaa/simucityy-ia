import type { CSSProperties } from 'react';
import { pick, useLanguage } from './language';

const HAZARD_LABELS: Record<HazardKind, { en: string; es: string }> = {
  rain: { en: 'Intense rain', es: 'Lluvia intensa' },
  'river-overflow': { en: 'River overflow', es: 'Desborde de río' },
  tsunami: { en: 'Tsunami', es: 'Tsunami' },
  earthquake: { en: 'Earthquake', es: 'Terremoto' },
  'strong-wind': { en: 'Strong winds', es: 'Vientos fuertes' },
};
import {
  HAZARD_KINDS,
  HAZARD_PRESETS,
  type HazardKind,
} from '@simulicity/hazards';

const detail = (
  kind: HazardKind,
  overrides: {
    waveHeightInMeters?: number | undefined;
    earthquakeMagnitude?: number | undefined;
  },
  language: 'en' | 'es' = 'es',
): string => {
  const preset = HAZARD_PRESETS[kind];
  if (preset.magnitude !== undefined)
    return `${pick(language, 'Magnitude', 'Magnitud')} ${(overrides.earthquakeMagnitude ?? preset.magnitude).toFixed(1)}`;
  if (preset.windSpeedKmh !== undefined)
    return `${pick(language, 'Gusts', 'Rachas')} ${preset.windSpeedKmh} km/h`;
  if (preset.waveHeightInMeters !== undefined)
    return `${pick(language, 'Wave', 'Ola')} ${overrides.waveHeightInMeters ?? preset.waveHeightInMeters} m`;
  return `${pick(language, 'Rain', 'Lluvia')} ${preset.rainIntensityMmPerHour} mm/h`;
};

const buttonStyle = (selected: boolean): CSSProperties => ({
  border: selected ? '1px solid #2dd4bf' : '1px solid rgba(233,242,240,0.16)',
  borderRadius: 9,
  padding: '6px 9px',
  background: selected ? 'rgba(45,212,191,0.16)' : 'rgba(233,242,240,0.05)',
  color: '#e9f2f0',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 12,
  lineHeight: 1.25,
  textAlign: 'left',
});

/** Selector de catástrofe: cambiarla reinicia la simulación con ese evento. */
export function HazardSelector(props: {
  value: HazardKind;
  onChange(kind: HazardKind): void;
  /** User-chosen scales (default: the presets); shown on the buttons. */
  waveHeightInMeters?: number | undefined;
  earthquakeMagnitude?: number | undefined;
}) {
  const language = useLanguage();
  return (
    <fieldset
      style={{
        border: 0,
        margin: 0,
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
      }}
    >
      <legend
        style={{
          float: 'left',
          padding: '6px 2px 6px 0',
          fontWeight: 700,
          color: 'rgba(233,242,240,0.62)',
        }}
      >
        {pick(language, 'Hazard', 'Catástrofe')}
      </legend>
      {HAZARD_KINDS.map((kind) => {
        const preset = HAZARD_PRESETS[kind];
        const selected = props.value === kind;
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={selected}
            aria-label={`${pick(language, 'Hazard', 'Catástrofe')}: ${HAZARD_LABELS[kind][language]}`}
            title={preset.description}
            style={buttonStyle(selected)}
            onClick={() => props.onChange(kind)}
          >
            <strong style={{ color: '#fff' }}>
              {HAZARD_LABELS[kind][language]}
            </strong>
            <br />
            <span style={{ color: 'rgba(233,242,240,0.62)' }}>
              {detail(kind, props, language)}
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}
