/** Clamps a wipe percentage for the before/after comparison slider. */
export function clampWipePercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, value));
}

/**
 * Wipe comparison between two real canvas snapshots of the scene
 * ("Antes" / "Después"). The top image is clipped by the slider.
 */
export function BeforeAfterSlider(props: {
  beforeImage: string;
  afterImage: string | null;
  wipePercent: number;
  onWipeChange(percent: number): void;
  onCaptureAfter(): void;
}) {
  const wipe = clampWipePercent(props.wipePercent);
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          borderRadius: 10,
          overflow: 'hidden',
          background: '#20353a',
        }}
      >
        <img
          src={props.beforeImage}
          alt="Antes del evento"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
        {props.afterImage && (
          <img
            src={props.afterImage}
            alt="Después del evento"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              clipPath: `inset(0 0 0 ${wipe}%)`,
            }}
          />
        )}
        <span
          style={{
            position: 'absolute',
            left: 8,
            bottom: 6,
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
            textShadow: '0 1px 4px #000a',
          }}
        >
          ANTES
        </span>
        <span
          style={{
            position: 'absolute',
            right: 8,
            bottom: 6,
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
            textShadow: '0 1px 4px #000a',
          }}
        >
          DESPUÉS
        </span>
      </div>
      {props.afterImage ? (
        <input
          type="range"
          aria-label="Comparar antes y después"
          min={0}
          max={100}
          value={wipe}
          onChange={(event) => props.onWipeChange(Number(event.target.value))}
          style={{ width: '100%', marginTop: 6 }}
        />
      ) : (
        <button
          type="button"
          onClick={props.onCaptureAfter}
          style={{
            marginTop: 8,
            padding: '8px 12px',
            borderRadius: 9,
            border: 0,
            background: '#2456a6',
            color: '#fff',
            font: '600 13px system-ui',
            cursor: 'pointer',
            width: '100%',
          }}
        >
          📸 Capturar el “después” ahora
        </button>
      )}
      {props.afterImage && (
        <button
          type="button"
          onClick={props.onCaptureAfter}
          style={{
            padding: '6px 10px',
            borderRadius: 9,
            border: '1px solid #b6c4c9',
            background: '#fff',
            color: '#20353a',
            font: '600 12px system-ui',
            cursor: 'pointer',
            width: '100%',
          }}
        >
          📸 Volver a capturar el “después”
        </button>
      )}
    </div>
  );
}
