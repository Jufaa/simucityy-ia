import type { EvacuationCitizenInput } from '@simulicity/hazards';
import type { CityResponse, Point } from './city-types';
import { bridgeAtPoint, sampleRoadSurfaceHeight } from './road-surface';
import { waterSurfaceAt } from './organic-city-model';

/** Visible idle placements only. IDs/home metadata stay available for a future behavior controller. */
export function createStaticPopulation(
  city: CityResponse,
): EvacuationCitizenInput[] {
  const nodes = new Map(city.roadGraph?.nodes.map((node) => [node.id, node]));
  const segments = (city.roadGraph?.edges ?? [])
    .flatMap((edge) => {
      const start = nodes.get(edge.from),
        end = nodes.get(edge.to);
      return start && end && Math.hypot(end.x - start.x, end.y - start.y) > 0
        ? [{ id: edge.id, start, end }]
        : [];
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const citizens = [...(city.citizens ?? [])].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  if (!segments.length)
    return citizens.map((citizen) => ({
      ...citizen,
      position: { ...citizen.position },
    }));
  const slots = Math.ceil(citizens.length / segments.length);
  const clear = (p: Point) =>
    p.x >= 0 &&
    p.y >= 0 &&
    p.x <= city.config.widthInMeters &&
    p.y <= city.config.heightInMeters &&
    (!city.organic ||
      bridgeAtPoint(city, p.x, p.y) !== undefined ||
      (waterSurfaceAt(city.organic, p) === undefined &&
        sampleRoadSurfaceHeight(city, p.x, p.y) > city.organic.lake.level)) &&
    !city.buildings.some(
      (b) =>
        p.x > b.minCorner.x - 1 &&
        p.x < b.maxCorner.x + 1 &&
        p.y > b.minCorner.y - 1 &&
        p.y < b.maxCorner.y + 1,
    );
  return citizens.map((citizen, index) => {
    const edge = segments[index % segments.length];
    if (!edge) return { ...citizen, position: { ...citizen.position } };
    const t = (Math.floor(index / segments.length) + 1) / (slots + 1);
    const dx = edge.end.x - edge.start.x,
      dy = edge.end.y - edge.start.y,
      length = Math.hypot(dx, dy);
    const center = { x: edge.start.x + dx * t, y: edge.start.y + dy * t };
    const side = index % 2 === 0 ? 1 : -1;
    const candidates = [side * 4, -side * 4, 0].map((offset) => ({
      x: center.x - (dy / length) * offset,
      y: center.y + (dx / length) * offset,
    }));
    const position = candidates.find(clear) ?? center;
    return {
      ...citizen,
      nodeId: t <= 0.5 ? edge.start.id : edge.end.id,
      position,
    };
  });
}
