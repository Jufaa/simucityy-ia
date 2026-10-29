import type { CSSProperties } from 'react';
import {
  HAZARD_KINDS,
  HAZARD_PRESETS,
  type HazardKind,
} from '@simulicity/hazards';

const detail = (kind: HazardKind): string => {
  const preset = HAZARD_PRESETS[kind];
  if (preset.magnitude !== undefined) return `Magnitud ${preset.magnitude}`;
  if (preset.windSpeedKmh !== undefined)
    return `Rachas ${preset.windSpeedKmh} km/h`;
  if (preset.waveHeightInMeters !== undefined)
    return `Ola ${preset.waveHeightInMeters} m`;
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
            <span style={{ color: '#60787a' }}>{detail(kind)}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
