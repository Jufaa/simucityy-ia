import { generateCityScenario } from '../src/modules/cities/city-scenario-generator';
import { serializeCityScenario } from '../src/modules/cities/city-json';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write(
    'Usage: pnpm --filter @simulicity/api exec tsx scripts/export-city.ts [--district|--urban]\nWrites a deterministic 500 x 500 metre city JSON to stdout. --district includes parcels, parks and sidewalks; --urban adds architecture and furnishings. No network requests.\n',
  );
} else if (
  args.length > 0 &&
  !(args.length === 1 && (args[0] === '--district' || args[0] === '--urban'))
) {
  process.stderr.write('Unknown argument. Use --help for usage.\n');
  process.exitCode = 1;
} else {
  process.stdout.write(
    serializeCityScenario(
      generateCityScenario({
        ...(args[0] === '--district' || args[0] === '--urban'
          ? {
              layout: 'district' as const,
              minBuildingHeightInMeters: 4,
              maxBuildingHeightInMeters: 40,
            }
          : {}),
        ...(args[0] === '--urban' ? { detailLevel: 'urban' as const } : {}),
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
