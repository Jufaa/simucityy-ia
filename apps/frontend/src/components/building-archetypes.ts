import type { BuildingLayout, OrganicGeography } from './city-types';

type NeighborhoodKind = OrganicGeography['neighborhoods'][number]['kind'];
type Range = readonly [number, number];
interface ArchetypeDefinition {
  id: BuildingLayout['archetype'];
  width: Range;
  depth: Range;
  floors: Range;
  setback: Range;
  gap: Range;
}

const ARCHETYPES: Record<NeighborhoodKind, readonly ArchetypeDefinition[]> = {
  residential: [
    {
      id: 'compact-house',
      width: [8, 10],
      depth: [8, 10],
      floors: [1, 2],
      setback: [2, 3],
      gap: [3, 4],
    },
    {
      id: 'elongated-house',
      width: [7, 8],
      depth: [13, 15],
      floors: [1, 2],
      setback: [1.5, 2.5],
      gap: [2, 3],
    },
  ],
  center: [
    {
      id: 'slim-apartment',
      width: [8, 9.5],
      depth: [15, 17],
      floors: [8, 12],
      setback: [0.5, 1.25],
      gap: [1.5, 2.5],
    },
    {
      id: 'wide-apartment',
      width: [14, 17],
      depth: [9, 11],
      floors: [5, 8],
      setback: [0.75, 1.5],
      gap: [2, 3],
    },
  ],
  commercial: [
    {
      id: 'wide-shop',
      width: [16, 19],
      depth: [8, 10],
      floors: [1, 2],
      setback: [0.5, 1.25],
      gap: [2, 3],
    },
    {
      id: 'compact-shop',
      width: [10, 12],
      depth: [9, 11],
      floors: [2, 3],
      setback: [0.75, 1.5],
      gap: [2, 3],
    },
  ],
};

/** Dimensions at the reference 500 m city scale; caller applies spatial scaling. */
export function sampleBuildingArchetype(
  kind: NeighborhoodKind,
  random: () => number,
) {
  const draw = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1)
      throw new RangeError(
        'Building archetypes require random samples in [0, 1).',
      );
    return value;
  };
  const variants = ARCHETYPES[kind];
  const definition = variants[Math.floor(draw() * variants.length)]!;
  const sample = ([min, max]: Range) => min + draw() * (max - min);
  return {
    id: definition.id,
    widthInMeters: sample(definition.width),
    depthInMeters: sample(definition.depth),
    baseFloors:
      definition.floors[0] +
      Math.floor(draw() * (definition.floors[1] - definition.floors[0] + 1)),
    roadSetbackInMeters: sample(definition.setback),
    buildingGapInMeters: sample(definition.gap),
  };
}
