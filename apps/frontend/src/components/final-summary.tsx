import { finalSummaryRows, type FinalSummaryInput } from './simulation-launch';

/** End-of-simulation summary: what happened, what was lost. */
export function FinalSummary(props: {
  title: string;
  input: FinalSummaryInput;
  narrative: string[];
  onDownloadReport(): void;
  onRestart(): void;
  onClose(): void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Resumen de la simulación"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 150,
        background: '#10222aa8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: 'min(480px, 92vw)',
          maxHeight: '88vh',
          overflowY: 'auto',
          background: '#fff',
          color: '#17252a',
          borderRadius: 14,
          padding: 20,
          boxShadow: '0 12px 40px #0006',
        }}
      >
        <strong style={{ fontSize: 17 }}>📋 Resumen: {props.title}</strong>
        <table style={{ width: '100%', marginTop: 12, fontSize: 14 }}>
          <tbody>
            {finalSummaryRows(props.input).map((row) => (
              <tr key={row.label}>
                <td style={{ padding: '5px 0', color: '#425466' }}>
                  {row.label}
                </td>
                <td
                  style={{
                    padding: '5px 0',
                    textAlign: 'right',
                    fontWeight: 700,
                  }}
                >
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {props.narrative.map((line) => (
          <p key={line} style={{ fontSize: 13, margin: '8px 0 0' }}>
            {line}
          </p>
        ))}
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 16,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={props.onDownloadReport}
            style={{
              padding: '9px 13px',
              borderRadius: 9,
              border: 0,
              background: '#24655e',
              color: '#fff',
              font: '600 13px system-ui',
              cursor: 'pointer',
            }}
          >
            ⬇ Descargar reporte
          </button>
          <button
            type="button"
            onClick={props.onRestart}
            style={{
              padding: '9px 13px',
              borderRadius: 9,
              border: '1px solid #b6c4c9',
              background: '#fff',
              color: '#20353a',
              font: '600 13px system-ui',
              cursor: 'pointer',
            }}
          >
            ↺ Simular de nuevo
          </button>
          <button
            type="button"
            onClick={props.onClose}
            style={{
              padding: '9px 13px',
              borderRadius: 9,
              border: '1px solid #b6c4c9',
              background: '#fff',
              color: '#20353a',
              font: '600 13px system-ui',
              cursor: 'pointer',
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
