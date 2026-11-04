import type { Block, CityScenario } from './city.types';

export function urbanIssues(s: CityScenario): string[] {
  const urban = s.district?.urban;
  if (s.config.detailLevel !== 'urban')
    return urban || s.buildings.some((building) => building.architecture)
      ? ['Urban data requires the urban detail profile.']
      : [];
  if (s.config.layout !== 'district' || !urban || !s.district)
    return ['Urban detail requires a district and complete detail data.'];
  const issues: string[] = [];
  const fail = (condition: boolean, message: string) => {
    if (condition) issues.push(message);
  };
  fail(s.blocks.length > 200, 'Urban detail supports at most 200 blocks.');
  const contains = (outer: Block, inner: Block) =>
    inner.minCorner.x >= outer.minCorner.x &&
    inner.minCorner.y >= outer.minCorner.y &&
    inner.maxCorner.x <= outer.maxCorner.x &&
    inner.maxCorner.y <= outer.maxCorner.y;
  const parks = new Map(s.district.parks.map((park) => [park.id, park]));
  const blocks = new Map(s.blocks.map((block) => [block.id, block]));
  for (const items of [
    urban.parkPaths,
    urban.amenities,
    urban.streetDetails,
    urban.yards,
  ])
    fail(
      new Set(items.map(({ id }) => id)).size !== items.length,
      'Urban collection contains duplicate IDs.',
    );
  for (const yard of urban.yards) {
    const building = s.buildings.find(({ id }) => id === yard.buildingId);
    const parcel = s.district.parcels.find(
      ({ id }) => id === building?.parcelId,
    );
    fail(
      !building ||
        building.architecture?.style !== 'house' ||
        !parcel ||
        !contains(parcel, yard),
      'Yard requires a house and bounds inside its parcel.',
    );
    for (const other of s.buildings)
      fail(
        yard.minCorner.x < other.maxCorner.x &&
          yard.maxCorner.x > other.minCorner.x &&
          yard.minCorner.y < other.maxCorner.y &&
          yard.maxCorner.y > other.minCorner.y,
        'Yard intersects a building.',
      );
  }
  fail(
    new Set(urban.yards.map(({ buildingId }) => buildingId)).size !==
      urban.yards.length ||
      urban.yards.length !==
        s.buildings.filter(
          (building) => building.architecture?.style === 'house',
        ).length,
    'Each house requires one yard.',
  );
  for (const building of s.buildings) {
    const a = building.architecture;
    if (!a) {
      issues.push('Urban building requires architecture metadata.');
      continue;
    }
    fail(
      (building.use === 'commercial') !== (a.style === 'shop'),
      'Building style does not match its land use.',
    );
    fail(
      a.roof !== (a.style === 'house' ? 'gable' : 'flat') ||
        a.roofRiseInMeters >= building.heightInMeters ||
        (a.roof === 'flat' && a.roofRiseInMeters !== 0) ||
        (a.roof === 'gable' && a.roofRiseInMeters <= 0),
      'Roof metadata does not match total building height/style.',
    );
    fail(
      a.balconyDepthInMeters >= building.maxCorner.y - building.minCorner.y ||
        (a.style !== 'apartment' && a.balconyDepthInMeters !== 0),
      'Balcony dimensions do not fit the building footprint.',
    );
    fail(
      a.floors !==
        Math.max(
          1,
          Math.floor((building.heightInMeters - a.roofRiseInMeters) / 3),
        ),
      'Floor count is inconsistent with the declared wall height.',
    );
  }
  for (const path of urban.parkPaths) {
    const park = parks.get(path.parkId);
    const owner = park && blocks.get(park.blockId);
    fail(
      !park ||
        !owner ||
        !contains(path.kind === 'entrance' ? owner : park, path),
      'Park path has an invalid park reference or bounds.',
    );
  }
  for (const item of urban.amenities) {
    const park = parks.get(item.parkId);
    const footprint = {
      id: item.id,
      minCorner: {
        x: item.position.x - item.radiusInMeters,
        y: item.position.y - item.radiusInMeters,
      },
      maxCorner: {
        x: item.position.x + item.radiusInMeters,
        y: item.position.y + item.radiusInMeters,
      },
    };
    fail(
      !park || !contains(park, footprint),
      'Park amenity is outside its park.',
    );
    if (item.kind === 'tree')
      for (const path of urban.parkPaths.filter(
        (p) => p.parkId === item.parkId,
      ))
        fail(
          footprint.minCorner.x < path.maxCorner.x &&
            footprint.maxCorner.x > path.minCorner.x &&
            footprint.minCorner.y < path.maxCorner.y &&
            footprint.maxCorner.y > path.minCorner.y,
          'Tree canopy obstructs a park path.',
        );
  }
  const cityBounds: Block = {
    id: 'bounds',
    minCorner: { x: 0, y: 0 },
    maxCorner: { x: s.config.widthInMeters, y: s.config.heightInMeters },
  };
  const access = new Set<string>();
  for (const item of urban.streetDetails) {
    fail(!contains(cityBounds, item), 'Street detail is outside the city.');
    const sourceExists =
      item.kind === 'curb'
        ? s.district.sidewalks.some(({ id }) => id === item.sourceId)
        : item.kind === 'building-access'
          ? s.buildings.some(({ id }) => id === item.sourceId)
          : s.roads.some(({ id }) => id === item.sourceId);
    fail(!sourceExists, 'Street detail has an invalid source reference.');
    if (item.kind === 'curb') {
      const sidewalk = s.district.sidewalks.find(
        ({ id }) => id === item.sourceId,
      );
      fail(
        !sidewalk || !contains(sidewalk, item),
        'Curb is outside its referenced sidewalk.',
      );
    }
    if (item.kind === 'crosswalk' || item.kind === 'lane-marking') {
      const road = s.roads.find(({ id }) => id === item.sourceId);
      if (road) {
        const horizontal = road.start.y === road.end.y;
        const corridor: Block = {
          id: road.id,
          minCorner: horizontal
            ? { x: road.start.x, y: road.start.y - 3 }
            : { x: road.start.x - 3, y: road.start.y },
          maxCorner: horizontal
            ? { x: road.end.x, y: road.end.y + 3 }
            : { x: road.end.x + 3, y: road.end.y },
        };
        fail(
          !contains(corridor, item),
          'Road marking is outside its referenced road corridor.',
        );
      }
    }
    if (item.kind === 'building-access') {
      const building = s.buildings.find(({ id }) => id === item.sourceId);
      const block = building && blocks.get(building.blockId!);
      if (building?.architecture && block) {
        const side = building.architecture.entranceSide;
        const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;
        const cx = (building.minCorner.x + building.maxCorner.x) / 2,
          cy = (building.minCorner.y + building.maxCorner.y) / 2;
        const aligned =
          side === 'south'
            ? close(item.maxCorner.y, building.minCorner.y) &&
              close(item.minCorner.y, block.minCorner.y + 5) &&
              close((item.minCorner.x + item.maxCorner.x) / 2, cx)
            : side === 'north'
              ? close(item.minCorner.y, building.maxCorner.y) &&
                close(item.maxCorner.y, block.maxCorner.y - 5) &&
                close((item.minCorner.x + item.maxCorner.x) / 2, cx)
              : side === 'west'
                ? close(item.maxCorner.x, building.minCorner.x) &&
                  close(item.minCorner.x, block.minCorner.x + 5) &&
                  close((item.minCorner.y + item.maxCorner.y) / 2, cy)
                : close(item.minCorner.x, building.maxCorner.x) &&
                  close(item.maxCorner.x, block.maxCorner.x - 5) &&
                  close((item.minCorner.y + item.maxCorner.y) / 2, cy);
        fail(
          !aligned,
          'Access path must connect its building entrance to the sidewalk.',
        );
      }
    }
    if (item.kind === 'building-access') {
      fail(access.has(item.sourceId), 'Building access path is duplicated.');
      access.add(item.sourceId);
    }
    for (const building of s.buildings)
      fail(
        item.minCorner.x < building.maxCorner.x &&
          item.maxCorner.x > building.minCorner.x &&
          item.minCorner.y < building.maxCorner.y &&
          item.maxCorner.y > building.minCorner.y,
        'Street detail intersects a building.',
      );
  }
  fail(
    access.size !== s.buildings.length,
    'Urban buildings require one visible access path each.',
  );
  return issues;
}
