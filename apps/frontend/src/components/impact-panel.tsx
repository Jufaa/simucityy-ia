import type { ImpactSummary } from './impact-summary';

export function ImpactPanel({
  summary,
  narrative,
}: {
  summary: ImpactSummary;
  narrative: string[];
}) {
  const metrics: [string, string][] = [
    [
      'Personas evacuadas',
      `${summary.evacuated} / ${summary.totalCitizens} (${summary.evacuatedPercent}%)`,
    ],
    [
      'Edificios expuestos',
      `${summary.exposedBuildings} (${summary.exposedPercent}%)`,
    ],
    ['Tramos bloqueados', String(summary.blockedRoads)],
    ['Agua máxima', `${(summary.maxWaterDepthInMeters * 100).toFixed(1)} cm`],
    ['Tiempo simulado', `${summary.elapsedMinutes} min`],
  ];
  return (
    <section
      aria-label="Impacto del evento"
      style={{
        margin: '12px 0',
        padding: 12,
        border: '1px solid #b9c8e8',
        borderRadius: 8,
        background: '#eef3fd',
        fontSize: 13,
      }}
    >
      <strong>Impacto del evento</strong>
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
            <dt style={{ fontSize: 11, color: '#44506b' }}>{label}</dt>
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
      <small>Relato generado desde los datos de la simulación, sin IA.</small>
    </section>
  );
}
