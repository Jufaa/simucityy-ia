import type { CityScenarioInput, FloodEnvironment, Point } from './types';

export interface FloodArea {
  readonly minCorner: Point;
  readonly maxCorner: Point;
}

export interface FloodDrain {
  readonly id: string;
  readonly position: Point;
  readonly capacityInCubicMetersPerSecond: number;
}

export interface FloodEnvironmentOptions {
  readonly obstacles?: boolean;
  readonly permeableAreas?: readonly FloodArea[];
  readonly infiltrationRateMmPerHour?: number;
  readonly drains?: readonly FloodDrain[];
}

function validatePoint(point: Point): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new RangeError('Flood environment coordinates must be finite.');
}

function validateArea(area: FloodArea): void {
  validatePoint(area.minCorner);
  validatePoint(area.maxCorner);
  if (
    area.minCorner.x >= area.maxCorner.x ||
    area.minCorner.y >= area.maxCorner.y
  )
    throw new RangeError(
      'Flood environment areas must have positive dimensions.',
    );
}

/** Rasterize local presets without modifying the source city or its terrain. */
export function createFloodEnvironment(
  scenario: CityScenarioInput,
  options: FloodEnvironmentOptions = {},
): FloodEnvironment {
  const { xCoordinates: xs, yCoordinates: ys } = scenario.terrainGrid;
  for (const coordinates of [xs, ys]) {
    if (coordinates.length < 2)
      throw new RangeError('Terrain needs at least two coordinates per axis.');
    for (let i = 0; i < coordinates.length; i++) {
      if (
        !Number.isFinite(coordinates[i]) ||
        (i > 0 && coordinates[i]! <= coordinates[i - 1]!)
      )
        throw new RangeError(
          'Terrain coordinates must be finite and strictly increasing.',
        );
    }
  }
  const infiltration = options.infiltrationRateMmPerHour ?? 0;
  if (!Number.isFinite(infiltration) || infiltration < 0)
    throw new RangeError('Infiltration must be finite and nonnegative.');
  const parks = options.permeableAreas ?? [];
  for (const park of parks) validateArea(park);
  if (options.obstacles)
    for (const building of scenario.buildings) validateArea(building);
  const drains = options.drains ?? [];
  for (const drain of drains) {
    validatePoint(drain.position);
    if (
      !Number.isFinite(drain.capacityInCubicMetersPerSecond) ||
      drain.capacityInCubicMetersPerSecond < 0
    )
      throw new RangeError('Drain capacity must be finite and nonnegative.');
    if (
      drain.position.x < xs[0]! ||
      drain.position.x > xs.at(-1)! ||
      drain.position.y < ys[0]! ||
      drain.position.y > ys.at(-1)!
    )
      throw new RangeError('Drain position must be inside the terrain grid.');
  }
  const blockedCellIndices: number[] = [];
  const additionalDrainRatesMmPerHour: number[] = [];
  for (let row = 0; row < ys.length - 1; row++) {
    for (let column = 0; column < xs.length - 1; column++) {
      const minX = xs[column]!,
        maxX = xs[column + 1]!;
      const minY = ys[row]!,
        maxY = ys[row + 1]!;
      const area = (maxX - minX) * (maxY - minY);
      if (!Number.isFinite(area) || area <= 0)
        throw new RangeError('Cell area must be finite and positive.');
      const centerX = (minX + maxX) / 2,
        centerY = (minY + maxY) / 2;
      const index = row * (xs.length - 1) + column;
      const blocked =
        options.obstacles &&
        scenario.buildings.some(
          (building) =>
            centerX >= building.minCorner.x &&
            centerX <= building.maxCorner.x &&
            centerY >= building.minCorner.y &&
            centerY <= building.maxCorner.y,
        );
      if (blocked) {
        blockedCellIndices.push(index);
        additionalDrainRatesMmPerHour.push(0);
        continue;
      }
      let coveredArea = 0;
      for (const park of parks) {
        coveredArea +=
          Math.max(
            0,
            Math.min(maxX, park.maxCorner.x) - Math.max(minX, park.minCorner.x),
          ) *
          Math.max(
            0,
            Math.min(maxY, park.maxCorner.y) - Math.max(minY, park.minCorner.y),
          );
      }
      let rate = infiltration * Math.min(1, coveredArea / area);
      for (const drain of drains) {
        const { x, y } = drain.position;
        if (
          x >= minX &&
          (x < maxX || (column === xs.length - 2 && x === maxX)) &&
          y >= minY &&
          (y < maxY || (row === ys.length - 2 && y === maxY))
        )
          rate += (drain.capacityInCubicMetersPerSecond * 3600 * 1000) / area;
      }
      if (!Number.isFinite(rate))
        throw new RangeError('Combined drainage rate must be finite.');
      additionalDrainRatesMmPerHour.push(rate);
    }
  }
  return { blockedCellIndices, additionalDrainRatesMmPerHour };
}
