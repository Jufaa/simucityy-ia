import { describe, expect, it } from 'vitest';
import type { CityResponse } from './city-types';
import type { CivicLandmarkModel } from './civic-landmarks';
import { generateCityServices } from './city-services';

function fixture(): CityResponse {
  return {
    config: {
      widthInMeters: 500,
      heightInMeters: 500,
      streetSpacingInMeters: 50,
    },
    terrain: { kind: 'flat', elevationInMeters: 0 },
    roads: [],
    blocks: [],
    buildings: ['home-a', 'home-b', 'home-d', 'clinic', 'museum'].map(
      (id, i) => ({
        id,
        minCorner: { x: i * 20, y: 0 },
        maxCorner: { x: i * 20 + 10, y: 10 },
        heightInMeters: 8,
        use: i < 3 ? 'residential' : 'commercial',
      }),
    ),
    roadGraph: {
      nodes: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 100, y: 0 },
        { id: 'c', x: 140, y: 0 },
        { id: 'd', x: 141, y: 0 },
      ],
      edges: [
        {
          id: 'ab',
          roadId: 'ab',
          from: 'a',
          to: 'b',
          lengthInMeters: 100,
          bidirectional: false,
        },
        {
          id: 'bc',
          roadId: 'bc',
          from: 'b',
          to: 'c',
          lengthInMeters: 40,
          bidirectional: false,
        },
      ],
    },
  };
}
const landmarks: CivicLandmarkModel = {
  assignments: [
    { buildingId: 'clinic', role: 'hospital' },
    { buildingId: 'museum', role: 'museum' },
  ],
};
const access = [
  { buildingId: 'home-a', nodeId: 'a' },
  { buildingId: 'home-b', nodeId: 'b' },
  { buildingId: 'home-d', nodeId: 'd' },
  { buildingId: 'clinic', nodeId: 'c' },
  { buildingId: 'museum', nodeId: 'a' },
];

describe('synthetic city services', () => {
  it('uses directed graph path distances, not proximity across disconnected components', () => {
    const city = fixture();
    const before = structuredClone(city);
    const result = generateCityServices(city, landmarks, access);
    expect(result.residentialBuildingCount).toBe(3);
    expect(result.accessSource).toBe('provided');
    expect(result.roles.find((r) => r.role === 'hospital')).toEqual({
      role: 'hospital',
      facilityCount: 1,
      reachableBuildingCount: 2,
      coverageRatio: 2 / 3,
      meanDistanceInMeters: 90,
    });
    expect(
      result.roles.find((r) => r.role === 'museum')?.reachableBuildingCount,
    ).toBe(1);
    expect(
      result.assignments.find(
        (a) => a.buildingId === 'home-d' && a.role === 'hospital',
      ),
    ).toEqual({
      buildingId: 'home-d',
      role: 'hospital',
      facilityBuildingId: null,
      distanceInMeters: null,
    });
    expect(city).toEqual(before);
  });

  it('reports missing facilities/access and absent graphs without fabricating coverage', () => {
    const city = fixture();
    const partial = generateCityServices(
      city,
      landmarks,
      access.filter((a) => a.buildingId !== 'home-a'),
    );
    expect(
      partial.roles.find((r) => r.role === 'hospital')?.reachableBuildingCount,
    ).toBe(1);
    expect(partial.roles.find((r) => r.role === 'school')).toEqual({
      role: 'school',
      facilityCount: 0,
      reachableBuildingCount: 0,
      coverageRatio: 0,
      meanDistanceInMeters: null,
    });
    delete city.roadGraph;
    const absent = generateCityServices(city, landmarks);
    expect(absent.accessSource).toBe('unavailable');
    expect(
      absent.roles.every((role) => role.reachableBuildingCount === 0),
    ).toBe(true);
  });

  it('derives reproducible synthetic access when no explicit map is supplied', () => {
    const city = fixture();
    const first = generateCityServices(city, landmarks);
    expect(first.accessSource).toBe('nearest-node');
    expect(
      generateCityServices(
        {
          ...city,
          buildings: [...city.buildings].reverse(),
          roadGraph: {
            nodes: [...(city.roadGraph?.nodes ?? [])].reverse(),
            edges: city.roadGraph?.edges ?? [],
          },
        },
        { assignments: [...landmarks.assignments].reverse() },
      ),
    ).toEqual(first);
    expect(
      first.roles.find((r) => r.role === 'hospital')?.reachableBuildingCount,
    ).toBeGreaterThan(0);
  });

  it('excludes repurposed civic buildings from residences and handles an empty city', () => {
    const city = fixture();
    const model: CivicLandmarkModel = {
      assignments: [{ buildingId: 'home-a', role: 'school' }],
    };
    expect(
      generateCityServices(city, model, access).residentialBuildingCount,
    ).toBe(2);
    city.buildings = [];
    const empty = generateCityServices(city, landmarks, access);
    expect(empty.residentialBuildingCount).toBe(0);
    expect(empty.assignments).toEqual([]);
    expect(
      empty.roles.every(
        (role) => role.coverageRatio === 0 && role.facilityCount === 0,
      ),
    ).toBe(true);
  });
});
