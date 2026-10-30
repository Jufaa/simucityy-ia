import { expect, it } from 'vitest';
import { FrameMetrics } from './frame-metrics';

it('publishes measured rates at most once per second and keeps latest render counts', () => {
  const monitor = new FrameMetrics();
  expect(monitor.sample(0, 2, 10, 100)).toBeNull();
  for (let time = 20; time < 1000; time += 20)
    expect(monitor.sample(time, 2, 10, 100)).toBeNull();
  expect(monitor.sample(1000, 4, 12, 120)).toEqual({
    fps: 50,
    frameMilliseconds: 20,
    renderMilliseconds: 102 / 50,
    drawCalls: 12,
    triangles: 120,
  });
});

it('discards hidden-tab gaps and restarts measurement without invented samples', () => {
  const monitor = new FrameMetrics();
  monitor.sample(0, 1, 1, 1);
  monitor.sample(100, 1, 1, 1);
  monitor.reset();
  expect(monitor.sample(10000, 1, 1, 1)).toBeNull();
  expect(monitor.sample(11000, 3, 5, 20)).toMatchObject({
    fps: 1,
    frameMilliseconds: 1000,
    renderMilliseconds: 3,
  });
});
