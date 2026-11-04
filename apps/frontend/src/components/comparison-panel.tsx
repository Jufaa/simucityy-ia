import type { DistrictSimulation } from './district-simulation';
import { pick, useLanguage } from './language';
import { simTheme } from './ui-theme';

export function ComparisonPanel({
  comparison,
  alarmTime,
  total,
  evacuationEnabled = true,
  hazardLabel,
  improvementLabel,
}: {
  comparison: DistrictSimulation['comparison'];
  alarmTime: number | null;
  total: number;
  evacuationEnabled?: boolean;
  hazardLabel?: string;
  improvementLabel?: string;
}) {
  const language = useLanguage();
  const tx = (en: string, es: string) => pick(language, en, es);
  const hazard = hazardLabel ?? tx('storm', 'tormenta');
  const improvement =
    improvementLabel ?? tx('the drainage changes', 'cambia el drenaje');
  const time = (seconds: number | null) =>
    seconds === null
      ? tx('Not completed', 'No completada')
      : `${(seconds / 60).toFixed(1)} min`;
  const a = comparison.before,
    b = comparison.after;
  const rows: [string, string | number, string | number][] = [
    ...(a.damagedBuildings > 0 || b.damagedBuildings > 0
      ? ([
          [
            tx('Damaged buildings', 'Edificios dañados'),
            a.damagedBuildings,
            b.damagedBuildings,
          ],
        ] as [string, string | number, string | number][])
      : []),
    ...(a.collapsedBuildings > 0 || b.collapsedBuildings > 0
      ? ([
          [
            tx('Collapsed buildings', 'Edificios derrumbados'),
            a.collapsedBuildings,
            b.collapsedBuildings,
          ],
        ] as [string, string | number, string | number][])
      : []),
    [
      tx('Exposed buildings (cumulative)', 'Edificios expuestos (acum.)'),
      a.exposedBuildings,
      b.exposedBuildings,
    ],
    [
      tx('Blocked segments (peak)', 'Tramos bloqueados (pico)'),
      a.peakBlocked,
      b.peakBlocked,
    ],
    [
      tx('Max water (peak)', 'Agua máxima (pico)'),
      `${(a.peakDepth * 100).toFixed(1)} cm`,
      `${(b.peakDepth * 100).toFixed(1)} cm`,
    ],
    [
      tx('Drained water', 'Agua retirada'),
      `${a.drainedVolume.toFixed(0)} m³`,
      `${b.drainedVolume.toFixed(0)} m³`,
    ],
    ...(evacuationEnabled
      ? ([
          [
            tx('Evacuated', 'Evacuados'),
            `${a.evacuated}/${total}`,
            `${b.evacuated}/${total}`,
          ],
          [
            tx('Trapped in collapses', 'Atrapados en derrumbes'),
            a.trapped,
            b.trapped,
          ],
          [
            tx('No route / stopped', 'Sin ruta / detenidos'),
            a.stranded,
            b.stranded,
          ],
          [
            tx('Evacuation from alarm', 'Evacuación desde alarma'),
            time(a.completionSeconds),
            time(b.completionSeconds),
          ],
        ] as [string, string | number, string | number][])
      : []),
  ];
  return (
    <section
      aria-label={tx(
        'Intervention comparison',
        'Comparación de intervenciones',
      )}
      style={{ marginTop: 12, fontSize: 12 }}
    >
      <strong>
        {tx(
          `The same event (${hazard}) · two scenarios`,
          `El mismo evento (${hazard}) · dos escenarios`,
        )}
      </strong>
      {!evacuationEnabled && (
        <p>
          {tx(
            'Static people · automatic behavior disabled.',
            'Personas estáticas · comportamiento automático desactivado.',
          )}
        </p>
      )}
      <p>
        {alarmTime === null
          ? tx('Waiting for the common alarm', 'Esperando alarma común')
          : tx(
              `Common alarm at ${(alarmTime / 60).toFixed(0)} simulated min`,
              `Alarma común a los ${(alarmTime / 60).toFixed(0)} min simulados`,
            )}
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <caption style={{ textAlign: 'left', marginBottom: 6 }}>
          {tx(
            `Same city and event; ${improvement}.`,
            `Misma ciudad y evento; ${improvement}.`,
          )}
        </caption>
        <thead>
          <tr>
            <th scope="col">{tx('Metric', 'Métrica')}</th>
            <th scope="col">{tx('Without improvement', 'Sin mejora')}</th>
            <th scope="col">{tx('With improvement', 'Con mejora')}</th>
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
                  borderTop: `1px solid ${simTheme.border}`,
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
        {tx(
          'Demonstration coefficients, not calibrated. An improvement does not guarantee reducing every indicator.',
          'Coeficientes demostrativos, no calibrados. Una mejora no garantiza reducir todos los indicadores.',
        )}
      </small>
    </section>
  );
}
