import { useState } from 'react';
import type { CityGenerationMode } from './city-generation-preset';
import { pick, useLanguage } from './language';

export function parseCitySeed(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const seed = Number(value);
  return Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff
    ? seed
    : null;
}

export function CityGenerationControls(props: {
  seed: number;
  randomized: boolean;
  mode?: CityGenerationMode;
  onModeChange?(mode: CityGenerationMode): void;
  onGenerate(seed: number): void;
  onRandom(): void;
}) {
  const language = useLanguage();
  const tx = (en: string, es: string) => pick(language, en, es);
  const [seed, setSeed] = useState(String(props.seed));
  const parsed = parseCitySeed(seed);
  return (
    <section
      aria-label={tx('Procedural generation', 'Generación procedural')}
      style={{ margin: '12px 0' }}
    >
      <strong>{tx('City generation', 'Generación de ciudad')}</strong>
      <p style={{ fontSize: 12 }}>
        {props.randomized
          ? tx('Random profile', 'Perfil aleatorio')
          : tx('Original profile', 'Perfil original')}{' '}
        ·{' '}
        {tx(
          'No AI. The seed reproduces the layout and its features in this profile.',
          'Sin IA. La semilla reproduce el trazado y sus características en este perfil.',
        )}
      </p>
      {props.onModeChange && (
        <label style={{ display: 'block', marginBottom: 8 }}>
          {tx('Urban scale', 'Escala urbana')}{' '}
          <select
            aria-label={tx('Urban scale', 'Escala urbana')}
            value={props.mode ?? 'district'}
            onChange={(event) => {
              const mode = event.currentTarget.value;
              if (mode === 'district' || mode === 'city')
                props.onModeChange?.(mode);
            }}
          >
            <option value="district">{tx('District', 'Distrito')}</option>
            <option value="city">
              {tx('Large city · 1.2 km', 'Ciudad grande · 1,2 km')}
            </option>
          </select>
        </label>
      )}
      <button type="button" onClick={props.onRandom}>
        {tx('Random city', 'Ciudad aleatoria')}
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (parsed !== null) props.onGenerate(parsed);
        }}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}
      >
        <label>
          {tx('City seed', 'Semilla de ciudad')}{' '}
          <input
            aria-label={tx('City seed', 'Semilla de ciudad')}
            inputMode="numeric"
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            style={{ width: 110 }}
          />
        </label>
        <button type="submit" disabled={parsed === null}>
          {tx('Rebuild city', 'Reproducir ciudad')}
        </button>
      </form>
      {parsed === null && (
        <p role="alert">
          {tx(
            'The seed must be an integer from 0 to 4294967295.',
            'La semilla debe ser un entero de 0 a 4294967295.',
          )}
        </p>
      )}
    </section>
  );
}
