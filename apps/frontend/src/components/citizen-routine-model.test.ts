import { expect, it } from 'vitest';
import type { CityResponse } from './city-types';
import { CitizenRoutineModel } from './citizen-routine-model';

const city: CityResponse = {
  config: {
    widthInMeters: 120,
    heightInMeters: 80,
    streetSpacingInMeters: 40,
    seed: 19,
  },
  terrain: { kind: 'flat', elevationInMeters: 0 },
  roads: [],
  blocks: [],
  buildings: [
    {
      id: 'home',
      minCorner: { x: 0, y: 0 },
      maxCorner: { x: 4, y: 4 },
      heightInMeters: 6,
      use: 'residential',
    },
    {
      id: 'work',
      minCorner: { x: 40, y: 0 },
      maxCorner: { x: 44, y: 4 },
      heightInMeters: 8,
      use: 'commercial',
    },
    {
      id: 'museum',
      minCorner: { x: 80, y: 0 },
      maxCorner: { x: 84, y: 4 },
      heightInMeters: 8,
      use: 'commercial',
    },
  ],
  roadGraph: {
    nodes: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 40, y: 0 },
      { id: 'c', x: 80, y: 0 },
    ],
    edges: [
      {
        id: 'ab',
        roadId: 'ab',
        from: 'a',
        to: 'b',
        lengthInMeters: 40,
        bidirectional: true,
      },
      {
        id: 'bc',
        roadId: 'bridge',
        from: 'b',
        to: 'c',
        lengthInMeters: 40,
        bidirectional: true,
      },
    ],
  },
  citizens: [
    {
      id: 'p',
      homeBuildingId: 'home',
      nodeId: 'a',
      position: { x: 2, y: 2 },
      mobilityFactor: 1,
      reactionDelayInSeconds: 0,
    },
  ],
};
const facilities = [{ buildingId: 'museum', role: 'museum' as const }];

it('reproducibly visits destinations and returns home on graph edges without mutating citizens', () => {
  const before = structuredClone(city);
  const a = new CitizenRoutineModel(city, facilities),
    b = new CitizenRoutineModel(city, facilities);
  const visits = new Set<string>();
  let returned = false,
    departed = false;
  for (let i = 0; i < 600; i++) {
    a.advance(1);
    b.advance(1);
    expect(a.snapshot).toEqual(b.snapshot);
    const person = a.snapshot.citizens[0];
    expect(person?.position.y).toBe(0);
    expect(person?.position.x).toBeGreaterThanOrEqual(0);
    expect(person?.position.x).toBeLessThanOrEqual(80);
    if (person) visits.add(person.activity);
    if (person?.walking) departed = true;
    if (departed && person?.activity === 'home') returned = true;
  }
  expect(visits.has('work')).toBe(true);
  expect(visits.has('museum')).toBe(true);
  expect(returned).toBe(true);
  expect(city).toEqual(before);
});

it('freezes on a closed current edge, pauses exactly and bounds active walkers without dropping IDs', () => {
  const population = {
    ...city,
    citizens: Array.from({ length: 120 }, (_, i) => ({
      ...city.citizens![0]!,
      id: `p${i}`,
    })),
  };
  const model = new CitizenRoutineModel(population, facilities, 2);
  for (let i = 0; i < 15; i++) model.advance(1);
  expect(model.snapshot.citizens).toHaveLength(120);
  expect(
    model.snapshot.citizens.filter((p) => p.activity !== 'home').length,
  ).toBeLessThanOrEqual(2);
  const locations = model.locations;
  const onEdge = locations.find((p) => p.edge);
  expect(onEdge).toBeDefined();
  const before = model.snapshot.citizens.find(
    (p) => p.id === onEdge?.citizenId,
  )?.position;
  model.advance(1, [onEdge?.edge?.edgeId ?? '']);
  expect(
    model.snapshot.citizens.find((p) => p.id === onEdge?.citizenId)?.position,
  ).toEqual(before);
  const paused = model.snapshot;
  model.advance(0);
  expect(model.snapshot).toEqual(paused);
  const fresh = new CitizenRoutineModel(population, facilities, 2);
  expect(fresh.locations.every((p) => p.occupiedBuildingId === 'home')).toBe(
    true,
  );
});

it('leaves missing or unreachable destinations idle and respects directed paths', () => {
  const disconnected = {
    ...city,
    roadGraph: { nodes: city.roadGraph!.nodes, edges: [] },
  };
  const model = new CitizenRoutineModel(disconnected, facilities);
  for (let i = 0; i < 300; i++) model.advance(1);
  expect(model.snapshot.citizens[0]?.position).toEqual({ x: 0, y: 0 });
  expect(model.snapshot.citizens[0]?.walking).toBe(false);
});

it('uses schools and parks when available, keeps IDs and preserves partitioned simulation time', () => {
  const schoolCity = {
    ...city,
    citizens: Array.from({ length: 12 }, (_, i) => ({
      ...city.citizens![0]!,
      id: `student-${i}`,
    })),
    district: {
      roadWidthInMeters: 6,
      sidewalkWidthInMeters: 2,
      sidewalks: [],
      parks: [
        { id: 'park', minCorner: { x: 79, y: 0 }, maxCorner: { x: 81, y: 2 } },
      ],
    },
  };
  const schoolFacilities = [{ buildingId: 'work', role: 'school' as const }];
  const a = new CitizenRoutineModel(schoolCity, schoolFacilities),
    b = new CitizenRoutineModel(schoolCity, schoolFacilities);
  for (let i = 0; i < 10; i++) {
    a.advance(30);
    for (let j = 0; j < 30; j++) b.advance(1);
  }
  a.locations.forEach((location, index) => {
    const other = b.locations[index];
    expect(location.citizenId).toBe(other?.citizenId);
    expect(location.nodeId).toBe(other?.nodeId);
    expect(location.occupiedBuildingId).toBe(other?.occupiedBuildingId);
    expect(location.edge?.edgeId).toBe(other?.edge?.edgeId);
    if (location.edge)
      expect(location.edge.progressInMeters).toBeCloseTo(
        other?.edge?.progressInMeters ?? -1,
        8,
      );
  });
  expect(a.snapshot.citizens.map((p) => p.id)).toEqual(
    [...schoolCity.citizens.map((p) => p.id)].sort((a, b) =>
      a.localeCompare(b),
    ),
  );
  const visits = new Set<string>();
  for (let i = 0; i < 300; i++) {
    a.advance(1);
    a.snapshot.citizens.forEach((p) => visits.add(p.activity));
  }
  expect(visits.has('school')).toBe(true);
  expect(visits.has('park')).toBe(true);
});
