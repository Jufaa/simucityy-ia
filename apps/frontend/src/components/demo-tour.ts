import type { WorldCameraView } from './world-layer';

export interface DemoStep {
  title: string;
  body: string;
  view: WorldCameraView;
  speed: 3 | 30 | 300;
}

/**
 * Three-beat pitch script: context, event, impact. Bodies are factual
 * sentences built from city data; live numbers are appended by the
 * impact panel next to this tour, not invented here.
 */
export function buildDemoSteps(context: {
  zoneLabel: string;
  buildings: number;
  citizens: number;
  hazardLabel: string;
}): DemoStep[] {
  return [
    {
      title: '1 · La zona',
      body: `${context.zoneLabel}: ${context.buildings} edificios y ${context.citizens} personas sobre geografía y calles reales. Todo lo que sigue corre sobre esta misma ciudad.`,
      view: 'world',
      speed: 30,
    },
    {
      title: '2 · El evento',
      body: `Se desata ${context.hazardLabel}. El agua avanza por las zonas bajas, bloquea tramos (rojo) y expone edificios (naranja) mientras la alarma dispara la evacuación automática.`,
      view: 'city',
      speed: 300,
    },
    {
      title: '3 · El impacto',
      body: 'A ritmo de caminata se ve el resultado: quién llegó a refugio, qué quedó bloqueado y cuánto cambió frente al escenario sin mejora. Los números están en el panel de impacto.',
      view: 'city',
      speed: 3,
    },
  ];
}
