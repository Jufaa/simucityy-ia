import type { Block, CityScenario } from './city.types';
import { DISTRICT_GENERATOR_VERSION } from './city.types';

export function districtIssues(s: CityScenario): string[] {
  const district = s.district;
  if (s.config.layout !== 'district')
    return district ? ['District data requires the district layout.'] : [];
  if (!district)
    return ['District layout requires parcel, park and sidewalk data.'];
  const issues: string[] = [];
  const fail = (condition: boolean, message: string) => {
    if (condition) issues.push(message);
  };
  fail(
    s.generatorVersion !== DISTRICT_GENERATOR_VERSION,
    'District generator version is unsupported.',
  );
  fail(
    district.roadWidthInMeters !== 6 || district.sidewalkWidthInMeters !== 2,
    'District road and sidewalk dimensions do not match this generator version.',
  );
  const blocks = new Map(s.blocks.map((block) => [block.id, block]));
  const inset = Math.max(
    s.config.buildingMarginInMeters,
    district.roadWidthInMeters / 2 + district.sidewalkWidthInMeters + 1,
  );
  fail(
    s.blocks.length < 4 || s.blocks.length > 625,
    'District requires 4 to 625 complete blocks.',
  );
  for (const block of s.blocks)
    fail(
      block.maxCorner.x - block.minCorner.x - 2 * inset < 10 ||
        block.maxCorner.y - block.minCorner.y - 2 * inset < 10,
      'District settings leave less than 10 metres of usable block interior.',
    );
  const parcels = new Map(
    district.parcels.map((parcel) => [parcel.id, parcel]),
  );
  const contains = (a: Block, b: Block) =>
    b.minCorner.x >= a.minCorner.x &&
    b.minCorner.y >= a.minCorner.y &&
    b.maxCorner.x <= a.maxCorner.x &&
    b.maxCorner.y <= a.maxCorner.y;
  const overlaps = (a: Block, b: Block) =>
    a.minCorner.x < b.maxCorner.x &&
    a.maxCorner.x > b.minCorner.x &&
    a.minCorner.y < b.maxCorner.y &&
    a.maxCorner.y > b.minCorner.y;
  for (const items of [district.parcels, district.parks, district.sidewalks]) {
    fail(
      new Set(items.map(({ id }) => id)).size !== items.length,
      'District collection contains duplicate IDs.',
    );
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!,
        block = blocks.get(item.blockId);
      fail(
        !block || !contains(block, item),
        'District geometry has an invalid block reference or bounds.',
      );
      for (let j = i + 1; j < items.length; j++)
        fail(
          overlaps(item, items[j]!),
          'District areas in the same collection overlap.',
        );
    }
  }
  fail(district.parks.length === 0, 'District requires at least one park.');
  const used = new Set<string>();
  for (const building of s.buildings) {
    const parcel = building.parcelId
      ? parcels.get(building.parcelId)
      : undefined;
    fail(
      !parcel ||
        parcel.kind === 'park' ||
        building.blockId !== parcel.blockId ||
        building.use !== parcel.kind ||
        !contains(parcel, building),
      'Building has an invalid parcel, use or containment.',
    );
    if (building.parcelId) {
      fail(
        used.has(building.parcelId),
        'A district parcel cannot contain multiple generated buildings.',
      );
      used.add(building.parcelId);
    }
    fail(
      district.parks.some((park) => overlaps(park, building)) ||
        district.sidewalks.some((sidewalk) => overlaps(sidewalk, building)),
      'Building overlaps a park or sidewalk.',
    );
  }
  for (const parcel of district.parcels) {
    fail(
      district.sidewalks.some((sidewalk) => overlaps(parcel, sidewalk)),
      'Parcel overlaps a sidewalk.',
    );
    fail(
      (parcel.kind !== 'park') !== used.has(parcel.id),
      'Parcel occupancy does not match its land use.',
    );
    if (parcel.kind === 'park')
      fail(
        !district.parks.some(
          (park) =>
            park.blockId === parcel.blockId &&
            contains(park, parcel) &&
            contains(parcel, park),
        ),
        'Park parcel has no matching park geometry.',
      );
  }
  for (const park of district.parks) {
    fail(
      district.sidewalks.some((sidewalk) => overlaps(park, sidewalk)),
      'Park overlaps a sidewalk.',
    );
    fail(
      !district.parcels.some(
        (parcel) =>
          parcel.kind === 'park' &&
          parcel.blockId === park.blockId &&
          contains(parcel, park) &&
          contains(park, parcel),
      ),
      'Park geometry has no matching parcel.',
    );
  }
  fail(
    district.sidewalks.length !== s.blocks.length * 4,
    'Each district block requires four sidewalk strips.',
  );
  for (const citizen of s.citizens)
    fail(
      s.buildings.find((building) => building.id === citizen.homeBuildingId)
        ?.use !== 'residential',
      'District citizen must live in a residential building.',
    );
  return issues;
}
