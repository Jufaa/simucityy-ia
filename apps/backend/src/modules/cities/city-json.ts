import { cityScenarioSchema } from './city.schema';
import { generateCityScenario } from './city-scenario-generator';
import { GENERATOR_VERSION, DISTRICT_GENERATOR_VERSION } from './city.types';
import type { CityScenario } from './city.types';

const MAX_JSON_BYTES = 2 * 1024 * 1024;

export function parseCityScenario(json: string): CityScenario {
  if (Buffer.byteLength(json, 'utf8') > MAX_JSON_BYTES)
    throw new RangeError('City JSON exceeds the 2 MiB limit.');
  return cityScenarioSchema.parse(JSON.parse(json));
}

export function serializeCityScenario(scenario: unknown): string {
  const json =
    JSON.stringify(cityScenarioSchema.parse(scenario), null, 2) + '\n';
  if (Buffer.byteLength(json, 'utf8') > MAX_JSON_BYTES)
    throw new RangeError('City JSON exceeds the 2 MiB limit.');
  return json;
}

export function regenerateCityScenario(input: unknown): CityScenario {
  const saved = cityScenarioSchema.parse(input);
  if (
    saved.generatorVersion !==
    (saved.config.layout === 'district'
      ? DISTRICT_GENERATOR_VERSION
      : GENERATOR_VERSION)
  )
    throw new RangeError(
      'This generator cannot reproduce the saved generator version.',
    );
  return generateCityScenario({ config: saved.config, terrain: saved.terrain });
}
