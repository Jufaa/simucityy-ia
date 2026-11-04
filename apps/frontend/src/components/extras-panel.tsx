import { useState } from 'react';
import type { AlertMessage } from './alerts';
import type { CitizenVoiceResult } from './citizen-voice';
import { pick, useLanguage } from './language';

/** Simulated municipal WhatsApp thread, fed only by measured event state. */
export function WhatsAppPanel(props: { messages: AlertMessage[] }) {
  const language = useLanguage();
  if (props.messages.length === 0) return null;
  return (
    <section
      aria-label={pick(language, 'WhatsApp alerts', 'Alertas por WhatsApp')}
      style={{
        marginTop: 12,
        border: '1px solid #cfe3d8',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <strong
        style={{
          display: 'block',
          background: '#075e54',
          color: '#fff',
          fontSize: 12,
          padding: '7px 10px',
        }}
      >
        {pick(
          language,
          'WhatsApp · City hall (simulated)',
          'WhatsApp · Municipalidad (simulado)',
        )}
      </strong>
      <div
        style={{
          background: '#e5ddd5',
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {props.messages.map((message, index) => (
          <div
            key={index}
            style={{
              background: '#fff',
              borderRadius: 8,
              padding: '6px 8px',
              fontSize: 11.5,
              lineHeight: 1.45,
              boxShadow: '0 1px 2px #0002',
            }}
          >
            <span
              style={{
                display: 'block',
                color: '#128c7e',
                fontWeight: 700,
                fontSize: 10.5,
              }}
            >
              {message.from} · {message.timeLabel}
            </span>
            {message.text}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Copies or shares the measured result as a resilience card text. */
export function ShareResultButton(props: { shareText: string }) {
  const language = useLanguage();
  const [label, setLabel] = useState<string | null>(null);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          const nav = typeof navigator !== 'undefined' ? navigator : null;
          if (nav && 'share' in nav) {
            await (
              nav as Navigator & {
                share(data: { text: string }): Promise<void>;
              }
            ).share({ text: props.shareText });
            setLabel(pick(language, 'Shared', 'Compartido'));
          } else if (
            nav &&
            (nav as Navigator & { clipboard?: Clipboard }).clipboard
          ) {
            await (
              nav as Navigator & { clipboard: Clipboard }
            ).clipboard.writeText(props.shareText);
            setLabel(
              pick(language, 'Copied to clipboard', 'Copiado al portapapeles'),
            );
          } else {
            setLabel(
              pick(
                language,
                'Could not share here',
                'No se pudo compartir acá',
              ),
            );
          }
        } catch {
          setLabel(null);
        }
      }}
      style={{
        width: '100%',
        marginTop: 10,
        padding: '9px 12px',
        borderRadius: 10,
        border: 0,
        background: 'linear-gradient(135deg, #0f766e, #14b8a6)',
        color: '#fff',
        font: '600 13px system-ui',
        cursor: 'pointer',
      }}
    >
      {label ?? pick(language, 'Share result', 'Compartir resultado')}
    </button>
  );
}

/** Bottom news-style ticker fed by the measured event timeline. */
export function NewsTicker(props: { headline: string; detail: string }) {
  const language = useLanguage();
  return (
    <div
      aria-label={pick(language, 'Breaking news', 'Ultimo momento')}
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        // Sits above the bottom control bar so it never covers the
        // time-speed buttons.
        bottom: 84,
        zIndex: 6,
        display: 'flex',
        alignItems: 'stretch',
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 6px 24px #0005',
        fontFamily: 'system-ui, sans-serif',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          background: '#c62828',
          color: '#fff',
          font: '700 11px system-ui',
          letterSpacing: '0.12em',
          padding: '9px 12px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {pick(language, 'BREAKING', 'ULTIMO MOMENTO')}
      </span>
      <span
        style={{
          background: 'rgba(10,20,24,0.92)',
          color: '#fff',
          fontSize: 13,
          padding: '9px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flex: 1,
        }}
      >
        <strong>{props.headline}</strong>
        <span style={{ color: '#b9cdc9' }}>{props.detail}</span>
      </span>
    </div>
  );
}

/** Ask one citizen what they are doing and why, from measured state. */
export function CitizenVoicePanel(props: {
  citizens: { id: string; status: string }[];
  busy: boolean;
  answer: (CitizenVoiceResult & { citizenId: string }) | null;
  onAsk(citizenId: string): void;
}) {
  const language = useLanguage();
  const [selected, setSelected] = useState('');
  const citizenId = selected || props.citizens[0]?.id || '';
  if (props.citizens.length === 0) return null;
  return (
    <section
      aria-label={pick(language, 'Citizens with AI', 'Habitantes con IA')}
      style={{ margin: '12px 0' }}
    >
      <strong>{pick(language, 'Citizens with AI', 'Habitantes con IA')}</strong>
      <p style={{ fontSize: 12 }}>
        {pick(
          language,
          'Pick a person and ask what they are doing and why. They answer from their measured state in the simulation.',
          'Elegí una persona y preguntale qué está haciendo y por qué. Responde con su estado medido en la simulación.',
        )}
      </p>
      <label style={{ display: 'block', fontSize: 12 }}>
        {pick(language, 'Person', 'Persona')}{' '}
        <select
          aria-label={pick(language, 'Person to ask', 'Persona a preguntar')}
          value={citizenId}
          onChange={(event) => setSelected(event.target.value)}
          style={{ maxWidth: '100%' }}
        >
          {props.citizens.slice(0, 60).map((citizen) => (
            <option key={citizen.id} value={citizen.id}>
              {citizen.id} · {citizen.status}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={props.busy || !citizenId}
        onClick={() => props.onAsk(citizenId)}
        style={{ marginTop: 6 }}
      >
        {props.busy
          ? pick(language, 'Asking…', 'Preguntando…')
          : pick(language, 'Ask what they are doing', 'Preguntar qué hace')}
      </button>
      {props.answer && (
        <blockquote
          style={{
            margin: '8px 0 0',
            padding: '8px 10px',
            background: '#eef6f3',
            borderRadius: 8,
            fontSize: 12.5,
          }}
        >
          “{props.answer.text}”
          <footer style={{ fontSize: 11, color: '#425466' }}>
            {props.answer.citizenId} ·{' '}
            {props.answer.source === 'meta'
              ? 'Meta AI'
              : pick(language, 'No AI (local)', 'Sin IA (local)')}
          </footer>
        </blockquote>
      )}
    </section>
  );
}
