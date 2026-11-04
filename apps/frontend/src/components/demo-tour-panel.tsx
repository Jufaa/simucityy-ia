import type { DemoStep } from './demo-tour';
import { pick, useLanguage } from './language';

export function DemoTourPanel({
  steps,
  step,
  onStep,
  onExit,
}: {
  steps: DemoStep[];
  step: number;
  onStep: (index: number) => void;
  onExit: () => void;
}) {
  const language = useLanguage();
  const current = steps[step]!;
  return (
    <section
      aria-label={pick(language, 'Guided demo', 'Demo guiada')}
      style={{
        margin: '12px 0',
        padding: 12,
        border: '1px solid #9fc5b8',
        borderRadius: 8,
        background: '#ecf7f2',
        fontSize: 13,
      }}
    >
      <strong>{current.title}</strong>
      <p style={{ margin: '6px 0' }}>{current.body}</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          disabled={step === 0}
          onClick={() => onStep(step - 1)}
        >
          {pick(language, 'Previous', 'Anterior')}
        </button>
        <span>
          {step + 1} / {steps.length}
        </span>
        <button
          type="button"
          disabled={step === steps.length - 1}
          onClick={() => onStep(step + 1)}
        >
          {pick(language, 'Next', 'Siguiente')}
        </button>
        <button type="button" onClick={onExit}>
          {pick(language, 'Exit demo', 'Salir de la demo')}
        </button>
      </div>
    </section>
  );
}
