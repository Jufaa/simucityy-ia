import { useEffect, useState } from 'react';
import type { WorldCameraView, WorldLayerName } from './world-layer';
import { pick, useLanguage } from './language';
import {
  simField,
  simGhostButton,
  simPrimaryButton,
  simTheme,
} from './ui-theme';

export function WorldControls({
  seed,
  width,
  height,
  visible,
  view,
  onGenerate,
  onLayer,
  onView,
  onSeed,
}: {
  seed: number;
  width: number;
  height: number;
  visible: Record<WorldLayerName, boolean>;
  view: WorldCameraView;
  onGenerate: () => void;
  onLayer: (layer: WorldLayerName, visible: boolean) => void;
  onView: (view: WorldCameraView) => void;
  onSeed?: (seed: number) => void;
}) {
  const language = useLanguage();
  const tx = (en: string, es: string) => pick(language, en, es);
  const [draft, setDraft] = useState(String(seed));
  const [error, setError] = useState(false);
  useEffect(() => setDraft(String(seed)), [seed]);
  const names: Record<WorldLayerName, string> = {
    sea: tx('Ocean', 'Océano'),
    lake: tx('Lake / river', 'Lago / río'),
  };
  return (
    <section
      aria-label={tx('World generation', 'Generación del mundo')}
      style={{
        margin: '12px 0',
        padding: 12,
        border: `1px solid ${simTheme.border}`,
        borderRadius: 8,
        background: simTheme.fieldBackground,
        fontSize: 12,
      }}
    >
      <strong>
        {tx(
          'Procedural territory · synthetic',
          'Territorio procedural · sintético',
        )}
      </strong>
      <p>
        {width} × {height} m ·{' '}
        {tx('river and lake · coast and ocean', 'río y lago · costa y océano')}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const value = Number(draft);
          if (
            !draft.trim() ||
            !Number.isInteger(value) ||
            value < 0 ||
            value > 4294967295
          ) {
            setError(true);
            return;
          }
          setError(false);
          onSeed?.(value);
        }}
      >
        <label>
          {tx('Seed', 'Semilla')}{' '}
          <input
            aria-label={tx('World seed', 'Semilla del mundo')}
            type="number"
            min={0}
            max={4294967295}
            step={1}
            required
            value={draft}
            readOnly={!onSeed}
            onChange={(event) => setDraft(event.target.value)}
            style={{ ...simField, width: 110, padding: '6px 8px' }}
          />
        </label>{' '}
        <button type="submit" style={simGhostButton} disabled={!onSeed}>
          {tx('Apply', 'Aplicar')}
        </button>
      </form>
      {error && (
        <p role="alert">
          {tx(
            'Use an integer between 0 and 4294967295.',
            'Usa un entero entre 0 y 4294967295.',
          )}
        </p>
      )}
      <button
        type="button"
        onClick={onGenerate}
        style={{ ...simPrimaryButton, margin: '8px 0' }}
      >
        {tx('Generate another surroundings', 'Generar otro entorno')}
      </button>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {(Object.keys(names) as WorldLayerName[]).map((name) => (
          <label key={name}>
            <input
              type="checkbox"
              style={{ accentColor: simTheme.accent }}
              checked={visible[name]}
              onChange={(event) => onLayer(name, event.target.checked)}
            />{' '}
            {names[name]}
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          style={simGhostButton}
          aria-pressed={view === 'world'}
          onClick={() => onView('world')}
        >
          {tx('World view', 'Vista mundo')}
        </button>
        <button
          type="button"
          style={simGhostButton}
          aria-pressed={view === 'city'}
          onClick={() => onView('city')}
        >
          {tx('City view', 'Vista ciudad')}
        </button>
      </div>
      <p>
        {tx(
          'Outside the square only the river/lake and the ocean are drawn.',
          'Fuera del cuadrado solo se dibujan el río/lago y el océano.',
        )}
      </p>
      <small>
        {tx(
          'Regenerating the surroundings restarts the simulation; it keeps the original city. The sea and lake are permanent and do not feed the flooding.',
          'Regenerar el entorno reinicia la simulación; conserva la ciudad original. El mar y el lago son permanentes y no alimentan la inundación.',
        )}
      </small>
    </section>
  );
}
