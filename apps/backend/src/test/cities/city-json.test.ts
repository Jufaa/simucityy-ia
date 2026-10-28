import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateCityScenario } from '../../modules/cities/city-scenario-generator';
import {
  parseCityScenario,
  regenerateCityScenario,
  serializeCityScenario,
} from '../../modules/cities/city-json';

const scenario = () =>
  generateCityScenario({
    config: {
      widthInMeters: 500,
      heightInMeters: 500,
      streetSpacingInMeters: 50,
      seed: 42,
    },
    terrain: { kind: 'flat', elevationInMeters: 0 },
  });

describe('city JSON boundary', () => {
  it('rejects whitespace IDs, unknown nested fields and unreproducible building margins without mutation', () => {
    const paddedId = scenario();
    paddedId.roads[0]!.id = ` ${paddedId.roads[0]!.id} `;
    const invalidMargin = scenario();
    invalidMargin.config.buildingMarginInMeters = 30;
    const unknownField = scenario();
    const unknownConfig = {
      ...unknownField,
      config: { ...unknownField.config, elevationUnit: 'feet' },
    };
    for (const invalid of [paddedId, invalidMargin, unknownConfig]) {
      const before = JSON.stringify(invalid);
      expect(() => parseCityScenario(before)).toThrow();
      expect(JSON.stringify(invalid)).toBe(before);
    }
  });
  it('exports, imports and regenerates the same 500m demo', () => {
    const original = scenario();
    const json = serializeCityScenario(original);
    const restored = parseCityScenario(json);
    expect(restored).toEqual(original);
    expect(regenerateCityScenario(restored)).toEqual(original);
    expect(serializeCityScenario(restored)).toBe(json);
    expect(original.buildings).toHaveLength(100);
    expect(original.roadGraph.nodes).toHaveLength(121);
    expect(original.roadGraph.edges).toHaveLength(220);
  });
  it('ships the actual reproducible fixture for the 3D consumer', () => {
    const json = readFileSync(
      new URL('../../../../../scenarios/demo-city.json', import.meta.url),
      'utf8',
    );
    expect(parseCityScenario(json)).toEqual(scenario());
  });
  it('exports JSON through the CLI and refuses unknown options', () => {
    const require = createRequire(
      new URL('../../../package.json', import.meta.url),
    );
    const cli = fileURLToPath(
      new URL('../../../scripts/export-city.ts', import.meta.url),
    );
    const run = (...args: string[]) =>
      spawnSync(process.execPath, [require.resolve('tsx/cli'), cli, ...args], {
        encoding: 'utf8',
        timeout: 10000,
        maxBuffer: 3 * 1024 * 1024,
      });
    const output = run();
    expect(output.status).toBe(0);
    expect(output.stderr).toBe('');
    expect(parseCityScenario(output.stdout)).toEqual(scenario());
    const help = run('--help');
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('Usage:');
    const district = run('--district');
    expect(district.status).toBe(0);
    expect(parseCityScenario(district.stdout).config.layout).toBe('district');
    const urban = run('--urban');
    expect(urban.status).toBe(0);
    expect(parseCityScenario(urban.stdout).config.detailLevel).toBe('urban');
    for (const args of [['--invalid'], ['--invalid', '--help']]) {
      const failure = run(...args);
      expect(failure.status).toBe(1);
      expect(failure.stdout).toBe('');
      expect(failure.stderr).toContain('Unknown argument');
    }
  });
  it('rejects invalid JSON, versions and oversized input', () => {
    expect(() => parseCityScenario('{')).toThrow();
    expect(() => parseCityScenario(' '.repeat(2 * 1024 * 1024 + 1))).toThrow();
    const invalid = { ...scenario(), schemaVersion: 999 };
    expect(() => serializeCityScenario(invalid)).toThrow();
  });
  it('does not mutate rejected input and never silently strips unknown top-level fields', () => {
    const invalid = { ...scenario(), extra: 'unsupported' };
    const before = JSON.stringify(invalid);
    expect(() => serializeCityScenario(invalid)).toThrow();
    expect(JSON.stringify(invalid)).toBe(before);
  });
});
