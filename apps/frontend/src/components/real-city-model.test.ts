import { describe, expect, it } from 'vitest';
import {
  createRealCity,
  projectedExtentInMeters,
  type OsmElementInput,
  type RealCitySource,
} from './real-city-model';
import { DistrictSimulation } from './district-simulation';

const bbox = { south: 41.39, west: 2.16, north: 41.392, east: 2.162 };
const { widthInMeters: width, heightInMeters: height } =
  projectedExtentInMeters(bbox);

// Local meters -> lat/lon using the inverse of the converter approximation.
const metersPerDegreeLat = height / (bbox.north - bbox.south);
const metersPerDegreeLon = width / (bbox.east - bbox.west);
const at = (x: number, y: number) => ({
  lat: bbox.south + y / metersPerDegreeLat,
  lon: bbox.west + x / metersPerDegreeLon,
});

function axis(length: number, cell = 20): number[] {
  const values = Array.from({ length: Math.ceil(length / cell) + 1 }, (_, i) =>
    Math.min(i * cell, length),
  );
  return values;
}

function fixture(): RealCitySource {
  const xs = axis(width);
  const ys = axis(height);
  const cross = at(80, 100);
  const elements: OsmElementInput[] = [
    {
      type: 'way',
      id: 10,
      tags: { highway: 'residential' },
      geometry: [at(10, 100), cross, at(160, 100)],
    },
    {
      type: 'way',
      id: 11,
      tags: { highway: 'primary' },
      geometry: [at(80, 10), cross, at(80, 210)],
    },
    {
      type: 'way',
      id: 12,
      tags: { highway: 'footway' },
      geometry: [at(10, 10), at(80, 10)],
    },
    {
      type: 'way',
      id: 20,
      tags: { building: 'apartments', height: '21' },
      geometry: [
        at(30, 130),
        at(55, 130),
        at(55, 155),
        at(30, 155),
        at(30, 130),
      ],
    },
    {
      type: 'way',
      id: 21,
      tags: { building: 'retail', 'building:levels': '2' },
      // Diamond (rotated square) to exercise the oriented rectangle.
      geometry: [
        at(120, 40),
        at(135, 55),
        at(120, 70),
        at(105, 55),
        at(120, 40),
      ],
    },
    {
      type: 'way',
      id: 22,
      tags: { building: 'yes' },
      geometry: [
        at(120, 140),
        at(140, 140),
        at(140, 160),
        at(120, 160),
        at(120, 140),
      ],
    },
    {
      type: 'way',
      id: 25,
      tags: { building: 'church', 'building:levels': '1' },
      geometry: [
        at(20, 180),
        at(32, 180),
        at(32, 190),
        at(20, 190),
        at(20, 180),
      ],
    },
    {
      type: 'way',
      id: 30,
      tags: { leisure: 'park' },
      geometry: [at(20, 20), at(50, 20), at(50, 45), at(20, 45), at(20, 20)],
    },
    {
      type: 'way',
      id: 40,
      tags: { highway: 'construction' },
      geometry: [at(0, 0), at(160, 210)],
    },
    {
      // Multipolygon building (church-like): outer ring split into two
      // fragments, one reversed, plus an inner courtyard ring.
      type: 'relation',
      id: 900,
      tags: { building: 'church', 'building:levels': '8' },
      members: [
        {
          type: 'way',
          role: 'outer',
          geometry: [at(100, 140), at(130, 140), at(130, 170)],
        },
        {
          type: 'way',
          role: 'outer',
          geometry: [at(130, 170), at(100, 170), at(100, 140)],
        },
        {
          type: 'way',
          role: 'inner',
          geometry: [
            at(112, 152),
            at(118, 152),
            at(118, 158),
            at(112, 158),
            at(112, 152),
          ],
        },
      ],
    },
  ];
  return {
    name: 'Fixture',
    bbox,
    osmTimestamp: '2026-01-01T00:00:00Z',
    elements,
    dem: {
      source: 'fixture-dem',
      xCoordinates: xs,
      yCoordinates: ys,
      elevationsInMeters: ys.map((y) =>
        xs.map((x) => 10 + x * 0.01 + y * 0.02),
      ),
    },
  };
}

