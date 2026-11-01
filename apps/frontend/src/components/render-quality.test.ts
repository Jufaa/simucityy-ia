import { expect, it } from 'vitest';
import { renderQualitySettings } from './render-quality';

it('bounds rendering cost without exceeding physical device resolution', () => {
  expect(renderQualitySettings('balanced', 3)).toEqual({
    pixelRatio: 1.5,
    shadows: true,
    shadowSize: 1024,
  });
  expect(renderQualitySettings('light', 2)).toEqual({
    pixelRatio: 1,
    shadows: false,
    shadowSize: 512,
  });
  expect(renderQualitySettings('high', 3)).toEqual({
    pixelRatio: 2,
    shadows: true,
    shadowSize: 2048,
  });
  expect(renderQualitySettings('high', 1).pixelRatio).toBe(1);
  expect(renderQualitySettings('balanced', Number.NaN).pixelRatio).toBe(1);
});
