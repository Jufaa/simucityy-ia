/** Pixel-ratio steps from sharpest to cheapest; the controller walks this ladder. */
export const PIXEL_RATIO_STEPS = [1.75, 1.5, 1.25, 1, 0.85, 0.7] as const;

const STORAGE_KEY = 'simulicity-pixel-ratio';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Last pixel ratio that worked well on this device, reused on the next visit. */
export function loadCachedPixelRatio(
  devicePixelRatio: number,
  storage: StorageLike | null = defaultStorage(),
): number {
  const ceiling = Math.min(devicePixelRatio || 1, PIXEL_RATIO_STEPS[0]);
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const value = raw === null || raw === undefined ? NaN : Number(raw);
    if (Number.isFinite(value) && value >= PIXEL_RATIO_STEPS.at(-1)!)
      return Math.min(value, ceiling);
  } catch {
    // Storage can throw in private mode; falling back is harmless.
  }
  return Math.min(ceiling, 1.5);
}

export function saveCachedPixelRatio(
  value: number,
  storage: StorageLike | null = defaultStorage(),
) {
  try {
    storage?.setItem(STORAGE_KEY, String(value));
  } catch {
    // Caching is an optimization only.
  }
}

/**
 * Steps the pixel ratio down while frames are slow and back up only after
 * several consecutive fast seconds, so the resolution does not oscillate.
 */
export class AdaptivePixelRatio {
  private index: number;
  private fastSeconds = 0;
  private cooldownSeconds = 0;

  constructor(
    readonly devicePixelRatio: number,
    start: number = loadCachedPixelRatio(devicePixelRatio),
  ) {
    this.index = PIXEL_RATIO_STEPS.reduce(
      (best, step, i) =>
        Math.abs(step - start) < Math.abs(PIXEL_RATIO_STEPS[best]! - start)
          ? i
          : best,
      0,
    );
  }

  get value(): number {
    return Math.min(this.devicePixelRatio || 1, PIXEL_RATIO_STEPS[this.index]!);
  }

  /** Returns the new pixel ratio when it should change, otherwise null. */
  evaluate(fps: number): number | null {
    if (!Number.isFinite(fps) || fps <= 0) return null;
    if (this.cooldownSeconds > 0) {
      this.cooldownSeconds--;
      return null;
    }
    if (fps < 45 && this.index < PIXEL_RATIO_STEPS.length - 1) {
      this.index++;
      this.fastSeconds = 0;
      this.cooldownSeconds = 2;
      return this.value;
    }
    if (fps >= 58) {
      this.fastSeconds++;
      if (this.fastSeconds >= 4 && this.index > 0) {
        this.index--;
        this.fastSeconds = 0;
        this.cooldownSeconds = 2;
        return this.value;
      }
    } else this.fastSeconds = 0;
    return null;
  }
}