describe('createRealCity', () => {
  it('projects roads into a shared-node graph with profiles and lengths', () => {
    const { city } = createRealCity(fixture(), { citizenCount: 6 });
    expect(city.config.widthInMeters).toBeCloseTo(width, 0);
    expect(city.config.heightInMeters).toBeCloseTo(height, 0);
    // Two crossing ways plus the footway share endpoints instead of duplicating them.
    const nodes = city.roadGraph!.nodes;
    const crossing = nodes.filter(
      (node) => Math.abs(node.x - 80) < 0.6 && Math.abs(node.y - 100) < 0.6,
    );
    expect(crossing).toHaveLength(1);
    expect(city.roadGraph!.edges).toHaveLength(5);
    for (const edge of city.roadGraph!.edges!) {
      expect(edge.bidirectional).toBe(true);
      expect(edge.lengthInMeters).toBeGreaterThan(0);
      const road = city.roads.find((item) => item.id === edge.roadId)!;
      expect(road.start).not.toEqual(road.end);
    }
    const avenue = city.roads.find((road) => road.profile?.kind === 'avenue')!;
    expect(avenue.profile?.widthInMeters).toBe(12);
    const footway = city.roads.find((road) => road.profile?.kind === 'alley')!;
    expect(footway.profile?.motorVehiclesAllowed).toBe(false);
    // The construction way is excluded.
    expect(city.roads).toHaveLength(5);
  });

  it('converts building footprints to contained rotated rectangles with height provenance', () => {
    const { city, metadata } = createRealCity(fixture());
    expect(city.buildings).toHaveLength(5);
    const measured = city.buildings[0]!;
    expect(measured.heightInMeters).toBe(21);
    const shop = city.buildings[1]!;
    expect(shop.use).toBe('commercial');
    expect(shop.heightInMeters).toBe(6);
    // The diamond footprint fits inside its axis-aligned conservative bounds
    // and the presented rectangle is square-ish and rotated.
    expect(shop.maxCorner.x - shop.minCorner.x).toBeGreaterThan(28);
    expect(shop.maxCorner.y - shop.minCorner.y).toBeGreaterThan(28);
    expect(shop.presentation!.widthInMeters).toBeCloseTo(21.2, 0);
    expect(Math.abs(shop.presentation!.yawInRadians)).toBeGreaterThan(0.5);
    expect(metadata.measuredBuildingHeights).toBe(3);
    expect(metadata.estimatedBuildingHeights).toBe(2);
    expect(city.buildings[2]!.heightInMeters).toBeGreaterThanOrEqual(6);
    expect(city.district!.parks).toHaveLength(1);
  });

  it('stitches relation fragments into a footprint with courtyard holes', () => {
    const { city } = createRealCity(fixture());
    const church = city.buildings.find(
      (building) => building.heightInMeters === 24,
    )!;
    expect(church).toBeDefined();
    expect(church.footprint).toHaveLength(4);
    expect(church.footprintHoles).toHaveLength(1);
    expect(church.footprintHoles![0]).toHaveLength(4);
    // The conservative hazard envelope still contains the real footprint.
    for (const point of church.footprint!) {
      expect(point.x).toBeGreaterThanOrEqual(church.minCorner.x - 0.01);
      expect(point.x).toBeLessThanOrEqual(church.maxCorner.x + 0.01);
      expect(point.y).toBeGreaterThanOrEqual(church.minCorner.y - 0.01);
      expect(point.y).toBeLessThanOrEqual(church.maxCorner.y + 0.01);
    }
    // Every real building carries its exact footprint for rendering.
    expect(city.buildings.every((building) => building.footprint)).toBe(true);
  });

  it('gives churches a representative estimated height and landmark flag', () => {
    const { city, metadata } = createRealCity(fixture());
    const chapel = city.buildings.find(
      (building) =>
        building.landmark === 'religious' && building.heightInMeters < 20,
    )!;
    expect(chapel).toBeDefined();
    // Tagged as 1 level (3 m) in the source; a nave is not 3 m tall.
    expect(chapel.heightInMeters).toBeGreaterThanOrEqual(18);
    expect(metadata.syntheticBuildings).toBe(0);
    const basilica = city.buildings.find(
      (building) =>
        building.landmark === 'religious' && building.heightInMeters === 24,
    )!;
    expect(basilica).toBeDefined();
  });

  it('fills empty street frontage only when synthetic infill is requested', () => {
    const plain = createRealCity(fixture(), { citizenCount: 0 });
    const filled = createRealCity(fixture(), {
      citizenCount: 0,
      infillSyntheticHouses: true,
    });
    const filledAgain = createRealCity(fixture(), {
      citizenCount: 0,
      infillSyntheticHouses: true,
    });
    expect(filled.city).toEqual(filledAgain.city);
    expect(filled.city.buildings.length).toBeGreaterThan(
      plain.city.buildings.length,
    );
    expect(filled.metadata.syntheticBuildings).toBe(
      filled.city.buildings.length - plain.city.buildings.length,
    );
    const originals = plain.city.buildings;
    for (const building of filled.city.buildings) {
      if (!building.synthetic) continue;
      expect(building.id).toMatch(/^real-infill-/);
      const cx = (building.minCorner.x + building.maxCorner.x) / 2;
      const cy = (building.minCorner.y + building.maxCorner.y) / 2;
      expect(
        originals.some(
          (other) =>
            cx > other.minCorner.x - 1 &&
            cx < other.maxCorner.x + 1 &&
            cy > other.minCorner.y - 1 &&
            cy < other.maxCorner.y + 1,
        ),
      ).toBe(false);
    }
    expect(plain.metadata.syntheticBuildings).toBe(0);
    expect(plain.city.buildings.every((b) => !b.synthetic)).toBe(true);
  });

  it('keeps DEM grid, citizens, shelters and metadata consistent and deterministic', () => {
    const first = createRealCity(fixture(), { citizenCount: 12 });
    const second = createRealCity(fixture(), { citizenCount: 12 });
    expect(first).toEqual(second);
    const { city, metadata } = first;
    expect(city.terrainGrid!.source).toBe('fixture-dem');
    expect(city.terrainGrid!.elevationsInMeters[0]![0]).toBeCloseTo(10, 5);
    expect(city.terrain.elevationInMeters).toBe(10);
    expect(metadata.demCellSizeInMeters).toBe(20);
    expect(metadata.attribution).toContain('OpenStreetMap');
    const buildingIds = new Set(city.buildings.map((b) => b.id));
    const nodeIds = new Set(city.roadGraph!.nodes.map((n) => n.id));
    expect(city.citizens).toHaveLength(12);
    for (const citizen of city.citizens!) {
      expect(buildingIds.has(citizen.homeBuildingId)).toBe(true);
      expect(nodeIds.has(citizen.nodeId)).toBe(true);
    }
    expect(city.shelters!.length).toBeGreaterThanOrEqual(2);
    for (const shelter of city.shelters!)
      expect(shelter.capacity).toBeGreaterThanOrEqual(12);
    // Shelters sit on high ground: their terrain beats the lowest corner.
    const shelterNode = city.roadGraph!.nodes.find(
      (node) => node.id === city.shelters![0]!.nodeId,
    )!;
    expect(shelterNode.y).toBeGreaterThan(height * 0.5);
  });

  it('does not mutate the source', () => {
    const source = fixture();
    const snapshot = JSON.parse(JSON.stringify(source));
    createRealCity(source);
    expect(source).toEqual(snapshot);
  });

  it('rejects oversize extents and mismatched DEM grids', () => {
    const source = fixture();
    expect(() =>
      createRealCity({
        ...source,
        bbox: { south: 41, west: 2, north: 42, east: 3 },
      }),
    ).toThrow(RangeError);
    expect(() =>
      createRealCity({
        ...source,
        dem: { ...source.dem, elevationsInMeters: [[1, 2]] },
      }),
    ).toThrow(RangeError);
    expect(() => createRealCity({ ...source, elements: [] })).toThrow(
      RangeError,
    );
  });

  it('clips border roads to the DEM grid extent so simulation drains stay inside', () => {
    const source = fixture();
    // Rounded DEM axes may end centimetres inside the projected extent;
    // nodes clipped to the projection would fall outside the solver grid.
    const xs = [...source.dem.xCoordinates];
    xs[xs.length - 1] = xs[xs.length - 1]! - 0.04;
    const borderRoad: OsmElementInput = {
      type: 'way',
      id: 5,
      tags: { highway: 'residential' },
      geometry: [at(width, 10), at(width, 100), at(80, 100)],
    };
    const { city } = createRealCity(
      {
        ...source,
        elements: [borderRoad, ...source.elements],
        dem: {
          ...source.dem,
          xCoordinates: xs,
          elevationsInMeters: source.dem.yCoordinates.map(() =>
            source.dem.xCoordinates.map(() => 10),
          ),
        },
      },
      { citizenCount: 4 },
    );
    expect(
      Math.max(...city.roadGraph!.nodes.map((node) => node.x)),
    ).toBeLessThanOrEqual(xs[xs.length - 1]!);
    expect(
      () =>
        new DistrictSimulation(city, {
          evacuationEnabled: true,
          autoStart: true,
          hazard: 'rain',
        }),
    ).not.toThrow();
  });

  it('produces a city the flood and evacuation simulation can advance', () => {
    const { city } = createRealCity(fixture(), { citizenCount: 10 });
    const simulation = new DistrictSimulation(city, {
      evacuationEnabled: true,
      alarmMode: 'automatic',
      autoStart: true,
      hazard: 'rain',
    });
    expect(simulation.cells.length).toBeGreaterThan(0);
    expect(simulation.evacuation.citizens).toHaveLength(10);
    simulation.advance(1);
    expect(simulation.snapshot.waterDepthInMeters.length).toBe(
      simulation.cells.length,
    );
    simulation.reset();
    expect(simulation.snapshot.elapsedTimeInSeconds).toBe(0);
  });
});
