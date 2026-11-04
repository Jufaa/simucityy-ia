import { useState } from 'react';
import type { AiCityPlanResult } from './ai-city';
import { pick, useLanguage } from './language';

export interface AgentHistoryEntry {
  iteration: number;
  drains: number;
  source: 'meta' | 'fallback';
  rationale: string;
}

export function AiCityPanel(props: {
  busy: boolean;
  plan: AiCityPlanResult | null;
  onCreate(description: string): void;
}) {
  const language = useLanguage();
  const [description, setDescription] = useState('');
  return (
    <section
      aria-label={pick(
        language,
        'Create a city with AI',
        'Crear ciudad con IA',
      )}
      style={{ margin: '12px 0' }}
    >
      <strong>
        {pick(
          language,
          'Create a city with AI (Meta)',
          'Crear ciudad con IA (Meta)',
        )}
      </strong>
      <p style={{ fontSize: 12 }}>
        {pick(
          language,
          'Describe the city; the model proposes validated parameters and the local generator builds it. With no connection, a local plan is used.',
          'Describí la ciudad; el modelo propone parámetros validados y el generador local la construye. Sin conexión, se usa un plan local.',
        )}
      </p>
      <textarea
        aria-label={pick(
          language,
          'City description',
          'Descripción de la ciudad',
        )}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        rows={3}
        style={{ width: '100%', boxSizing: 'border-box' }}
        placeholder={pick(
          language,
          'A coastal city with a wide river, low buildings and lots of parks',
          'Una ciudad costera con río ancho, edificios bajos y muchos parques',
        )}
      />
      <button
        type="button"
        disabled={props.busy}
        onClick={() => props.onCreate(description)}
        style={{ marginTop: 6 }}
      >
        {props.busy
          ? pick(language, 'Generating…', 'Generando…')
          : pick(language, 'Create with AI', 'Crear con IA')}
      </button>
      {props.plan && (
        <div style={{ fontSize: 12, marginTop: 8 }}>
          <strong>{props.plan.name}</strong>{' '}
          <span>
            {props.plan.source === 'meta'
              ? '· Meta AI'
              : pick(language, '· No AI (local)', '· Sin IA (local)')}
          </span>
          <p style={{ margin: '4px 0' }}>{props.plan.summary}</p>
          <p style={{ margin: '4px 0' }}>
            {pick(language, 'Seed', 'Semilla')} {props.plan.seed} ·{' '}
            {props.plan.mode === 'city'
              ? pick(language, 'Large city', 'Ciudad grande')
              : pick(language, 'District', 'Distrito')}{' '}
            · {props.plan.profile.buildingTarget}{' '}
            {pick(language, 'buildings', 'edificios')} ·{' '}
            {props.plan.profile.parkTarget} {pick(language, 'parks', 'parques')}
          </p>
        </div>
      )}
    </section>
  );
}

export function AgentPanel(props: {
  busy: boolean;
  iteration: number;
  done: boolean;
  history: AgentHistoryEntry[];
  disabledReason: string | null;
  onRun(): void;
  mayorBusy?: boolean;
  onMayor?: () => void;
}) {
  const language = useLanguage();
  return (
    <section
      aria-label={pick(
        language,
        'Intervention agent',
        'Agente de intervenciones',
      )}
      style={{ margin: '12px 0' }}
    >
      <strong>
        {pick(
          language,
          'Intervention agent (Meta)',
          'Agente de intervenciones (Meta)',
        )}
      </strong>
      <p style={{ fontSize: 12 }}>
        {pick(
          language,
          'The model proposes drains and measures from the measured metrics; the simulator applies them and measures again with the same seed. Maximum 3 iterations.',
          'El modelo propone drenajes y medidas con las métricas medidas; el simulador aplica y vuelve a medir con la misma semilla. Máximo 3 iteraciones.',
        )}
      </p>
      <button
        type="button"
        disabled={props.busy || props.done || props.disabledReason !== null}
        onClick={props.onRun}
      >
        {props.busy
          ? pick(language, 'Asking…', 'Consultando…')
          : props.done
            ? pick(language, 'Agent finished', 'Agente terminado')
            : `${pick(language, 'Run iteration', 'Ejecutar iteración')} ${props.iteration + 1} ${pick(language, 'of', 'de')} 3`}
      </button>
      {props.disabledReason && (
        <p style={{ fontSize: 12 }}>{props.disabledReason}</p>
      )}
      {props.onMayor && (
        <button
          type="button"
          disabled={
            props.busy || props.mayorBusy || props.disabledReason !== null
          }
          onClick={props.onMayor}
          style={{ display: 'block', marginTop: 8 }}
        >
          {props.mayorBusy
            ? pick(
                language,
                'The mayor is working…',
                'El alcalde está trabajando…',
              )
            : pick(
                language,
                'Mayor mode: let the AI solve it alone',
                'Modo alcalde: que la IA lo resuelva sola',
              )}
        </button>
      )}
      {props.history.length > 0 && (
        <ol style={{ fontSize: 12, paddingLeft: 18, margin: '8px 0' }}>
          {props.history.map((entry) => (
            <li key={entry.iteration}>
              {pick(language, 'Iteration', 'Iteración')} {entry.iteration}:{' '}
              {entry.drains} {pick(language, 'drains', 'drenajes')} ·{' '}
              {entry.source === 'meta'
                ? 'Meta AI'
                : pick(language, 'No AI (local)', 'Sin IA (local)')}
              <br />
              {entry.rationale}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
