import { generateCityScenario } from '../src/modules/cities/city-scenario-generator';
import { serializeCityScenario } from '../src/modules/cities/city-json';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write(
    'Usage: pnpm --filter @simulicity/api exec tsx scripts/export-city.ts [--district]\nWrites a deterministic 500 x 500 metre city JSON to stdout. --district includes parcels, parks and sidewalks. No network requests.\n',
  );
} else if (
  args.length > 0 &&
  !(args.length === 1 && args[0] === '--district')
) {
  process.stderr.write('Unknown argument. Use --help for usage.\n');
  process.exitCode = 1;
} else {
  process.stdout.write(
    serializeCityScenario(
      generateCityScenario({
        ...(args[0] === '--district'
          ? {
              layout: 'district' as const,
              minBuildingHeightInMeters: 4,
              maxBuildingHeightInMeters: 40,
            }
          : {}),
        config: {
          widthInMeters: 500,
          heightInMeters: 500,
          streetSpacingInMeters: 50,
          seed: 42,
        },
        terrain: { kind: 'flat', elevationInMeters: 0 },
        populationCount: 200,
        terrainCellSizeInMeters: 25,
      }),
    ),
  );
}
