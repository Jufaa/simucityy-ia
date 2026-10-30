import { useEffect, useState } from 'react';
import type { WorldCameraView, WorldLayerName } from './world-layer';

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
  const [draft, setDraft] = useState(String(seed));
  const [error, setError] = useState(false);
  useEffect(() => setDraft(String(seed)), [seed]);
  const names: Record<WorldLayerName, string> = {
    sea: 'Océano',
    lake: 'Lago / río',
  };
  return (
    <section
      aria-label="Generación del mundo"
      style={{
        margin: '12px 0',
        padding: 12,
        border: '1px solid #c7d5bd',
        borderRadius: 8,
        background: '#f3f7ee',
        fontSize: 12,
      }}
    >
      <strong>Territorio procedural · sintético</strong>
      <p>
        {width} × {height} m · río y lago · costa y océano
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
          Semilla{' '}
          <input
            aria-label="Semilla del mundo"
            type="number"
            min={0}
            max={4294967295}
            step={1}
            required
            value={draft}
            readOnly={!onSeed}
            onChange={(event) => setDraft(event.target.value)}
            style={{ width: 110, border: '1px solid #a8b6a0', padding: 4 }}
          />
        </label>{' '}
        <button type="submit" disabled={!onSeed}>
          Aplicar
        </button>
      </form>
      {error && <p role="alert">Usa un entero entre 0 y 4294967295.</p>}
      <button
        type="button"
        onClick={onGenerate}
        style={{
          margin: '8px 0',
          padding: '6px 10px',
          background: '#426f49',
          color: 'white',
          border: 0,
          borderRadius: 5,
        }}
      >
        Generar otro entorno
      </button>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {(Object.keys(names) as WorldLayerName[]).map((name) => (
          <label key={name}>
            <input
              type="checkbox"
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
          aria-pressed={view === 'world'}
          onClick={() => onView('world')}
        >
          Vista mundo
        </button>
        <button
          type="button"
          aria-pressed={view === 'city'}
          onClick={() => onView('city')}
        >
          Vista ciudad
        </button>
      </div>
      <p>Fuera del cuadrado solo se dibujan el río/lago y el océano.</p>
      <small>
        Regenerar el entorno reinicia la simulación; conserva la ciudad
        original. El mar y el lago son permanentes y no alimentan la inundación.
      </small>
    </section>
  );
}
