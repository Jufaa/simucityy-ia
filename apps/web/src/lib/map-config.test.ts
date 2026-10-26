import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMapConfig } from './map-config';

afterEach(() => vi.unstubAllEnvs());
describe('map configuration', () => {
  it('uses a configurable geographic starting location', () => {
    vi.stubEnv('NEXT_PUBLIC_INITIAL_LONGITUDE', '-73.9');
    vi.stubEnv('NEXT_PUBLIC_INITIAL_LATITUDE', '40.7');
    expect(getMapConfig()).toMatchObject({ longitude: -73.9, latitude: 40.7 });
  });
  it('rejects invalid geographic coordinates', () => {
    vi.stubEnv('NEXT_PUBLIC_INITIAL_LATITUDE', '99');
    expect(() => getMapConfig()).toThrow();
  });
  it('rejects non-HTTPS tile configuration', () => {
    vi.stubEnv('NEXT_PUBLIC_MAP_STYLE_URL', 'http://example.com/style.json');
    expect(() => getMapConfig()).toThrow();
  });
});
