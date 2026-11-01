import { expect, it } from 'vitest';
import { pedestrianCameraPose } from './pedestrian-camera';
import { createOrganicCity } from './organic-city-model';
import type { CityResponse } from './city-types';

it('focuses actual pedestrian positions at bridge-deck height and never mutates the city', () => {
  const source: CityResponse = {
    config: {
      widthInMeters: 1200,
      heightInMeters: 1000,
      streetSpacingInMeters: 80,
    },
    terrain: { kind: 'flat', elevationInMeters: 25 },
    roads: [],
    blocks: [],
    buildings: [],
  };
  const city = createOrganicCity(source, 123, { expanded: true }).city;
  const bridge = city.organic?.bridges[0];
  expect(bridge).toBeDefined();
  if (!bridge) throw new Error('Missing test bridge');
  const point = {
    x: (bridge.start.x + bridge.end.x) / 2,
    y: (bridge.start.y + bridge.end.y) / 2,
  };
  const before = JSON.stringify(city);
  const pose = pedestrianCameraPose(city, [{ position: point }]);
  expect(pose.target[0]).toBe(point.x);
  expect(pose.target[2]).toBe(point.y);
  expect(pose.target[1]).toBeCloseTo(bridge.deckElevationInMeters + 1.35);
  expect(pose.position[1]).toBeGreaterThan(pose.target[1]);
  expect(JSON.stringify(city)).toBe(before);
});
