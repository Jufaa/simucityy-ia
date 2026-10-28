import type { Building, CityScenario, DistrictData, Point } from './city.types';
import { DISTRICT_GENERATOR_VERSION } from './city.types';
import { createRandom } from './utils/prng';
import { generateBuildingAccess } from './road-graph';
import { generateResidents } from './population-generator';

/** Deterministic subdivision; no meshes, network calls or simulation state. */
export function buildDistrictScenario(base: CityScenario): CityScenario {
  if (base.blocks.length < 4 || base.blocks.length > 625)
    throw new RangeError('District layout requires 4 to 625 complete blocks.');
  const district: DistrictData = {
    roadWidthInMeters: 6,
    sidewalkWidthInMeters: 2,
    parcels: [],
    parks: [],
    sidewalks: [],
  };
  const random = createRandom((base.config.seed ^ 0x64697374) >>> 0);
  const buildings: Building[] = [];
  const border =
    district.roadWidthInMeters / 2 + district.sidewalkWidthInMeters;
  const inset = Math.max(base.config.buildingMarginInMeters, border + 1);
  const centre = {
    x: base.config.widthInMeters / 2,
    y: base.config.heightInMeters / 2,
  };
  const centralBlock = base.blocks.reduce((best, block) => {
    const distance = (item: typeof block) =>
      Math.hypot(
        (item.minCorner.x + item.maxCorner.x) / 2 - centre.x,
        (item.minCorner.y + item.maxCorner.y) / 2 - centre.y,
      );
    return distance(block) < distance(best) ? block : best;
  });
  const residentialAnchor = base.blocks.find(
    (block) => block.id !== centralBlock.id,
  )!.id;

  for (const block of base.blocks) {
    const left = block.minCorner.x,
      bottom = block.minCorner.y;
    const right = block.maxCorner.x,
      top = block.maxCorner.y;
    const width = right - left,
      depth = top - bottom;
    if (width - 2 * inset < 10 || depth - 2 * inset < 10)
      throw new RangeError(
        'District blocks need room for setbacks and at least 10 metres of interior.',
      );
    const halfRoad = district.roadWidthInMeters / 2;
    const sidewalk = (suffix: string, minCorner: Point, maxCorner: Point) => {
      district.sidewalks.push({
        id: `sidewalk-${block.id}-${suffix}`,
        blockId: block.id,
        minCorner,
        maxCorner,
      });
    };
    sidewalk(
      'south',
      { x: left + halfRoad, y: bottom + halfRoad },
      { x: right - halfRoad, y: bottom + border },
    );
    sidewalk(
      'north',
      { x: left + halfRoad, y: top - border },
      { x: right - halfRoad, y: top - halfRoad },
    );
    sidewalk(
      'west',
      { x: left + halfRoad, y: bottom + border },
      { x: left + border, y: top - border },
    );
    sidewalk(
      'east',
      { x: right - border, y: bottom + border },
      { x: right - halfRoad, y: top - border },
    );

    const parkRoll = random();
    if (
      block.id === centralBlock.id ||
      (block.id !== residentialAnchor && parkRoll < 0.12)
    ) {
      const park = {
        id: `park-${block.id}`,
        blockId: block.id,
        minCorner: { x: left + inset, y: bottom + inset },
        maxCorner: { x: right - inset, y: top - inset },
      };
      district.parks.push(park);
      district.parcels.push({
        ...park,
        id: `parcel-${block.id}-park`,
        kind: 'park',
      });
      continue;
    }
    const parcelWidth = (width - inset * 2) / 2;
    const parcelDepth = (depth - inset * 2) / 2;
    for (let row = 0; row < 2; row++)
      for (let column = 0; column < 2; column++) {
        const use = row === 0 && column === 0 ? 'commercial' : 'residential';
        const id = `parcel-${block.id}-${column}-${row}`;
        const minCorner = {
          x: left + inset + column * parcelWidth,
          y: bottom + inset + row * parcelDepth,
        };
        const maxCorner = {
          x: minCorner.x + parcelWidth,
          y: minCorner.y + parcelDepth,
        };
        district.parcels.push({
          id,
          blockId: block.id,
          kind: use,
          minCorner,
          maxCorner,
        });
        const gapX = parcelWidth * (0.1 + random() * 0.12);
        const gapY = parcelDepth * (0.1 + random() * 0.12);
        const heightFactor =
          use === 'commercial' ? 0.55 + random() * 0.45 : random() * 0.55;
        const minHeight = base.config.minBuildingHeightInMeters,
          maxHeight = base.config.maxBuildingHeightInMeters;
        const heightInMeters = Math.min(
          maxHeight,
          Math.max(
            minHeight,
            Math.round(
              (minHeight + heightFactor * (maxHeight - minHeight)) * 10,
            ) / 10,
          ),
        );
        buildings.push({
          id: `building-${block.id}-${column}-${row}`,
          blockId: block.id,
          parcelId: id,
          use,
          minCorner: { x: minCorner.x + gapX, y: minCorner.y + gapY },
          maxCorner: { x: maxCorner.x - gapX, y: maxCorner.y - gapY },
          heightInMeters,
        });
      }
  }
  // Never let park selection remove all homes, even for the smallest supported district.
  if (!buildings.some((building) => building.use === 'residential'))
    throw new RangeError(
      'District layout has no residential parcels; choose another seed or a larger district.',
    );
  const buildingAccess = generateBuildingAccess(buildings, base.roadGraph);
  const citizens = generateResidents(
    buildings.filter((building) => building.use === 'residential'),
    buildingAccess,
    base.roadGraph,
    base.config.populationCount,
    base.config.seed,
  );
  return {
    ...base,
    generatorVersion: DISTRICT_GENERATOR_VERSION,
    config: { ...base.config, layout: 'district' },
    district,
    buildings,
    buildingAccess,
    citizens,
  };
}
