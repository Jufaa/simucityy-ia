import { generateCityScenario } from '../src/modules/cities/city-scenario-generator';
import { serializeCityScenario } from '../src/modules/cities/city-json';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write(
    'Usage: pnpm --filter @simulicity/api exec tsx scripts/export-city.ts\nWrites the deterministic 500 x 500 metre demo JSON to stdout. No network requests.\n',
  );
} else if (args.length > 0) {
  process.stderr.write('Unknown argument. Use --help for usage.\n');
  process.exitCode = 1;
} else {
  process.stdout.write(
    serializeCityScenario(
      generateCityScenario({
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
