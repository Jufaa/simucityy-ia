import { pick, useLanguage } from './language';
import { simTheme } from './ui-theme';
import type { ImpactSummary } from './impact-summary';

export function ImpactPanel({
  summary,
  narrative,
}: {
  summary: ImpactSummary;
  narrative: string[];
}) {
  const language = useLanguage();
  const tx = (en: string, es: string) => pick(language, en, es);
  const metrics: [string, string][] = [
    [
      tx('Evacuated people', 'Personas evacuadas'),
      `${summary.evacuated} / ${summary.totalCitizens} (${summary.evacuatedPercent}%)`,
    ],
    [
      tx('Exposed buildings', 'Edificios expuestos'),
      `${summary.exposedBuildings} (${summary.exposedPercent}%)`,
    ],
    [tx('Blocked segments', 'Tramos bloqueados'), String(summary.blockedRoads)],
    [
      tx('Max water', 'Agua máxima'),
      `${(summary.maxWaterDepthInMeters * 100).toFixed(1)} cm`,
    ],
    [tx('Simulated time', 'Tiempo simulado'), `${summary.elapsedMinutes} min`],
  ];
  return (
    <section
      aria-label={tx('Event impact', 'Impacto del evento')}
      style={{
        margin: '12px 0',
        padding: 12,
        border: `1px solid ${simTheme.border}`,
        borderRadius: 8,
        background: simTheme.fieldBackground,
        fontSize: 13,
      }}
    >
      <strong>{tx('Event impact', 'Impacto del evento')}</strong>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px 12px',
          margin: '8px 0',
        }}
      >
        {metrics.map(([label, value]) => (
          <div key={label}>
            <dt style={{ fontSize: 11, color: simTheme.muted }}>{label}</dt>
            <dd style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {narrative.map((line) => (
        <p key={line} style={{ margin: '4px 0' }}>
          {line}
        </p>
      ))}
      <small>
        {tx(
          'Account generated from simulation data, without AI.',
          'Relato generado desde los datos de la simulación, sin IA.',
        )}
      </small>
    </section>
  );
}
