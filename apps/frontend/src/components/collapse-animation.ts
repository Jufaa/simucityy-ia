/**
 * Curva visual del derrumbe: una primera fase lenta de inclinación y
 * agrietamiento (hasta el 18 % del progreso apenas se mueve el 4.5 %) y
 * después la caída acelerando como por gravedad. Entrada y salida en 0..1.
 */
export function collapseEase(progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  if (p < 0.18) return p * 0.25;
  return 0.045 + Math.pow((p - 0.18) / 0.82, 1.6) * 0.955;
}

/**
 * Pose del derrumbe por fases, para que no parezca cartón doblándose:
 * primero se inclina pivotando sobre una arista de la base, después la
 * compresión vertical (desplome) domina y la inclinación se asienta.
 */
export function collapsePose(progress: number): {
  tiltFactor: number;
  scaleY: number;
  driftFactor: number;
  shearFactor: number;
} {
  const p = Math.max(0, Math.min(1, progress));
  const lean =
    p < 0.3 ? (p / 0.3) ** 2 * 0.45 : 0.45 + ((p - 0.3) / 0.7) * 0.55;
  const settle = p > 0.8 ? 1 - ((p - 0.8) / 0.2) * 0.3 : 1;
  // Temblor de agrietamiento al inicio: la estructura vibra antes de ceder.
  const tremor = p < 0.3 ? Math.sin(p * 48) * 0.03 * (1 - p / 0.3) : 0;
  let scaleY =
    p < 0.35
      ? 1 - 0.06 * (p / 0.35)
      : 1 - 0.06 - 0.62 * Math.pow((p - 0.35) / 0.65, 1.4);
  // Rebote de impacto: al final se comprime un poco de más y se asienta.
  if (p > 0.85) scaleY -= Math.sin(((p - 0.85) / 0.15) * Math.PI) * 0.035;
  return {
    tiltFactor: lean * settle + tremor,
    scaleY,
    driftFactor: p * p,
    // La parte alta se desplaza respecto a la base (cizalla), no es un
    // bloque rígido que rota: cada planta cede sobre la anterior.
    shearFactor: p * p * 0.22,
  };
}

/** Los edificios altos tardan más en caer que una casa baja. */
export function collapseDurationSeconds(heightInMeters: number): number {
  const height = Number.isFinite(heightInMeters)
    ? Math.max(0, heightInMeters)
    : 8;
  return 1.6 + Math.min(1.4, height / 20);
}
