import type { CSSProperties } from 'react';
import type { HazardKind } from '@simulicity/hazards';
import { HazardSelector } from './hazard-selector';
import {
  simGhostButton,
  simGlassPanel,
  simPrimaryButton,
  simSelectedButton,
  simTheme,
} from './ui-theme';
import {
  LanguageToggle,
  pick,
  useLanguage,
  type AppLanguage,
} from './language';

const button: CSSProperties = { ...simGhostButton, borderRadius: 9 };
const glass: CSSProperties = {
  ...simGlassPanel,
  position: 'absolute',
  fontSize: 12,
};

export function CityToolbar(props: {
  buildings: number;
  people: number;
  seed: number;
  organic: boolean;
  running: boolean;
  ready: boolean;
  panelOpen: boolean;
  view: 'world' | 'city';
  elapsedSeconds: number;
  assetStatus: 'loading' | 'ready' | 'fallback' | 'procedural';
  hazard?: HazardKind;
  onHazard?(kind: HazardKind): void;
  waveHeightInMeters?: number | undefined;
  earthquakeMagnitude?: number | undefined;
  timeScale?: 1 | 2 | 4 | 8 | 16 | 32 | 64;
  onTimeScale?(scale: 1 | 2 | 4 | 8 | 16 | 32 | 64): void;
  onPanelToggle(): void;
  onLanguageChange?(language: AppLanguage): void;
  onRandom?(): void;
  /** Opens the real-zone / plan import card. */
  onImportZone?(): void;
  onView(view: 'world' | 'city'): void;
  onToggle(): void;
  onReset(): void;
}) {
  const language = useLanguage();
  const assetLabel = {
    loading: pick(
      language,
      'Loading local models…',
      'Cargando modelos locales…',
    ),
    ready: pick(language, 'Local CC0 models', 'Modelos locales CC0'),
    fallback: pick(
      language,
      'Procedural fallback view',
      'Vista procedural de respaldo',
    ),
    procedural: pick(language, 'Procedural models', 'Modelos procedurales'),
  }[props.assetStatus];
  return (
    <>
      <header
        style={{
          ...glass,
          top: 16,
          left: 16,
          right: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <strong
            style={{ fontSize: 18, letterSpacing: '-0.04em', color: '#fff' }}
          >
            Simucity IA
          </strong>
          <span style={{ marginLeft: 12, color: simTheme.muted }}>
            {props.organic
              ? pick(language, 'Organic city', 'Ciudad orgánica')
              : pick(language, 'Original district', 'Distrito original')}{' '}
            · {assetLabel}
          </span>
          <div style={{ marginTop: 3, color: simTheme.muted }}>
            {props.buildings} {pick(language, 'buildings', 'edificios')} ·{' '}
            {props.people} {pick(language, 'people', 'personas')} ·{' '}
            {pick(language, 'Seed', 'Semilla')} {props.seed}
          </div>
        </div>
        {props.hazard && props.onHazard && (
          <HazardSelector
            value={props.hazard}
            onChange={props.onHazard}
            waveHeightInMeters={props.waveHeightInMeters}
            earthquakeMagnitude={props.earthquakeMagnitude}
          />
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {props.onRandom && (
            <button type="button" style={button} onClick={props.onRandom}>
              {pick(language, 'Random city', 'Ciudad aleatoria')}
            </button>
          )}
          {props.onImportZone && (
            <button
              type="button"
              style={simPrimaryButton}
              onClick={props.onImportZone}
            >
              {pick(language, 'Real zone or plan', 'Zona real o plano')}
            </button>
          )}
          <button
            type="button"
            style={
              props.panelOpen ? { ...button, ...simSelectedButton } : button
            }
            aria-expanded={props.panelOpen}
            aria-controls="city-settings"
            onClick={props.onPanelToggle}
          >
            {pick(language, 'Settings', 'Ajustes')}
          </button>
          {props.onLanguageChange && (
            <LanguageToggle
              language={language}
              onChange={props.onLanguageChange}
            />
          )}
        </div>
      </header>
      <nav
        aria-label="Controles principales de ciudad"
        style={{
          ...glass,
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: 'calc(100vw - 32px)',
          padding: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          flexWrap: 'wrap',
          width: 'max-content',
        }}
      >
        <button
          type="button"
          aria-pressed={props.view === 'city'}
          style={
            props.view === 'city' ? { ...button, ...simSelectedButton } : button
          }
          onClick={() => props.onView('city')}
        >
          {pick(language, 'City', 'Ciudad')}
        </button>
        <button
          type="button"
          aria-pressed={props.view === 'world'}
          style={
            props.view === 'world'
              ? { ...button, ...simSelectedButton }
              : button
          }
          onClick={() => props.onView('world')}
        >
          {pick(language, 'Surroundings', 'Entorno')}
        </button>
        <span
          style={{ padding: '0 8px', color: simTheme.muted }}
          role="status"
          aria-live="off"
        >
          {props.running
            ? pick(language, 'Simulation running', 'Simulación automática')
            : pick(language, 'Paused', 'En pausa')}{' '}
          · {Math.floor(props.elapsedSeconds / 60)} min
        </span>
        {props.onTimeScale && (
          <span
            role="group"
            aria-label={pick(language, 'Time speed', 'Velocidad del tiempo')}
            style={{ display: 'flex', gap: 4, alignItems: 'center' }}
          >
            <span style={{ padding: '0 4px', color: simTheme.muted }}>
              {pick(language, 'Time', 'Tiempo')}
            </span>
            {([1, 2, 4, 8, 16, 32, 64] as const).map((scale) => (
              <button
                key={scale}
                type="button"
                aria-pressed={(props.timeScale ?? 1) === scale}
                style={
                  (props.timeScale ?? 1) === scale
                    ? {
                        ...button,
                        ...simSelectedButton,
                        padding: '8px 9px',
                      }
                    : { ...button, padding: '8px 9px' }
                }
                onClick={() => props.onTimeScale!(scale)}
              >
                ×{scale}
              </button>
            ))}
          </span>
        )}
        <button
          type="button"
          disabled={!props.ready}
          style={{
            ...simPrimaryButton,
            opacity: props.ready ? 1 : 0.55,
            cursor: props.ready ? 'pointer' : 'not-allowed',
          }}
          onClick={props.onToggle}
        >
          {props.running
            ? pick(language, 'Pause', 'Pausar')
            : pick(language, 'Continue', 'Continuar')}
        </button>
        <button
          type="button"
          disabled={!props.ready}
          style={{
            ...button,
            opacity: props.ready ? 1 : 0.55,
            cursor: props.ready ? 'pointer' : 'not-allowed',
          }}
          onClick={props.onReset}
        >
          {pick(language, 'Reset', 'Reiniciar')}
        </button>
      </nav>
    </>
  );
}
