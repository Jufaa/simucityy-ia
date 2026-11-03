/**
 * Deterministic per-building presentation colours. Pure and seed-free:
 * the tint derives only from the stable building id, so regeneration and
 * re-rendering never reshuffle colours, and no simulation data is touched.
 */

function stableHash(value: string, salt: number): number {
  let hash = 0x811c9dc5 ^ salt;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Near-white warm RGB multiplier for instance colour. Channels are
 * correlated (one brightness, fixed warm falloff) so buildings vary in
 * lightness without drifting into pastel lavender/green casts.
 */
export function buildingTint(buildingId: string): [number, number, number] {
  const brightness = 0.88 + ((stableHash(buildingId, 11) % 1000) / 1000) * 0.12;
  return [brightness, brightness * 0.985, brightness * 0.94];
}

export const ROOF_COLORS = [
  0x8c4c39, // terracotta
  0x75503f, // weathered clay
  0x737974, // concrete
  0x596066, // slate
  0x86755c, // sand slate
] as const;

// Weighted draw: neutral concrete/slate dominate, terracotta is an accent.
const ROOF_DRAW = [
  0x8c4c39, 0x737974, 0x737974, 0x596066, 0x86755c, 0x75503f, 0x737974,
  0x596066, 0x86755c, 0x737974,
] as const;

export function roofColorForBuilding(buildingId: string): number {
  return ROOF_DRAW[stableHash(buildingId, 5) % ROOF_DRAW.length]!;
}
