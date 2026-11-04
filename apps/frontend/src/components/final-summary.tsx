import type { CSSProperties } from 'react';
import type { FinalSummaryInput } from './simulation-launch';
import { pick, useLanguage } from './language';
import { simGhostButton, simPrimaryButton, simTheme } from './ui-theme';

const heroCard: CSSProperties = {
  background: 'rgba(233,242,240,0.05)',
  border: `1px solid ${simTheme.border}`,
  borderRadius: 14,
  padding: '14px 16px',
};

const heroLabel: CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: simTheme.muted,
  marginBottom: 6,
};

const heroValue: CSSProperties = {
  display: 'block',
  fontSize: 30,
  fontWeight: 750,
  letterSpacing: '-0.02em',
  color: '#fff',
  lineHeight: 1,
};

const heroSub: CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: simTheme.muted,
  marginTop: 6,
};

/** End-of-simulation summary: what happened, what was lost. */
export function FinalSummary(props: {
  title: string;
  input: FinalSummaryInput;
  narrative: string[];
  onDownloadReport(): void;
  onSaveScenario?(): void;
  onRestart(): void;
  onClose(): void;
}) {
  const language = useLanguage();
  const input = props.input;
  const evacuatedPercent =
    input.totalCitizens > 0
      ? Math.round((input.evacuated / input.totalCitizens) * 100)
      : 0;
  const details: { label: string; value: string }[] = [
    {
      label: pick(language, 'Simulated time', 'Tiempo simulado'),
      value: `${Math.floor(input.elapsedSeconds / 60)} min`,
    },
    {
      label: pick(language, 'Exposed buildings', 'Edificios expuestos'),
      value: `${input.exposedBuildings}${
        input.totalBuildings > 0
          ? ` (${Math.round((input.exposedBuildings / input.totalBuildings) * 100)}%)`
          : ''
      }`,
    },
    {
      label: pick(language, 'Damaged buildings', 'Edificios dañados'),
      value: `${input.damagedBuildings}`,
    },
    {
      label: pick(
        language,
        'Blocked street segments',
        'Tramos de calle bloqueados',
      ),
      value: `${input.blockedRoads}`,
    },
    ...(input.withoutShelter !== undefined
      ? [
          {
            label: pick(
              language,
              'Without shelter at the end',
              'Sin refugio al terminar',
            ),
            value: `${input.withoutShelter}`,
          },
        ]
      : []),
    ...(input.shelterCapacity !== undefined
      ? [
          {
            label: pick(
              language,
              'Shelters (occupancy / capacity)',
              'Refugios (ocupación/capacidad)',
            ),
            value: `${input.shelterOccupancy ?? 0} / ${input.shelterCapacity}`,
          },
        ]
      : []),
    ...(input.vulnerableTotal !== undefined && input.vulnerableTotal > 0
      ? [
          {
            label: pick(
              language,
              'Vulnerable buildings exposed',
              'Edificios vulnerables expuestos',
            ),
            value: `${input.vulnerableExposed ?? 0} ${pick(language, 'of', 'de')} ${input.vulnerableTotal} (${pick(language, 'school/hospital/care home', 'escuela/hospital/residencia')})`,
          },
        ]
      : []),
  ];
  return (
    <div
      role="dialog"
      aria-label={pick(
        language,
        'Simulation summary',
        'Resumen de la simulación',
      )}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 150,
        background: 'rgba(4,12,16,0.72)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: 'min(560px, 92vw)',
          maxHeight: '88vh',
          overflowY: 'auto',
          background: simTheme.panelStrong,
          color: simTheme.ink,
          border: `1px solid ${simTheme.border}`,
          borderRadius: 18,
          padding: 22,
          boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
        }}
      >
        <span
          style={{
            display: 'block',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: simTheme.accent,
            marginBottom: 8,
          }}
        >
          {pick(language, 'Simulation summary', 'Resumen de la simulación')}
        </span>
        <strong style={{ fontSize: 19, color: '#fff', lineHeight: 1.25 }}>
          {props.title}
        </strong>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginTop: 16,
          }}
        >
          <div style={heroCard}>
            <span style={heroLabel}>
              {pick(language, 'Evacuated', 'Evacuados')}
            </span>
            <span style={{ ...heroValue, color: simTheme.accent }}>
              {evacuatedPercent}%
            </span>
            <span style={heroSub}>
              {input.evacuated} {pick(language, 'of', 'de')}{' '}
              {input.totalCitizens} {pick(language, 'people', 'personas')}
            </span>
            <div
              aria-hidden="true"
              style={{
                height: 6,
                borderRadius: 3,
                background: 'rgba(233,242,240,0.14)',
                marginTop: 10,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${evacuatedPercent}%`,
                  background: simTheme.accent,
                  borderRadius: 3,
                }}
              />
            </div>
          </div>
          <div style={heroCard}>
            <span style={heroLabel}>
              {pick(language, 'Trapped', 'Atrapados')}
            </span>
            <span
              style={{
                ...heroValue,
                color: input.trapped > 0 ? '#fda4af' : '#fff',
              }}
            >
              {input.trapped}
            </span>
            <span style={heroSub}>
              {pick(
                language,
                'people need rescue',
                'personas requieren rescate',
              )}
            </span>
          </div>
          <div style={heroCard}>
            <span style={heroLabel}>
              {pick(language, 'Collapsed buildings', 'Edificios derrumbados')}
            </span>
            <span
              style={{
                ...heroValue,
                color: input.collapsedBuildings > 0 ? '#fda4af' : '#fff',
              }}
            >
              {input.collapsedBuildings}
            </span>
            <span style={heroSub}>
              {input.damagedBuildings}{' '}
              {pick(language, 'damaged of', 'dañados de')}{' '}
              {input.totalBuildings} {pick(language, 'buildings', 'edificios')}
            </span>
          </div>
          <div style={heroCard}>
            <span style={heroLabel}>
              {pick(language, 'Max water depth', 'Agua máxima')}
            </span>
            <span style={heroValue}>
              {(input.maxWaterDepthInMeters * 100).toFixed(0)}
              <span style={{ fontSize: 16, color: simTheme.muted }}> cm</span>
            </span>
            <span style={heroSub}>
              {input.blockedRoads}{' '}
              {pick(
                language,
                'street segments blocked',
                'tramos de calle bloqueados',
              )}
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4px 20px',
            marginTop: 16,
          }}
        >
          {details.map((row) => (
            <div
              key={row.label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                padding: '6px 0',
                borderBottom: '1px solid rgba(233,242,240,0.08)',
                fontSize: 13,
              }}
            >
              <span style={{ color: simTheme.muted }}>{row.label}</span>
              <strong style={{ color: '#fff', textAlign: 'right' }}>
                {row.value}
              </strong>
            </div>
          ))}
        </div>

        {props.narrative.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <span style={heroLabel}>
              {pick(language, 'Analysis', 'Análisis')}
            </span>
            {props.narrative.map((line) => (
              <p
                key={line}
                style={{
                  fontSize: 13,
                  lineHeight: 1.55,
                  margin: '0 0 8px',
                  paddingLeft: 12,
                  borderLeft: `2px solid ${simTheme.accent}`,
                  color: 'rgba(233,242,240,0.82)',
                }}
              >
                {line}
              </p>
            ))}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 18,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={props.onDownloadReport}
            style={simPrimaryButton}
          >
            {pick(language, 'Download report', 'Descargar reporte')}
          </button>
          {props.onSaveScenario && (
            <button
              type="button"
              onClick={props.onSaveScenario}
              style={simGhostButton}
            >
              {pick(language, 'Save scenario', 'Guardar escenario')}
            </button>
          )}
          <button
            type="button"
            onClick={props.onRestart}
            style={simGhostButton}
          >
            {pick(language, 'Simulate again', 'Simular de nuevo')}
          </button>
          <button type="button" onClick={props.onClose} style={simGhostButton}>
            {pick(language, 'Close', 'Cerrar')}
          </button>
        </div>
      </div>
    </div>
  );
}
