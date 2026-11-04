import type { CSSProperties } from 'react';
import {
  HAZARD_KINDS,
  HAZARD_PRESETS,
  type HazardKind,
} from '@simulicity/hazards';

const detail = (
  kind: HazardKind,
  overrides: { waveHeightInMeters?: number; earthquakeMagnitude?: number },
): string => {
  const preset = HAZARD_PRESETS[kind];
  if (preset.magnitude !== undefined)
    return `Magnitud ${(overrides.earthquakeMagnitude ?? preset.magnitude).toFixed(1)}`;
  if (preset.windSpeedKmh !== undefined)
    return `Rachas ${preset.windSpeedKmh} km/h`;
  if (preset.waveHeightInMeters !== undefined)
    return `Ola ${overrides.waveHeightInMeters ?? preset.waveHeightInMeters} m`;
  return `Lluvia ${preset.rainIntensityMmPerHour} mm/h`;
};

const buttonStyle = (selected: boolean): CSSProperties => ({
  border: selected ? '2px solid #24655e' : '1px solid #d3dfdf',
  borderRadius: 9,
  padding: '6px 9px',
  background: selected ? '#e2eeeb' : '#fff',
  color: '#20353a',
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
  waveHeightInMeters?: number;
  earthquakeMagnitude?: number;
}) {
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
          color: '#425466',
        }}
      >
        Catástrofe
      </legend>
      {HAZARD_KINDS.map((kind) => {
        const preset = HAZARD_PRESETS[kind];
        const selected = props.value === kind;
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={selected}
            aria-label={`Catástrofe: ${preset.label}`}
            title={preset.description}
            style={buttonStyle(selected)}
            onClick={() => props.onChange(kind)}
          >
            <strong>{preset.label}</strong>
            <br />
            <span style={{ color: '#60787a' }}>{detail(kind, props)}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
