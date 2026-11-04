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
      id: 26,
      tags: { leisure: 'stadium' },
      geometry: [
        at(120, 175),
        at(160, 175),
        at(160, 195),
        at(120, 195),
        at(120, 175),
      ],
    },
    {
      type: 'way',
      id: 27,
      tags: { building: 'yes', amenity: 'hospital', 'building:levels': '3' },
      geometry: [
        at(140, 60),
        at(155, 60),
        at(155, 72),
        at(140, 72),
        at(140, 60),
      ],
    },
    {
      // 3D parts of the relation church: a tower rising from 12 m to 40 m,
      // plus one stray part outside every building (must be dropped).
      type: 'way',
      id: 28,
      tags: { 'building:part': 'tower', height: '40', min_height: '12' },
      geometry: [
        at(110, 150),
        at(116, 150),
        at(116, 156),
        at(110, 156),
        at(110, 150),
      ],
    },
    {
      type: 'way',
      id: 29,
      tags: { 'building:part': 'yes', height: '30' },
      geometry: [at(5, 205), at(10, 205), at(10, 210), at(5, 210), at(5, 205)],
    },
    {
      // Statue-like outline: building AND building:part at once (as OSM
      // tags the Statue of Liberty), with a taller part stacked on top.
      type: 'way',
      id: 31,
      tags: {
        building: 'yes',
        'building:part': 'yes',
        tourism: 'attraction',
        height: '10',
      },
      geometry: [
        at(60, 180),
        at(70, 180),
        at(70, 190),
        at(60, 190),
        at(60, 180),
      ],
    },
    {
      type: 'way',
      id: 32,
      tags: { 'building:part': 'yes', height: '30', min_height: '10' },
      geometry: [
        at(63, 183),
        at(67, 183),
        at(67, 187),
        at(63, 187),
        at(63, 183),
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

  it('keeps street names and plants street trees inside the square', () => {
    const source = fixture();
    source.elements = [
      ...source.elements,
      {
        type: 'way',
        id: 95,
        tags: { highway: 'tertiary', name: 'Calle de Prueba' },
        geometry: [at(15, 190), at(200, 190)],
      },
    ];
    const { city } = createRealCity(source);
    expect(city.roads.some((road) => road.name === 'Calle de Prueba')).toBe(
      true,
    );
    const streetTrees = city.district!.urban!.amenities.filter(
      (item) => item.parkId === 'street' && item.kind === 'tree',
    );
    expect(streetTrees.length).toBeGreaterThan(0);
    for (const tree of streetTrees) {
      expect(tree.position.x).toBeGreaterThanOrEqual(0);
      expect(tree.position.y).toBeGreaterThanOrEqual(0);
      expect(tree.position.x).toBeLessThanOrEqual(width);
      expect(tree.position.y).toBeLessThanOrEqual(height);
      expect(
        city.buildings.some(
          (building) =>
            tree.position.x > building.minCorner.x - 1.4 &&
            tree.position.x < building.maxCorner.x + 1.4 &&
            tree.position.y > building.minCorner.y - 1.4 &&
            tree.position.y < building.maxCorner.y + 1.4,
        ),
      ).toBe(false);
    }
  });

  it('clips footprints and parks that cross the square border', () => {
    const source = fixture();
    source.elements = [
      ...source.elements,
      {
        type: 'way',
        id: 90,
        tags: { building: 'apartments', height: '12' },
        geometry: [
          at(width - 10, 40),
          at(width + 40, 40),
          at(width + 40, 65),
          at(width - 10, 65),
          at(width - 10, 40),
        ],
      },
      {
        type: 'way',
        id: 91,
        tags: { leisure: 'park' },
        geometry: [
          at(-30, 150),
          at(30, 150),
          at(30, 175),
          at(-30, 175),
          at(-30, 150),
        ],
      },
    ];
    const { city } = createRealCity(source);
    for (const building of city.buildings) {
      expect(building.minCorner.x).toBeGreaterThanOrEqual(-0.01);
      expect(building.minCorner.y).toBeGreaterThanOrEqual(-0.01);
      expect(building.maxCorner.x).toBeLessThanOrEqual(width + 0.01);
      expect(building.maxCorner.y).toBeLessThanOrEqual(height + 0.01);
      for (const point of building.footprint ?? []) {
        expect(point.x).toBeGreaterThanOrEqual(-0.01);
        expect(point.x).toBeLessThanOrEqual(width + 0.01);
        expect(point.y).toBeGreaterThanOrEqual(-0.01);
        expect(point.y).toBeLessThanOrEqual(height + 0.01);
      }
    }
    // The crossing building survives, cut exactly at the border.
    expect(
      city.buildings.some(
        (building) => Math.abs(building.maxCorner.x - width) < 0.5,
      ),
    ).toBe(true);
    expect(
      city.district!.parks.every(
        (item) =>
          item.minCorner.x >= -0.01 &&
          item.minCorner.y >= -0.01 &&
          item.maxCorner.x <= width + 0.01 &&
          item.maxCorner.y <= height + 0.01,
      ),
    ).toBe(true);
  });

  it('converts building footprints to contained rotated rectangles with height provenance', () => {
    const { city, metadata } = createRealCity(fixture());
    expect(city.buildings).toHaveLength(8);
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
    expect(metadata.measuredBuildingHeights).toBe(5);
    expect(metadata.estimatedBuildingHeights).toBe(3);
    expect(city.buildings[2]!.heightInMeters).toBeGreaterThanOrEqual(6);
    expect(city.district!.parks).toHaveLength(1);
    const trees = city.district!.urban!.amenities.filter(
      (item) => item.kind === 'tree',
    );
    expect(trees.length).toBeGreaterThan(0);
    // Park trees belong to the park; street trees are a separate channel.
    const parkTrees = trees.filter((tree) => tree.parkId !== 'street');
    expect(parkTrees.length).toBeGreaterThan(0);
    expect(parkTrees.every((tree) => tree.parkId === 'real-park-0')).toBe(true);
    // Deterministic: converting again yields identical placement.
    const again = createRealCity(fixture());
    expect(again.city.district!.urban!.amenities).toEqual(
      city.district!.urban!.amenities,
    );
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

  it('classifies stadiums and hospitals as landmarks with usable heights', () => {
    const { city, metadata } = createRealCity(fixture());
    const stadium = city.buildings.find((b) => b.landmark === 'stadium')!;
    expect(stadium).toBeDefined();
    expect(stadium.heightInMeters).toBeGreaterThanOrEqual(12);
    expect(stadium.heightInMeters).toBeLessThanOrEqual(40);
    const hospital = city.buildings.find((b) => b.landmark === 'health')!;
    expect(hospital).toBeDefined();
    expect(hospital.heightInMeters).toBe(9);
    expect(metadata.landmarkBuildings).toBe(5);
  });

  it('attaches floating statue volumes to their pedestal and maps point monuments', () => {
    const source = fixture();
    source.elements.push(
      {
        type: 'way',
        id: 40,
        tags: { building: 'yes', tourism: 'attraction', height: '10' },
        geometry: [at(15, 15), at(55, 15), at(55, 55), at(15, 55), at(15, 15)],
      },
      {
        // Statue body: a building that only exists from 47 m upwards.
        type: 'way',
        id: 41,
        tags: { building: 'yes', height: '93', min_height: '47' },
        geometry: [at(30, 30), at(40, 30), at(40, 40), at(30, 40), at(30, 30)],
      },
      { type: 'node', id: 50, tags: { tourism: 'artwork' }, ...at(150, 30) },
      // A point monument already covered by a footprint building is dropped.
      { type: 'node', id: 51, tags: { tourism: 'artwork' }, ...at(35, 35) },
    );
    const { city, metadata } = createRealCity(source);
    // No ground-extruded 93 m slab: the figure is a part of the pedestal.
    expect(city.buildings.some((b) => b.heightInMeters === 93)).toBe(false);
    const pedestal = city.buildings.find((b) =>
      (b.parts ?? []).some(
        (part) => part.minHeightInMeters === 47 && part.heightInMeters === 93,
      ),
    )!;
    expect(pedestal).toBeDefined();
    expect(pedestal.heightInMeters).toBe(10);
    const monuments = city.buildings.filter((b) => b.landmark === 'monument');
    expect(monuments).toHaveLength(1);
    expect(monuments[0]!.heightInMeters).toBe(12);
    expect(metadata.landmarkBuildings).toBeGreaterThanOrEqual(6);
  });

  it('levels park DEM nodes to the park median (flat plaza)', () => {
    const source = fixture();
    // Fixture park spans x 20-50, y 20-45: DEM nodes at x 20/40, y 20/40.
    // One park corner carries +15 m of tree/building surface-model noise.
    const elevations = source.dem.yCoordinates.map((y) =>
      source.dem.xCoordinates.map((x) => {
        if (x === 60 || x === 80) return 12; // real slope outside the park
        if (x >= 20 && x <= 40 && y >= 20 && y <= 40)
          return x === 40 && y === 40 ? 25 : 10;
        return 10;
      }),
    );
    const { city } = createRealCity({
      ...source,
      dem: { ...source.dem, elevationsInMeters: elevations },
    });
    const grid = city.terrainGrid!;
    const cAt = (v: number) => grid.xCoordinates.indexOf(v);
    const rAt = (v: number) => grid.yCoordinates.indexOf(v);
    // Every park node reads the median (10): the plaza is flat.
    expect(grid.elevationsInMeters[rAt(40)]![cAt(40)]).toBe(10);
    expect(grid.elevationsInMeters[rAt(20)]![cAt(20)]).toBe(10);
    // The street ring one cell out is capped to plaza level + 1 m...
    expect(grid.elevationsInMeters[rAt(40)]![cAt(60)]).toBe(11);
    // ...and beyond the apron the terrain is untouched.
    expect(grid.elevationsInMeters[rAt(40)]![cAt(80)]).toBe(12);
  });

  it('clamps isolated one-cell DEM spikes but keeps real slopes', () => {
    const source = fixture();
    const rows = source.dem.yCoordinates.length;
    const cols = source.dem.xCoordinates.length;
    const elevations = source.dem.yCoordinates.map((_, r) =>
      source.dem.xCoordinates.map((_, c) => {
        if (r === Math.floor(rows / 2) && c === Math.floor(cols / 2)) return 30;
        if (c >= Math.floor(cols / 2)) return 12; // broad step, not a spike
        return 10;
      }),
    );
    const { city } = createRealCity({
      ...source,
      dem: { ...source.dem, elevationsInMeters: elevations },
    });
    const grid = city.terrainGrid!;
    const midR = Math.floor(rows / 2);
    const midC = Math.floor(cols / 2);
    // Spike clamped to its highest neighbour (12), slope step preserved.
    expect(grid.elevationsInMeters[midR]![midC]).toBe(12);
    expect(grid.elevationsInMeters[midR]![midC + 2]).toBe(12);
    expect(grid.elevationsInMeters[midR]![1]).toBe(10);
    // Source object untouched.
    expect(elevations[midR]![midC]).toBe(30);
  });

  it('classifies building=obelisk ways as obelisk monuments', () => {
    const source = fixture();
    source.elements.push({
      type: 'way',
      id: 48,
      tags: { building: 'obelisk', tourism: 'attraction', height: '60' },
      geometry: [at(58, 20), at(64, 20), at(64, 26), at(58, 26), at(58, 20)],
    });
    const { city } = createRealCity(source);
    const obelisk = city.buildings.find(
      (b) => b.landmark === 'monument' && b.heightInMeters === 60,
    )!;
    expect(obelisk).toBeDefined();
    expect(obelisk.monumentShape).toBe('obelisk');
  });

  it('classifies cathedrals and wikidata churches above plain churches', () => {
    const source = fixture();
    source.elements.push(
      {
        type: 'way',
        id: 46,
        tags: { building: 'cathedral' },
        geometry: [
          at(90, 120),
          at(110, 120),
          at(110, 140),
          at(90, 140),
          at(90, 120),
        ],
      },
      {
        type: 'way',
        id: 47,
        tags: { building: 'church', wikidata: 'Q12345' },
        geometry: [
          at(145, 95),
          at(155, 95),
          at(155, 105),
          at(145, 105),
          at(145, 95),
        ],
      },
    );
    const { city } = createRealCity(source);
    const cathedrals = city.buildings.filter((b) => b.landmark === 'cathedral');
    expect(cathedrals).toHaveLength(2);
    // Cathedral nave estimate clears the 24 m floor (towers rise above).
    expect(cathedrals.every((b) => b.heightInMeters >= 24)).toBe(true);
    // The fixture's plain church stays a plain church.
    expect(city.buildings.some((b) => b.landmark === 'religious')).toBe(true);
  });

  it('keeps GeoJSON-style courtyard holes on way buildings', () => {
    const source = fixture();
    source.elements.push({
      type: 'way',
      id: 45,
      tags: { building: 'church', height: '20' },
      geometry: [
        at(90, 170),
        at(130, 170),
        at(130, 210),
        at(90, 210),
        at(90, 170),
      ],
      holes: [
        [at(105, 185), at(115, 185), at(115, 195), at(105, 195), at(105, 185)],
      ],
    });
    const { city } = createRealCity(source);
    const church = city.buildings.find(
      (b) => b.landmark === 'religious' && b.heightInMeters === 20,
    )!;
    expect(church).toBeDefined();
    expect(church.footprintHoles).toHaveLength(1);
    expect(church.footprintHoles![0]).toHaveLength(4);
  });

  it('keeps buildings that are also building:part (statue outlines)', () => {
    const { city } = createRealCity(fixture());
    const statue = city.buildings.find((b) => b.landmark === 'civic')!;
    expect(statue).toBeDefined();
    expect(statue.heightInMeters).toBe(10);
    expect(
      statue.parts?.map((part) => part.heightInMeters).sort((a, b) => a - b),
    ).toEqual([10, 30]);
  });

  it('attaches 3D parts to their parent building and drops strays', () => {
    const { city } = createRealCity(fixture());
    const church = city.buildings.find(
      (b) => b.landmark === 'religious' && b.heightInMeters === 24,
    )!;
    expect(church.parts).toHaveLength(1);
    expect(church.parts![0]).toMatchObject({
      heightInMeters: 40,
      minHeightInMeters: 12,
    });
    // Parts are never standalone buildings.
    expect(city.buildings.every((b) => !b.id.includes('part'))).toBe(true);
    expect(city.buildings).toHaveLength(8);
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
