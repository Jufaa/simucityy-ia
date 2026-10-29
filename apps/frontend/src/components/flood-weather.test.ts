import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createFloodWeather } from './flood-weather';

it('shows moving rain during a storm, freezes on pause and clears on reset', () => {
  const weather = createFloodWeather(
    { widthInMeters: 500, heightInMeters: 500 },
    25,
    40,
  );
  const rain = weather.group.getObjectByName(
    'flood-rain',
  ) as THREE.LineSegments;
  const positions = rain.geometry.getAttribute('position');
  const initial = Array.from(positions.array);
  expect(weather.group.visible).toBe(false);
  weather.animate(0.1, true, true);
  expect(weather.group.visible).toBe(true);
  expect(Array.from(positions.array)).not.toEqual(initial);
  for (let i = 0; i < positions.count; i += 2) {
    expect(positions.getY(i)).toBeGreaterThanOrEqual(25);
    expect(positions.getY(i)).toBeLessThanOrEqual(205);
    expect(positions.getY(i) - positions.getY(i + 1)).toBeCloseTo(6, 4);
  }
  const paused = Array.from(positions.array);
  weather.animate(1, true, false);
  expect(Array.from(positions.array)).toEqual(paused);
  weather.animate(0.1, true, true);
  expect(Array.from(positions.array)).not.toEqual(paused);
  weather.animate(0, false, false);
  expect(weather.group.visible).toBe(false);
  expect(Array.from(positions.array)).toEqual(initial);
  weather.dispose();
});
