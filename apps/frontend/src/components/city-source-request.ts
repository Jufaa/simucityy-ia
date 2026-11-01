/** Shared with HTTP regression tests so the actual scene bootstrap is exercised. */
export function createExpandedCityRequest() {
  return {
    layout: 'district' as const,
    detailLevel: 'urban' as const,
    config: {
      widthInMeters: 1800,
      heightInMeters: 1500,
      // Keeps street-detail output and terrain sampling within their existing budgets.
      streetSpacingInMeters: 300,
      seed: 123,
    },
    terrain: { kind: 'flat' as const, elevationInMeters: 25 },
    terrainCellSizeInMeters: 25,
    populationCount: 300,
    minBuildingHeightInMeters: 4,
    maxBuildingHeightInMeters: 40,
  };
}
