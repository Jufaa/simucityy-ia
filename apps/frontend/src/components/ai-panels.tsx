import { useState } from 'react';
import type { AiCityPlanResult } from './ai-city';

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
  const [description, setDescription] = useState('');
  return (
    <section aria-label="Crear ciudad con IA" style={{ margin: '12px 0' }}>
      <strong>Crear ciudad con IA (Meta)</strong>
      <p style={{ fontSize: 12 }}>
        Describí la ciudad; el modelo propone parámetros validados y el
        generador local la construye. Sin conexión, se usa un plan local.
      </p>
      <textarea
        aria-label="Descripción de la ciudad"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        rows={3}
        style={{ width: '100%', boxSizing: 'border-box' }}
        placeholder="Una ciudad costera con río ancho, edificios bajos y muchos parques"
      />
      <button
        type="button"
        disabled={props.busy}
        onClick={() => props.onCreate(description)}
        style={{ marginTop: 6 }}
      >
        {props.busy ? 'Generando…' : 'Crear con IA'}
      </button>
      {props.plan && (
        <div style={{ fontSize: 12, marginTop: 8 }}>
          <strong>{props.plan.name}</strong>{' '}
          <span>
            {props.plan.source === 'meta' ? '· Meta AI' : '· Sin IA (local)'}
          </span>
          <p style={{ margin: '4px 0' }}>{props.plan.summary}</p>
          <p style={{ margin: '4px 0' }}>
            Semilla {props.plan.seed} ·{' '}
            {props.plan.mode === 'city' ? 'Ciudad grande' : 'Distrito'} ·{' '}
            {props.plan.profile.buildingTarget} edificios ·{' '}
            {props.plan.profile.parkTarget} parques
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
}) {
  return (
    <section aria-label="Agente de intervenciones" style={{ margin: '12px 0' }}>
      <strong>Agente de intervenciones (Meta)</strong>
      <p style={{ fontSize: 12 }}>
        El modelo propone drenajes y medidas con las métricas medidas; el
        simulador aplica y vuelve a medir con la misma semilla. Máximo 3
        iteraciones.
      </p>
      <button
        type="button"
        disabled={props.busy || props.done || props.disabledReason !== null}
        onClick={props.onRun}
      >
        {props.busy
          ? 'Consultando…'
          : props.done
            ? 'Agente terminado'
            : `Ejecutar iteración ${props.iteration + 1} de 3`}
      </button>
      {props.disabledReason && (
        <p style={{ fontSize: 12 }}>{props.disabledReason}</p>
      )}
      {props.history.length > 0 && (
        <ol style={{ fontSize: 12, paddingLeft: 18, margin: '8px 0' }}>
          {props.history.map((entry) => (
            <li key={entry.iteration}>
              Iteración {entry.iteration}: {entry.drains} drenajes ·{' '}
              {entry.source === 'meta' ? 'Meta AI' : 'Sin IA (local)'}
              <br />
              {entry.rationale}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
