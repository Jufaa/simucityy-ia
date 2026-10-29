import type { DistrictSimulation } from './district-simulation';

export function ComparisonPanel({
  comparison,
  alarmTime,
  total,
  evacuationEnabled = true,
}: {
  comparison: DistrictSimulation['comparison'];
  alarmTime: number | null;
  total: number;
  evacuationEnabled?: boolean;
}) {
  const time = (seconds: number | null) =>
    seconds === null ? 'No completada' : `${(seconds / 60).toFixed(1)} min`;
  const a = comparison.before,
    b = comparison.after;
  const rows: [string, string | number, string | number][] = [
    ['Edificios expuestos (acum.)', a.exposedBuildings, b.exposedBuildings],
    ['Tramos bloqueados (pico)', a.peakBlocked, b.peakBlocked],
    [
      'Agua máxima (pico)',
      `${(a.peakDepth * 100).toFixed(1)} cm`,
      `${(b.peakDepth * 100).toFixed(1)} cm`,
    ],
    [
      'Agua retirada',
      `${a.drainedVolume.toFixed(0)} m³`,
      `${b.drainedVolume.toFixed(0)} m³`,
    ],
    ...(evacuationEnabled
      ? ([
          ['Evacuados', `${a.evacuated}/${total}`, `${b.evacuated}/${total}`],
          ['Sin ruta / detenidos', a.stranded, b.stranded],
          [
            'Evacuación desde alarma',
            time(a.completionSeconds),
            time(b.completionSeconds),
          ],
        ] as [string, string | number, string | number][])
      : []),
  ];
  return (
    <section
      aria-label="Comparación de intervenciones"
      style={{ marginTop: 12, fontSize: 12 }}
    >
      <strong>La misma tormenta · dos escenarios</strong>
      {!evacuationEnabled && (
        <p>Personas estáticas · comportamiento automático desactivado.</p>
      )}
      <p>
        {alarmTime === null
          ? 'Esperando alarma común'
          : `Alarma común a los ${(alarmTime / 60).toFixed(0)} min simulados`}
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <caption style={{ textAlign: 'left', marginBottom: 6 }}>
          Misma ciudad, lluvia y obstáculos; cambia el drenaje.
        </caption>
        <thead>
          <tr>
            <th scope="col">Métrica</th>
            <th scope="col">Sin mejora</th>
            <th scope="col">Con mejora</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, before, after]) => (
            <tr key={label}>
              <th
                scope="row"
                style={{
                  textAlign: 'left',
                  fontWeight: 400,
                  borderTop: '1px solid #dbe2e7',
                  padding: '5px 2px',
                }}
              >
                {label}
              </th>
              <td style={{ textAlign: 'center' }}>{before}</td>
              <td style={{ textAlign: 'center' }}>{after}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <small>
        Coeficientes demostrativos, no calibrados. Una mejora no garantiza
        reducir todos los indicadores.
      </small>
    </section>
  );
}
