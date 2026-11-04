/**
 * Deterministic drain placement for the intervention agent: the lowest
 * terrain cells first, keeping a minimum separation so drains do not
 * stack on a single cell. Pure and seeded by geometry only — the same
 * city always yields the same points.
 */
export interface DrainGrid {
  xCoordinates: readonly number[];
  yCoordinates: readonly number[];
  elevationsInMeters: readonly (readonly number[])[];
}

export function pickAutoDrainPoints(
  grid: DrainGrid,
  count: number,
  minSeparationInMeters: number,
): { x: number; y: number }[] {
  const wanted = Math.max(0, Math.min(12, Math.floor(count)));
  if (wanted === 0) return [];
  const cells: { x: number; y: number; elevation: number }[] = [];
  grid.elevationsInMeters.forEach((row, rowIndex) => {
    row.forEach((elevation, columnIndex) => {
      const x = grid.xCoordinates[columnIndex];
      const y = grid.yCoordinates[rowIndex];
      if (x !== undefined && y !== undefined && Number.isFinite(elevation))
        cells.push({ x, y, elevation });
    });
  });
  cells.sort((a, b) => a.elevation - b.elevation || a.y - b.y || a.x - b.x);
  const picked: { x: number; y: number }[] = [];
  for (const cell of cells) {
    if (picked.length >= wanted) break;
    const tooClose = picked.some(
      (point) =>
        Math.hypot(point.x - cell.x, point.y - cell.y) < minSeparationInMeters,
    );
    if (!tooClose) picked.push({ x: cell.x, y: cell.y });
  }
  // If separation starved the request, fill with next-lowest cells.
  for (const cell of cells) {
    if (picked.length >= wanted) break;
    if (!picked.some((point) => point.x === cell.x && point.y === cell.y))
      picked.push({ x: cell.x, y: cell.y });
  }
  return picked;
}
