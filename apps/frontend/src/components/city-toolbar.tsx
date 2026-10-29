import type { CSSProperties } from 'react';

const button: CSSProperties = {
  border: '1px solid #d3dfdf',
  borderRadius: 9,
  padding: '8px 12px',
  background: '#fff',
  color: '#20353a',
  cursor: 'pointer',
  font: 'inherit',
  fontWeight: 600,
};
const glass: CSSProperties = {
  position: 'absolute',
  background: 'rgba(249,252,250,0.94)',
  color: '#20353a',
  border: '1px solid #ffffffaa',
  borderRadius: 14,
  boxShadow: '0 8px 30px #193c4320',
  backdropFilter: 'blur(12px)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
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
  onPanelToggle(): void;
  onRegenerate(): void;
  onView(view: 'world' | 'city'): void;
  onToggle(): void;
  onReset(): void;
}) {
  const assetLabel = {
    loading: 'Cargando modelos locales…',
    ready: 'Modelos locales CC0',
    fallback: 'Vista procedural de respaldo',
    procedural: 'Modelos procedurales',
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
          <strong style={{ fontSize: 18, letterSpacing: '-0.04em' }}>
            Simucity IA
          </strong>
          <span style={{ marginLeft: 12, color: '#60787a' }}>
            {props.organic ? 'Ciudad orgánica' : 'Distrito original'} ·{' '}
            {assetLabel}
          </span>
          <div style={{ marginTop: 3, color: '#60787a' }}>
            {props.buildings} edificios · {props.people} personas · Semilla{' '}
            {props.seed}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {props.organic && (
            <button type="button" style={button} onClick={props.onRegenerate}>
              Otra ciudad
            </button>
          )}
          <button
            type="button"
            style={{
              ...button,
              background: props.panelOpen ? '#e2eeeb' : '#fff',
            }}
            aria-expanded={props.panelOpen}
            aria-controls="city-settings"
            onClick={props.onPanelToggle}
          >
            Ajustes
          </button>
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
          style={{
            ...button,
            background: props.view === 'city' ? '#e2eeeb' : '#fff',
          }}
          onClick={() => props.onView('city')}
        >
          Ciudad
        </button>
        <button
          type="button"
          aria-pressed={props.view === 'world'}
          style={{
            ...button,
            background: props.view === 'world' ? '#e2eeeb' : '#fff',
          }}
          onClick={() => props.onView('world')}
        >
          Entorno
        </button>
        <span
          style={{ padding: '0 8px', color: '#60787a' }}
          role="status"
          aria-live="off"
        >
          {props.running ? 'Simulación automática' : 'En pausa'} ·{' '}
          {Math.floor(props.elapsedSeconds / 60)} min
        </span>
        <button
          type="button"
          disabled={!props.ready}
          style={{ ...button, background: '#24655e', color: '#fff' }}
          onClick={props.onToggle}
        >
          {props.running ? 'Pausar' : 'Continuar'}
        </button>
        <button
          type="button"
          disabled={!props.ready}
          style={button}
          onClick={props.onReset}
        >
          Reiniciar
        </button>
      </nav>
    </>
  );
}
