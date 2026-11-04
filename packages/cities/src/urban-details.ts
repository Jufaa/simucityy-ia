import type {
  Building,
  BuildingArchitecture,
  CityScenario,
  UrbanDetails,
} from './city.types';
import { URBAN_GENERATOR_VERSION } from './city.types';
import { createRandom } from './utils/prng';

export function enrichUrbanDistrict(city: CityScenario): CityScenario {
  if (!city.district || city.blocks.length > 200)
    throw new RangeError(
      'Urban details require a district with at most 200 blocks.',
    );
  const random = createRandom((city.config.seed ^ 0x75726261) >>> 0);
  const blocks = new Map(city.blocks.map((block) => [block.id, block]));
  const urban: UrbanDetails = {
    parkPaths: [],
    amenities: [],
    streetDetails: [],
    yards: [],
  };
  const details = urban.streetDetails;
  const rect = (x1: number, y1: number, x2: number, y2: number) => ({
    minCorner: { x: Math.max(0, x1), y: Math.max(0, y1) },
    maxCorner: {
      x: Math.min(city.config.widthInMeters, x2),
      y: Math.min(city.config.heightInMeters, y2),
    },
  });
  const buildings: Building[] = city.buildings.map((building) => {
    const style =
      building.use === 'commercial'
        ? 'shop'
        : random() < 0.5
          ? 'house'
          : 'apartment';
    const target =
      style === 'shop'
        ? 5 + random() * 4
        : style === 'house'
          ? 6 + random() * 3
          : 12 + random() * 28;
    const heightInMeters = Math.max(
      city.config.minBuildingHeightInMeters,
      Math.min(
        city.config.maxBuildingHeightInMeters,
        Math.round(target * 10) / 10,
      ),
    );
    const block = blocks.get(building.blockId!)!;
    const sides: [BuildingArchitecture['entranceSide'], number][] = [
      ['south', building.minCorner.y - block.minCorner.y],
      ['north', block.maxCorner.y - building.maxCorner.y],
      ['west', building.minCorner.x - block.minCorner.x],
      ['east', block.maxCorner.x - building.maxCorner.x],
    ];
    sides.sort((a, b) => a[1] - b[1]);
    const entranceSide = sides[0]![0];
    const roofRiseInMeters =
      style === 'house' ? Math.min(2, heightInMeters * 0.18) : 0;
    const architecture: BuildingArchitecture = {
      style,
      roof: style === 'house' ? 'gable' : 'flat',
      roofRiseInMeters,
      floors: Math.max(1, Math.floor((heightInMeters - roofRiseInMeters) / 3)),
      facade: (['sand', 'brick', 'stone'] as const)[Math.floor(random() * 3)]!,
      entranceSide,
      balconyDepthInMeters:
        style === 'apartment'
          ? Math.min(0.8, (building.maxCorner.y - building.minCorner.y) * 0.08)
          : 0,
    };
    const x = (building.minCorner.x + building.maxCorner.x) / 2,
      y = (building.minCorner.y + building.maxCorner.y) / 2;
    const bounds =
      entranceSide === 'south'
        ? rect(x - 0.6, block.minCorner.y + 5, x + 0.6, building.minCorner.y)
        : entranceSide === 'north'
          ? rect(x - 0.6, building.maxCorner.y, x + 0.6, block.maxCorner.y - 5)
          : entranceSide === 'west'
            ? rect(
                block.minCorner.x + 5,
                y - 0.6,
                building.minCorner.x,
                y + 0.6,
              )
            : rect(
                building.maxCorner.x,
                y - 0.6,
                block.maxCorner.x - 5,
                y + 0.6,
              );
    details.push({
      id: `access-${building.id}`,
      sourceId: building.id,
      kind: 'building-access',
      ...bounds,
    });
    if (style === 'house') {
      const parcel = city.district!.parcels.find(
        (item) => item.id === building.parcelId,
      )!;
      const yard =
        entranceSide === 'south'
          ? rect(
              building.minCorner.x,
              building.maxCorner.y + 0.1,
              building.maxCorner.x,
              parcel.maxCorner.y - 0.1,
            )
          : entranceSide === 'north'
            ? rect(
                building.minCorner.x,
                parcel.minCorner.y + 0.1,
                building.maxCorner.x,
                building.minCorner.y - 0.1,
              )
            : entranceSide === 'west'
              ? rect(
                  building.maxCorner.x + 0.1,
                  building.minCorner.y,
                  parcel.maxCorner.x - 0.1,
                  building.maxCorner.y,
                )
              : rect(
                  parcel.minCorner.x + 0.1,
                  building.minCorner.y,
                  building.minCorner.x - 0.1,
                  building.maxCorner.y,
                );
      urban.yards.push({
        id: `yard-${building.id}`,
        buildingId: building.id,
        ...yard,
      });
    }
    return { ...building, heightInMeters, architecture };
  });
  for (const park of city.district.parks) {
    const block = blocks.get(park.blockId)!;
    const x = (park.minCorner.x + park.maxCorner.x) / 2,
      y = (park.minCorner.y + park.maxCorner.y) / 2;
    const w = park.maxCorner.x - park.minCorner.x,
      d = park.maxCorner.y - park.minCorner.y;
    const path = (
      suffix: string,
      kind: 'path' | 'plaza' | 'entrance',
      x1: number,
      y1: number,
      x2: number,
      y2: number,
    ) =>
      urban.parkPaths.push({
        id: `${park.id}-${suffix}`,
        parkId: park.id,
        kind,
        ...rect(x1, y1, x2, y2),
      });
    path('plaza', 'plaza', x - 2, y - 2, x + 2, y + 2);
    path('west', 'path', park.minCorner.x, y - 1, x - 2, y + 1);
    path('east', 'path', x + 2, y - 1, park.maxCorner.x, y + 1);
    path('south', 'path', x - 1, park.minCorner.y, x + 1, y - 2);
    path('north', 'path', x - 1, y + 2, x + 1, park.maxCorner.y);
    path(
      'entry-west',
      'entrance',
      block.minCorner.x + 5,
      y - 1,
      park.minCorner.x,
      y + 1,
    );
    path(
      'entry-east',
      'entrance',
      park.maxCorner.x,
      y - 1,
      block.maxCorner.x - 5,
      y + 1,
    );
    path(
      'entry-south',
      'entrance',
      x - 1,
      block.minCorner.y + 5,
      x + 1,
      park.minCorner.y,
    );
    path(
      'entry-north',
      'entrance',
      x - 1,
      park.maxCorner.y,
      x + 1,
      block.maxCorner.y - 5,
    );
    const amenity = (
      suffix: string,
      kind: 'tree' | 'bench' | 'lamp' | 'fountain',
      px: number,
      py: number,
      radius: number,
      rotation = 0,
    ) =>
      urban.amenities.push({
        id: `${park.id}-${suffix}`,
        parkId: park.id,
        kind,
        position: { x: px, y: py },
        rotation,
        radiusInMeters: radius,
      });
    for (const [index, [sx, sy]] of (
      [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const
    ).entries())
      amenity(
        `tree-${index}`,
        'tree',
        x + sx * w * 0.3,
        y + sy * d * 0.3,
        Math.min(1.5, w * 0.1, d * 0.1),
      );
    amenity('bench-west', 'bench', x - w * 0.25, y - 3, 0.9);
    amenity('bench-east', 'bench', x + w * 0.25, y + 3, 0.9, Math.PI);
    amenity('lamp-west', 'lamp', x - w * 0.3, y + d * 0.15, 0.2);
    amenity('lamp-east', 'lamp', x + w * 0.3, y - d * 0.15, 0.2);
    amenity('fountain', 'fountain', x, y, 1.1);
  }
  for (const sidewalk of city.district.sidewalks) {
    const block = blocks.get(sidewalk.blockId)!;
    const horizontal =
      sidewalk.maxCorner.x - sidewalk.minCorner.x >
      sidewalk.maxCorner.y - sidewalk.minCorner.y;
    const southOrWest = horizontal
      ? sidewalk.minCorner.y < (block.minCorner.y + block.maxCorner.y) / 2
      : sidewalk.minCorner.x < (block.minCorner.x + block.maxCorner.x) / 2;
    const x = southOrWest ? sidewalk.minCorner.x : sidewalk.maxCorner.x - 0.18;
    const y = southOrWest ? sidewalk.minCorner.y : sidewalk.maxCorner.y - 0.18;
    details.push({
      id: `curb-${sidewalk.id}`,
      sourceId: sidewalk.id,
      kind: 'curb',
      ...(horizontal
        ? rect(sidewalk.minCorner.x, y, sidewalk.maxCorner.x, y + 0.18)
        : rect(x, sidewalk.minCorner.y, x + 0.18, sidewalk.maxCorner.y)),
    });
  }
  for (const road of city.roads) {
    const horizontal = road.start.y === road.end.y;
    const coordinate = horizontal ? road.start.y : road.start.x;
    if (
      coordinate === 0 ||
      coordinate ===
        (horizontal ? city.config.heightInMeters : city.config.widthInMeters)
    )
      continue;
    const nodes = city.roadGraph.nodes.filter((node) =>
      horizontal ? node.y === coordinate : node.x === coordinate,
    );
    const length = horizontal ? road.end.x : road.end.y;
    const onRoad = (a: number, b: number, halfWidth: number) =>
      horizontal
        ? rect(a, coordinate - halfWidth, b, coordinate + halfWidth)
        : rect(coordinate - halfWidth, a, coordinate + halfWidth, b);
    for (let offset = 8; offset + 3 < length - 8; offset += 7) {
      if (
        nodes.some(
          (node) =>
            Math.abs((horizontal ? node.x : node.y) - (offset + 1.5)) < 9,
        )
      )
        continue;
      details.push({
        id: `mark-${road.id}-${offset}`,
        sourceId: road.id,
        kind: 'lane-marking',
        ...onRoad(offset, offset + 3, 0.07),
      });
    }
    for (const node of nodes) {
      const start = (horizontal ? node.x : node.y) + 4;
      if (start < 8 || start + 4 >= length) continue;
      for (let stripe = 0; stripe < 5; stripe++)
        details.push({
          id: `crosswalk-${road.id}-${node.id}-${stripe}`,
          sourceId: road.id,
          kind: 'crosswalk',
          ...onRoad(start + stripe * 0.8, start + stripe * 0.8 + 0.4, 2.7),
        });
    }
  }
  return {
    ...city,
    generatorVersion: URBAN_GENERATOR_VERSION,
    buildings,
    district: { ...city.district, urban },
    config: { ...city.config, detailLevel: 'urban' },
  };
}
