/** One citizen narrates their measured state; deterministic fallback offline. */
export interface CitizenVoiceContext {
  status: 'waiting' | 'evacuating' | 'evacuated' | 'stranded' | 'trapped';
  hazardKind: string;
  shelterAssigned: boolean;
  elapsedMinutes: number;
}

export interface CitizenVoiceResult {
  text: string;
  source: 'meta' | 'fallback';
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

const STATUS_TEXT: Record<CitizenVoiceContext['status'], string> = {
  waiting:
    'Todavía estoy en mi edificio esperando que pase lo peor. Escucho la alarma y miro por la ventana como sube el nivel de la calle.',
  evacuating:
    'Estoy evacuando a pie hacia el refugio. Salí apenas sonó la alarma y sigo la ruta que marca la municipalidad.',
  evacuated:
    'Ya llegué al refugio y estoy a salvo. Desde acá se ve cómo quedó mi cuadra; espero el aviso para volver.',
  stranded:
    'Quedé detenido a mitad de camino: la calle se cortó y no puedo avanzar ni volver. Espero asistencia donde estoy.',
  trapped:
    'Estoy atrapado en mi edificio y no puedo salir por mis medios. Necesito que venga el equipo de rescate.',
};

export function fallbackCitizenVoice(
  context: CitizenVoiceContext,
): CitizenVoiceResult {
  const shelter = context.shelterAssigned
    ? ' Tengo un refugio asignado.'
    : ' Todavía no me asignaron refugio.';
  return {
    text: `${STATUS_TEXT[context.status]} Van ${context.elapsedMinutes.toFixed(0)} minutos de evento.${context.status === 'evacuated' || context.status === 'trapped' ? '' : shelter}`,
    source: 'fallback',
  };
}

export async function requestCitizenVoice(
  context: CitizenVoiceContext,
): Promise<CitizenVoiceResult> {
  try {
    const response = await fetch(`${API_URL}/ai/citizen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { reply: { text: string } };
    return { text: data.reply.text, source: 'meta' };
  } catch {
    return fallbackCitizenVoice(context);
  }
}
