import { describe, expect, it } from 'vitest';
import type { CityResponse } from './city-types';
import { CityTraffic } from './city-traffic-model';

const city: CityResponse = {
  config: {
    widthInMeters: 200,
    heightInMeters: 200,
    streetSpacingInMeters: 100,
    seed: 19,
  },
  terrain: { kind: 'flat', elevationInMeters: 12 },
  roads: [],
  blocks: [],
  buildings: [],
  roadGraph: {
    nodes: [
      { id: 'w', x: 0, y: 100 },
      { id: 'c', x: 100, y: 100 },
      { id: 'e', x: 200, y: 100 },
      { id: 'n', x: 100, y: 0 },
    ],
    edges: [
      {
        id: 'wc',
        roadId: 'west',
        from: 'w',
        to: 'c',
        lengthInMeters: 100,
        bidirectional: true,
      },
      {
        id: 'ce',
        roadId: 'east',
        from: 'c',
        to: 'e',
        lengthInMeters: 100,
        bidirectional: true,
      },
      {
        id: 'nc',
        roadId: 'north',
        from: 'n',
        to: 'c',
        lengthInMeters: 100,
        bidirectional: true,
      },
    ],
  },
};

describe('bounded synthetic urban traffic', () => {
  it('accelerates reproducibly without changing source or old snapshots', () => {
    const original = structuredClone(city);
    const a = new CityTraffic(city),
      b = new CityTraffic(city);
    const initial = a.vehicles;
    for (let i = 0; i < 180; i++) {
      a.advance(1 / 30);
      b.advance(1 / 30);
    }
    expect(a.vehicles).toEqual(b.vehicles);
    expect(
      a.vehicles.some((v, i) => v.x !== initial[i]?.x || v.z !== initial[i]?.z),
    ).toBe(true);
    expect(a.vehicles.some((v) => v.speedInMetersPerSecond > 0)).toBe(true);
    expect(city).toEqual(original);
    expect(initial.every((v) => v.speedInMetersPerSecond === 0)).toBe(true);
  });

  it('bounds population, pauses for zero/invalid delta and resets exactly', () => {
    const traffic = new CityTraffic(city, { maxVehicles: 1000 });
    const initial = traffic.vehicles;
    expect(initial.length).toBeLessThanOrEqual(40);
    expect(initial.length).toBeGreaterThan(0);
    for (const delta of [0, -1, NaN, Infinity]) traffic.advance(delta);
    expect(traffic.vehicles).toEqual(initial);
    traffic.advance(0.2);
    traffic.reset();
    expect(traffic.vehicles).toEqual(initial);
    expect(new CityTraffic(city, { maxVehicles: 0 }).vehicles).toEqual([]);
  });

  it('does not catch up an entire background-tab delay', () => {
    const traffic = new CityTraffic(city),
      bounded = new CityTraffic(city);
    traffic.advance(60);
    bounded.advance(0.25);
    expect(traffic.vehicles).toEqual(bounded.vehicles);
  });

  it('stops traffic on closed roads and never enters a closed next road', () => {
    const traffic = new CityTraffic(city);
    const initial = traffic.vehicles;
    for (let i = 0; i < 2000; i++)
      traffic.advance(1 / 30, new Set(['west', 'east']));
    for (const vehicle of traffic.vehicles) {
      const start = initial.find((v) => v.id === vehicle.id)!;
      if (start.roadId !== 'north') expect(vehicle).toEqual(start);
      else expect(vehicle.roadId).toBe('north');
    }
    const stopped = traffic.vehicles;
    traffic.advance(0.25, new Set(['west', 'east', 'north']));
    expect(
      traffic.vehicles.map(({ speedInMetersPerSecond: _, ...v }) => v),
    ).toEqual(stopped.map(({ speedInMetersPerSecond: _, ...v }) => v));
  });

  it('maintains lane spacing and exclusive intersection occupancy through repeated turns', () => {
    const traffic = new CityTraffic(city, { maxVehicles: 40 });
    const initialLanes = traffic.vehicles.map((vehicle) => vehicle.laneId);
    let changedRoute = false;
    for (let tick = 0; tick < 6000; tick++) {
      traffic.advance(1 / 30);
      const vehicles = traffic.vehicles;
      changedRoute ||= vehicles.some(
        (vehicle, index) => vehicle.laneId !== initialLanes[index],
      );
      for (const a of vehicles)
        for (const b of vehicles) {
          if (a.id === b.id || a.laneId !== b.laneId) continue;
          expect(
            Math.abs(a.distanceInMeters - b.distanceInMeters),
          ).toBeGreaterThanOrEqual(7.99);
        }
      const inJunction = vehicles.filter(
        (v) => Math.hypot(v.x - 100, v.z - 100) < 4.5,
      );
      expect(inJunction.length).toBeLessThanOrEqual(1);
      expect(
        vehicles.every(
          (v) =>
            Number.isFinite(v.x) &&
            v.speedInMetersPerSecond >= 0 &&
            v.speedInMetersPerSecond <= 8,
        ),
      ).toBe(true);
    }
    expect(changedRoute).toBe(true);
  });

  it('handles missing graph without inventing routes', () => {
    const withoutGraph = { ...city };
    delete withoutGraph.roadGraph;
    expect(new CityTraffic(withoutGraph).vehicles).toEqual([]);
  });
});
