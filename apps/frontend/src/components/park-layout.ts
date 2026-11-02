import type { Block, CityResponse } from './city-types';

type UrbanLayout = NonNullable<NonNullable<CityResponse['district']>['urban']>;

/** Pure local layout consumed by the existing instanced, terrain-draped renderer. */
export function createParkLayout(
  park: Block,
  civic: boolean,
): Pick<UrbanLayout, 'parkPaths' | 'amenities'> {
  const x = (park.minCorner.x + park.maxCorner.x) / 2;
  const y = (park.minCorner.y + park.maxCorner.y) / 2;
  const hx = (park.maxCorner.x - park.minCorner.x) / 2;
  const hy = (park.maxCorner.y - park.minCorner.y) / 2;
  const scale = Math.min(hx / 16, hy / 14);
  const parkPaths: UrbanLayout['parkPaths'] = [];
  const amenities: UrbanLayout['amenities'] = [];
  const surface = (
    kind: 'path' | 'plaza' | 'entrance',
    dx: number,
    dy: number,
    sx: number,
    sy: number,
  ) => {
    parkPaths.push({
      id: `${park.id}-${kind}-${parkPaths.length}`,
      parkId: park.id,
      kind,
      minCorner: { x: x + dx - sx / 2, y: y + dy - sy / 2 },
      maxCorner: { x: x + dx + sx / 2, y: y + dy + sy / 2 },
    });
  };
  const amenity = (
    kind: UrbanLayout['amenities'][number]['kind'],
    dx: number,
    dy: number,
    radius: number,
    rotation = 0,
  ) => {
    amenities.push({
      id: `${park.id}-${kind}-${amenities.length}`,
      parkId: park.id,
      kind,
      position: { x: x + dx, y: y + dy },
      radiusInMeters: radius,
      rotation,
    });
  };
  surface('path', 0, 0, 1.6 * scale, hy * 2);
  surface('entrance', 0, -hy + scale, 3 * scale, 2 * scale);
  if (civic) {
    surface('path', 0, 0, hx * 2, 1.6 * scale);
    surface('plaza', 0, 0, 10 * scale, 8 * scale);
    amenity('fountain', 0, 0, 2 * scale);
  }
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      amenity('tree', side * hx * 0.73, end * hy * 0.73, 1.7 * scale);
    }
    // Benches render at a fixed 1.6 m length, unlike scaled tree crowns.
    amenity('bench', side * hx * 0.55, hy * 0.35, 0.85);
    amenity('lamp', side * hx * 0.38, -hy * 0.6, 0.32);
  }
  return { parkPaths, amenities };
}
