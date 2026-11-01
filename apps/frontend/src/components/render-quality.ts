export type RenderQuality = 'light' | 'balanced' | 'high';

/** Explicit user choice; no hardware/FPS guarantee and no simulation-state changes. */
export function renderQualitySettings(
  quality: RenderQuality,
  devicePixelRatio: number,
) {
  const deviceRatio =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1;
  const budget = {
    light: { pixelRatio: 1, shadows: false, shadowSize: 512 },
    balanced: { pixelRatio: 1.5, shadows: true, shadowSize: 1024 },
    high: { pixelRatio: 2, shadows: true, shadowSize: 2048 },
  }[quality];
  return { ...budget, pixelRatio: Math.min(deviceRatio, budget.pixelRatio) };
}
