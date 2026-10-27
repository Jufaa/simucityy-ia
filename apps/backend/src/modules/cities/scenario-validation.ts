import type { Block, CityScenario, Point } from './city.types';
import { validateCityConfig } from './city-validation';

/** Semantic validation runs after Zod has established the structure. */
export function scenarioIssues(s: CityScenario): string[] {
  const issues: string[] = [];
  const fail = (condition: boolean, message: string) => {
    if (condition) issues.push(message);
  };
  try {
    validateCityConfig(s.config);
  } catch {
    issues.push('Invalid city dimensions, seed or street budget.');
  }
  const inside = (p: Point) =>
    p.x >= 0 &&
    p.y >= 0 &&
    p.x <= s.config.widthInMeters &&
    p.y <= s.config.heightInMeters;
  const collections = [
    s.roads,
    s.blocks,
    s.buildings,
    s.roadGraph.nodes,
    s.roadGraph.edges,
    s.shelters,
    s.citizens,
  ];
  for (const items of collections)
    fail(
      new Set(items.map(({ id }) => id)).size !== items.length,
      'Collection contains duplicate IDs.',
    );
  fail(
    s.citizens.length !== s.config.populationCount,
    'Population count does not match settings.',
  );
  for (const road of s.roads) {
    fail(
      !inside(road.start) || !inside(road.end),
      'Road is outside city bounds.',
    );
    fail(
      (road.start.x === road.end.x) === (road.start.y === road.end.y),
      'Road must be a non-zero axis-aligned segment.',
    );
  }
  const contains = (outer: Block, inner: Block) =>
    inner.minCorner.x >= outer.minCorner.x &&
    inner.minCorner.y >= outer.minCorner.y &&
    inner.maxCorner.x <= outer.maxCorner.x &&
    inner.maxCorner.y <= outer.maxCorner.y;
  for (const rectangles of [s.blocks, s.buildings]) {
    for (let i = 0; i < rectangles.length; i++) {
      const a = rectangles[i]!;
      fail(
        !inside(a.minCorner) || !inside(a.maxCorner),
        'Rectangle is outside city bounds.',
      );
      for (let j = i + 1; j < rectangles.length; j++) {
        const b = rectangles[j]!;
        fail(
          a.minCorner.x < b.maxCorner.x &&
            a.maxCorner.x > b.minCorner.x &&
            a.minCorner.y < b.maxCorner.y &&
            a.maxCorner.y > b.minCorner.y,
          'Rectangles overlap.',
        );
      }
    }
  }
  for (const building of s.buildings) {
    fail(
      !s.blocks.some((block) => contains(block, building)),
      'Building is not contained in a block.',
    );
    fail(
      building.heightInMeters < s.config.minBuildingHeightInMeters ||
        building.heightInMeters > s.config.maxBuildingHeightInMeters,
      'Building height is outside the configured range.',
    );
  }
  for (const block of s.blocks) {
    fail(
      block.maxCorner.x - block.minCorner.x <=
        2 * s.config.buildingMarginInMeters ||
        block.maxCorner.y - block.minCorner.y <=
          2 * s.config.buildingMarginInMeters,
      'Configured building margin leaves no usable area in a block.',
    );
  }
  const nodes = new Map(s.roadGraph.nodes.map((node) => [node.id, node]));
  const roads = new Map(s.roads.map((road) => [road.id, road]));
  const buildings = new Map(
    s.buildings.map((building) => [building.id, building]),
  );
  const adjacency = new Map(
    s.roadGraph.nodes.map((node) => [node.id, new Set<string>()]),
  );
  for (const node of nodes.values())
    fail(!inside(node), 'Road node is outside city bounds.');
  for (const edge of s.roadGraph.edges) {
    const from = nodes.get(edge.from),
      to = nodes.get(edge.to),
      road = roads.get(edge.roadId);
    if (!from || !to || !road || from.id === to.id) {
      issues.push('Road edge has an invalid reference.');
      continue;
    }
    const onRoad = (p: Point) =>
      road.start.x === road.end.x
        ? p.x === road.start.x &&
          p.y >= Math.min(road.start.y, road.end.y) &&
          p.y <= Math.max(road.start.y, road.end.y)
        : p.y === road.start.y &&
          p.x >= Math.min(road.start.x, road.end.x) &&
          p.x <= Math.max(road.start.x, road.end.x);
    fail(
      !onRoad(from) ||
        !onRoad(to) ||
        Math.abs(
          Math.hypot(to.x - from.x, to.y - from.y) - edge.lengthInMeters,
        ) > 1e-7,
      'Road edge geometry is inconsistent.',
    );
    adjacency.get(from.id)!.add(to.id);
    adjacency.get(to.id)!.add(from.id);
  }
  const visited = new Set<string>();
  const pending = s.roadGraph.nodes[0] ? [s.roadGraph.nodes[0].id] : [];
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const next of adjacency.get(id) ?? [])
      if (!visited.has(next)) pending.push(next);
  }
  fail(visited.size !== nodes.size, 'Road graph is disconnected.');
  const accesses = new Map(
    s.buildingAccess.map((access) => [access.buildingId, access.nodeId]),
  );
  fail(
    accesses.size !== s.buildingAccess.length ||
      accesses.size !== buildings.size,
    'Building accesses must be unique and complete.',
  );
  for (const access of s.buildingAccess)
    fail(
      !buildings.has(access.buildingId) || !nodes.has(access.nodeId),
      'Building access reference is invalid.',
    );
  for (const shelter of s.shelters)
    fail(!nodes.has(shelter.nodeId), 'Shelter node reference is invalid.');
  fail(
    new Set(s.shelters.map(({ nodeId }) => nodeId)).size < 2,
    'Shelters must occupy at least two distinct nodes.',
  );
  fail(
    s.shelters
      .filter(({ active }) => active)
      .reduce((sum, shelter) => sum + shelter.capacity, 0) < s.citizens.length,
    'Active shelter capacity is insufficient.',
  );
  for (const citizen of s.citizens) {
    const home = buildings.get(citizen.homeBuildingId);
    fail(
      !home ||
        !nodes.has(citizen.nodeId) ||
        accesses.get(citizen.homeBuildingId) !== citizen.nodeId ||
        !inside(citizen.position),
      'Citizen references or position are invalid.',
    );
    if (home)
      fail(
        citizen.position.x < home.minCorner.x ||
          citizen.position.x > home.maxCorner.x ||
          citizen.position.y < home.minCorner.y ||
          citizen.position.y > home.maxCorner.y,
        'Citizen must start inside its home.',
      );
  }
  const grid = s.terrainGrid;
  const axisValid = (values: number[], end: number) =>
    values[0] === 0 &&
    values.at(-1) === end &&
    values.every((v, i) => i === 0 || v > values[i - 1]!);
  fail(
    !axisValid(grid.xCoordinates, s.config.widthInMeters) ||
      !axisValid(grid.yCoordinates, s.config.heightInMeters),
    'Terrain coordinates are inconsistent with city bounds.',
  );
  fail(
    grid.xCoordinates.length * grid.yCoordinates.length > 10000 ||
      grid.elevationsInMeters.length !== grid.yCoordinates.length ||
      grid.elevationsInMeters.some(
        (row) =>
          row.length !== grid.xCoordinates.length ||
          row.some((value) => value !== s.terrain.elevationInMeters),
      ),
    'Terrain grid dimensions or flat elevations are inconsistent.',
  );
  return issues;
}
