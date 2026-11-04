/** Simulated municipal WhatsApp alerts built from measured event state. */
export interface AlertMessage {
  timeLabel: string;
  from: string;
  text: string;
}

export function buildAlertMessages(input: {
  hazardLabel: string;
  alarmMinutes: number | null;
  evacuated: number;
  total: number;
  trapped: number;
  score: number | null;
}): AlertMessage[] {
  if (input.alarmMinutes === null) return [];
  const messages: AlertMessage[] = [
    {
      timeLabel: `${input.alarmMinutes.toFixed(0)} min`,
      from: 'Municipalidad',
      text: `ALERTA: se detectó un evento de ${input.hazardLabel}. Evacuén hacia los refugios señalados y eviten las zonas bajas.`,
    },
  ];
  if (input.total > 0 && input.evacuated >= input.total && input.trapped === 0)
    messages.push({
      timeLabel: 'Fin del evento',
      from: 'Municipalidad',
      text: `Evacuación completa: ${input.evacuated}/${input.total} personas a salvo. Permanezcan en los refugios hasta el aviso de retorno.`,
    });
  else if (input.trapped > 0)
    messages.push({
      timeLabel: 'En curso',
      from: 'Municipalidad',
      text: `Equipos de rescate en camino: ${input.trapped} personas necesitan asistencia. No vuelvan a los edificios dañados.`,
    });
  if (input.score !== null)
    messages.push({
      timeLabel: 'Informe',
      from: 'Municipalidad',
      text: `Resiliencia de la ciudad en este evento: ${input.score}/100. El informe completo está disponible en el simulador.`,
    });
  return messages;
}
