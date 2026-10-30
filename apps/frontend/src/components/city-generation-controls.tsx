import { useState } from 'react';

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
  onGenerate(seed: number): void;
  onRandom(): void;
}) {
  const [seed, setSeed] = useState(String(props.seed));
  const parsed = parseCitySeed(seed);
  return (
    <section aria-label="Generación procedural" style={{ margin: '12px 0' }}>
      <strong>Generación de ciudad</strong>
      <p style={{ fontSize: 12 }}>
        {props.randomized ? 'Perfil aleatorio' : 'Perfil original'} · Sin IA. La
        semilla reproduce el trazado y sus características en este perfil.
      </p>
      <button type="button" onClick={props.onRandom}>
        Ciudad aleatoria
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (parsed !== null) props.onGenerate(parsed);
        }}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}
      >
        <label>
          Semilla de ciudad{' '}
          <input
            aria-label="Semilla de ciudad"
            inputMode="numeric"
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            style={{ width: 110 }}
          />
        </label>
        <button type="submit" disabled={parsed === null}>
          Reproducir ciudad
        </button>
      </form>
      {parsed === null && (
        <p role="alert">La semilla debe ser un entero de 0 a 4294967295.</p>
      )}
    </section>
  );
}
