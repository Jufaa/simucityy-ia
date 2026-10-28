import { generateCity } from './city-generator';
import { generateBlocks } from './block-generator';
import { generateBuildings } from './building-generator';
import { getElevation } from './terrain';
import { generateRoadGraph, generateBuildingAccess } from './road-graph';
import { generateTerrainGrid } from './terrain-grid';
import { generateResidents, generateShelters } from './population-generator';
import { cityScenarioSchema } from './city.schema';
import { buildDistrictScenario } from './district-generator';
import { enrichUrbanDistrict } from './urban-details';
import { GENERATOR_VERSION } from './city.types';
import type {
  CityConfig,
  CityScenario,
  CityScenarioConfig,
  TerrainConfig,
} from './city.types';

interface GenerateCityScenarioOptions {
  detailLevel?: 'basic' | 'urban';
  layout?: 'grid' | 'district';
  config: CityConfig & Partial<CityScenarioConfig>;
  terrain: TerrainConfig;
  buildingMarginInMeters?: number;
  minBuildingHeightInMeters?: number;
  maxBuildingHeightInMeters?: number;
  terrainCellSizeInMeters?: number;
  populationCount?: number;
}
export function generateCityScenario({
  config,
  terrain,
  layout = config.layout,
  detailLevel = config.detailLevel,
  buildingMarginInMeters = config.buildingMarginInMeters ?? 5,
  minBuildingHeightInMeters = config.minBuildingHeightInMeters ?? 5,
  maxBuildingHeightInMeters = config.maxBuildingHeightInMeters ?? 15,
  terrainCellSizeInMeters = config.terrainCellSizeInMeters ?? 25,
  populationCount = config.populationCount ?? 200,
}: GenerateCityScenarioOptions): CityScenario {
  const effectiveConfig: CityScenarioConfig = {
    ...config,
    seed: config.seed ?? 1,
    buildingMarginInMeters,
    minBuildingHeightInMeters,
    maxBuildingHeightInMeters,
    terrainCellSizeInMeters,
    populationCount,
    ...(layout === undefined ? {} : { layout }),
    ...(detailLevel === undefined ? {} : { detailLevel }),
  };
  if (detailLevel === 'urban' && layout !== 'district')
    throw new RangeError('Urban detail requires the district layout.');

  if (
    !Number.isInteger(populationCount) ||
    populationCount < 0 ||
    populationCount > 300
  )
    throw new RangeError('Population must be an integer between 0 and 300.');
  const city = generateCity(effectiveConfig);
  const estimatedBlocks =
    Math.floor(config.widthInMeters / config.streetSpacingInMeters) *
    Math.floor(config.heightInMeters / config.streetSpacingInMeters);
  if (!Number.isSafeInteger(estimatedBlocks) || estimatedBlocks > 2500)
    throw new RangeError('Scenario exceeds the 2500 block limit.');
  const terrainGrid = generateTerrainGrid(
    effectiveConfig,
    terrain,
    terrainCellSizeInMeters,
  );
  const blocks = generateBlocks(effectiveConfig);

  const buildings = generateBuildings(
    blocks,
    effectiveConfig.buildingMarginInMeters,
    effectiveConfig.minBuildingHeightInMeters,
    effectiveConfig.maxBuildingHeightInMeters,
    effectiveConfig.seed,
  );

  const terrainElevation = getElevation(
    terrain,
    { x: 0, y: 0 },
    effectiveConfig,
  );

  const roadGraph = generateRoadGraph(city.roads);
  const buildingAccess = generateBuildingAccess(buildings, roadGraph);
  const shelters = generateShelters(roadGraph, populationCount);
  const citizens = generateResidents(
    buildings,
    buildingAccess,
    roadGraph,
    populationCount,
    effectiveConfig.seed,
  );

  const base = {
    schemaVersion: 1,
    generatorVersion: GENERATOR_VERSION,
    source: 'procedural',
    config: effectiveConfig,
    roads: city.roads,
    blocks,
    buildings,
    roadGraph,
    buildingAccess,
    terrainGrid,
    shelters,
    citizens,
    terrain: {
      ...terrain,
      elevationInMeters: terrainElevation,
    },
  } satisfies CityScenario;
  const generated = layout === 'district' ? buildDistrictScenario(base) : base;
  return cityScenarioSchema.parse(
    detailLevel === 'urban' ? enrichUrbanDistrict(generated) : generated,
  );
}
