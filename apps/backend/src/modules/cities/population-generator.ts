import type {
  Building,
  BuildingAccess,
  Citizen,
  RoadGraph,
  Shelter,
} from './city.types';
import { createRandom } from './utils/prng';

export function generateResidents(
  buildings: Building[],
  accesses: BuildingAccess[],
  graph: RoadGraph,
  count: number,
  seed: number,
): Citizen[] {
  if (!Number.isInteger(count) || count < 0 || count > 300)
    throw new RangeError('Population must be an integer between 0 and 300.');
  if (count > 0 && buildings.length === 0)
    throw new RangeError('Population requires at least one building.');
  const random = createRandom((seed ^ 0x706f7075) >>> 0);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const accessByBuilding = new Map(
    accesses.map((access) => [access.buildingId, access.nodeId]),
  );
  return Array.from({ length: count }, (_, index) => {
    const home = buildings[Math.floor(random() * buildings.length)]!;
    const nodeId = accessByBuilding.get(home.id);
    if (!nodeId || !nodes.has(nodeId))
      throw new RangeError('Citizen home has no valid road access.');
    return {
      id: `citizen-${index}`,
      homeBuildingId: home.id,
      nodeId,
      position: {
        x: (home.minCorner.x + home.maxCorner.x) / 2,
        y: (home.minCorner.y + home.maxCorner.y) / 2,
      },
      mobilityFactor: Math.round((0.5 + random() * 0.5) * 1000) / 1000,
      reactionDelayInSeconds: Math.floor(random() * 121),
      status: 'normal',
    };
  });
}

export function generateShelters(
  graph: RoadGraph,
  population: number,
): Shelter[] {
  const first = graph.nodes[0];
  if (!first || graph.nodes.length < 2)
    throw new RangeError('Two shelters require at least two road nodes.');
  const last = graph.nodes.reduce(
    (far, node) =>
      Math.hypot(node.x - first.x, node.y - first.y) >
      Math.hypot(far.x - first.x, far.y - first.y)
        ? node
        : far,
    first,
  );
  return [first, last].map((node, index) => ({
    id: `shelter-${index}`,
    nodeId: node.id,
    capacity: Math.max(1, Math.ceil(population / 2)),
    active: true,
  }));
}
