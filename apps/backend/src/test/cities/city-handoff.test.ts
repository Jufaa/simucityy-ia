import { describe, expect, it } from 'vitest';
import { generateCityScenario } from '../../modules/cities/city-scenario-generator';
import { cityScenarioSchema } from '../../modules/cities/city.schema';

const options = {
  config: {
    widthInMeters: 150,
    heightInMeters: 120,
    streetSpacingInMeters: 50,
    seed: 42,
  },
  terrain: { kind: 'flat' as const, elevationInMeters: 4 },
};

describe('complete synthetic city handoff', () => {
  it('creates a connected graph, valid building accesses, shelters and residents', () => {
    const scenario = generateCityScenario(options);
    const { nodes, edges } = scenario.roadGraph;
    const visited = new Set([nodes[0]!.id]);
    for (let previous = -1; previous !== visited.size;) {
      previous = visited.size;
      for (const edge of edges) {
        if (visited.has(edge.from)) visited.add(edge.to);
        if (visited.has(edge.to)) visited.add(edge.from);
      }
    }
    expect(visited.size).toBe(nodes.length);
    expect(scenario.buildingAccess).toHaveLength(scenario.buildings.length);
    expect(scenario.shelters).toHaveLength(2);
    expect(new Set(scenario.shelters.map(({ nodeId }) => nodeId)).size).toBe(2);
    expect(
      scenario.shelters.reduce((sum, shelter) => sum + shelter.capacity, 0),
    ).toBeGreaterThanOrEqual(200);
    expect(scenario.citizens).toHaveLength(200);
    for (const citizen of scenario.citizens) {
      expect(
        scenario.buildings.some(({ id }) => id === citizen.homeBuildingId),
      ).toBe(true);
      expect(visited.has(citizen.nodeId)).toBe(true);
      expect(citizen.status).toBe('normal');
    }
  });

  it('samples terrain at explicit coordinates including partial boundary cells', () => {
    const scenario = generateCityScenario(options);
    expect(scenario.terrainGrid.xCoordinates.at(-1)).toBe(150);
    expect(scenario.terrainGrid.yCoordinates.at(-1)).toBe(120);
    expect(scenario.terrainGrid.elevationsInMeters).toHaveLength(
      scenario.terrainGrid.yCoordinates.length,
    );
    for (const row of scenario.terrainGrid.elevationsInMeters) {
      expect(row).toHaveLength(scenario.terrainGrid.xCoordinates.length);
      expect(row.every((elevation) => elevation === 4)).toBe(true);
    }
  });

  it('is deterministic, keeps inputs unchanged and isolates returned data', () => {
    const input = structuredClone(options);
    const before = structuredClone(input);
    const scenario = generateCityScenario(input);
    expect(scenario).toEqual(generateCityScenario(input));
    expect(input).toEqual(before);
    scenario.config.widthInMeters = 1;
    scenario.terrain.elevationInMeters = 999;
    expect(input).toEqual(before);
  });

  it('keeps building heights independent of population size', () => {
    const a = generateCityScenario({ ...options, populationCount: 100 });
    const b = generateCityScenario({ ...options, populationCount: 300 });
    expect(a.buildings).toEqual(b.buildings);
    expect(a.citizens).toEqual(b.citizens.slice(0, 100));
  });

  it('rejects unsupported workload before generating entities', () => {
    expect(() =>
      generateCityScenario({ ...options, populationCount: 301 }),
    ).toThrow();
    expect(() =>
      generateCityScenario({ ...options, terrainCellSizeInMeters: 0.001 }),
    ).toThrow();
  });

  it.each(['roads', 'blocks', 'buildings'] as const)(
    'rejects duplicate IDs in %s',
    (collection) => {
      const scenario = generateCityScenario(options);
      scenario[collection][1]!.id = scenario[collection][0]!.id;
      expect(cityScenarioSchema.safeParse(scenario).success).toBe(false);
    },
  );

  it.each(['blocks', 'buildings'] as const)(
    'rejects outside or overlapping rectangles in %s',
    (collection) => {
      const scenario = generateCityScenario(options);
      scenario[collection][0]!.maxCorner.x = 999;
      expect(cityScenarioSchema.safeParse(scenario).success).toBe(false);
      const overlap = generateCityScenario(options);
      overlap[collection][1]!.minCorner = {
        ...overlap[collection][0]!.minCorner,
      };
      overlap[collection][1]!.maxCorner = {
        ...overlap[collection][0]!.maxCorner,
      };
      expect(cityScenarioSchema.safeParse(overlap).success).toBe(false);
    },
  );

  it('rejects dangling graph, home, shelter and access references', () => {
    for (const mutate of [
      (s: ReturnType<typeof generateCityScenario>) => {
        s.roadGraph.edges[0]!.to = 'missing';
      },
      (s: ReturnType<typeof generateCityScenario>) => {
        s.citizens[0]!.homeBuildingId = 'missing';
      },
      (s: ReturnType<typeof generateCityScenario>) => {
        s.shelters[0]!.nodeId = 'missing';
      },
      (s: ReturnType<typeof generateCityScenario>) => {
        s.buildingAccess[0]!.nodeId = 'missing';
      },
    ]) {
      const scenario = generateCityScenario(options);
      mutate(scenario);
      expect(cityScenarioSchema.safeParse(scenario).success).toBe(false);
    }
  });

  it('rejects disconnected graphs and insufficient active shelter capacity', () => {
    const disconnected = generateCityScenario(options);
    disconnected.roadGraph.edges = [];
    expect(cityScenarioSchema.safeParse(disconnected).success).toBe(false);
    const noCapacity = generateCityScenario(options);
    noCapacity.shelters.forEach((shelter) => {
      shelter.active = false;
    });
    expect(cityScenarioSchema.safeParse(noCapacity).success).toBe(false);
  });

  it('rejects a malformed or inconsistent terrain grid', () => {
    const scenario = generateCityScenario(options);
    scenario.terrainGrid.elevationsInMeters[0]!.pop();
    expect(cityScenarioSchema.safeParse(scenario).success).toBe(false);
  });
});
