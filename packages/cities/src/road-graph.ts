import type {
  Building,
  BuildingAccess,
  Road,
  RoadGraph,
  RoadNode,
} from './city.types';

/** Split existing axis-aligned centerlines at crossings and endpoints. */
export function generateRoadGraph(roads: Road[]): RoadGraph {
  const nodes = new Map<string, RoadNode>();
  const edges: RoadGraph['edges'] = [];
  const add = (x: number, y: number) => {
    const id = `node-${x}-${y}`;
    if (!nodes.has(id)) nodes.set(id, { id, x, y });
    return nodes.get(id)!;
  };
  for (const road of roads) {
    const horizontal = road.start.y === road.end.y;
    const points = new Map<string, RoadNode>();
    for (const point of [road.start, road.end]) {
      const node = add(point.x, point.y);
      points.set(node.id, node);
    }
    for (const other of roads) {
      if (horizontal === (other.start.y === other.end.y)) continue;
      const x = horizontal ? other.start.x : road.start.x;
      const y = horizontal ? road.start.y : other.start.y;
      if (
        x >= road.start.x &&
        x <= road.end.x &&
        y >= road.start.y &&
        y <= road.end.y &&
        x >= other.start.x &&
        x <= other.end.x &&
        y >= other.start.y &&
        y <= other.end.y
      ) {
        const node = add(x, y);
        points.set(node.id, node);
      }
    }
    const ordered = [...points.values()].sort((a, b) =>
      horizontal ? a.x - b.x : a.y - b.y,
    );
    for (let index = 1; index < ordered.length; index++) {
      const from = ordered[index - 1]!;
      const to = ordered[index]!;
      edges.push({
        id: `${road.id}-segment-${index - 1}`,
        roadId: road.id,
        from: from.id,
        to: to.id,
        lengthInMeters: Math.hypot(to.x - from.x, to.y - from.y),
        bidirectional: true,
      });
    }
  }
  return { nodes: [...nodes.values()], edges };
}

export function generateBuildingAccess(
  buildings: Building[],
  graph: RoadGraph,
): BuildingAccess[] {
  return buildings.map((building) => {
    const x = (building.minCorner.x + building.maxCorner.x) / 2;
    const y = (building.minCorner.y + building.maxCorner.y) / 2;
    let nearest = graph.nodes[0];
    if (!nearest) throw new RangeError('Buildings require a road access node.');
    for (const node of graph.nodes) {
      if (
        Math.hypot(node.x - x, node.y - y) <
        Math.hypot(nearest.x - x, nearest.y - y)
      )
        nearest = node;
    }
    return { buildingId: building.id, nodeId: nearest.id };
  });
}
