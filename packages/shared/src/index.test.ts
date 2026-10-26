import { describe, expect, it } from 'vitest';
import {
  geographicSchema,
  localCoordinateSchema,
  demoScenario,
  scenarioSchema,
  buildingSchema,
  demoProvenance,
} from './index';
describe('shared contracts', () => {
  it('keeps coordinate systems distinct', () => {
    expect(
      localCoordinateSchema.safeParse({ crs: 'EPSG:4326', x: 1, y: 2, z: 0 })
        .success,
    ).toBe(false);
    expect(
      geographicSchema.safeParse({
        crs: 'EPSG:4326',
        longitude: 200,
        latitude: 0,
      }).success,
    ).toBe(false);
  });
  it('validates the explicitly synthetic scenario', () => {
    expect(scenarioSchema.parse(demoScenario).demo).toBe(true);
  });
  it('does not require invented height or occupancy', () => {
    const p = demoScenario.origin;
    expect(
      buildingSchema.parse({
        id: 'b',
        provenance: demoProvenance,
        footprint: [p, p, p, p],
        heightMeters: null,
        heightProvenance: null,
        occupancy: null,
        occupancyProvenance: null,
      }).heightMeters,
    ).toBeNull();
  });
});
