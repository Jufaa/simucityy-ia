import type { CityResponse } from './city-types';
import type { CivicLandmarkModel } from './civic-landmarks';

export const civicRoles = [
  'hospital',
  'school',
  'police',
  'firestation',
  'municipal',
  'market',
  'museum',
] as const;
export type CivicRole = (typeof civicRoles)[number];

export interface ServiceBuildingAccess {
  readonly buildingId: string;
  readonly nodeId: string;
}
export interface ServiceAssignment {
  buildingId: string;
  role: CivicRole;
  facilityBuildingId: string | null;
  /** Road-network distance only, excluding unmodeled building entrances. */
  distanceInMeters: number | null;
}
export interface ServiceCoverage {
  role: CivicRole;
  facilityCount: number;
  reachableBuildingCount: number;
  /** Graph reachability, not capacity, response time or service quality. */
  coverageRatio: number;
  meanDistanceInMeters: number | null;
}
export interface CityServices {
  residentialBuildingCount: number;
  accessSource: 'provided' | 'nearest-node' | 'unavailable';
  roles: ServiceCoverage[];
  assignments: ServiceAssignment[];
}
interface Visit {
  nodeId: string;
  facilityId: string;
  distance: number;
}
const compare = (a: Visit, b: Visit) =>
  a.distance - b.distance ||
  a.facilityId.localeCompare(b.facilityId) ||
  a.nodeId.localeCompare(b.nodeId);

/** Small priority queue used once per regeneration, never in the frame loop. */
class VisitQueue {
  private items: Visit[] = [];
  push(value: Visit) {
    let index = this.items.length;
    this.items.push(value);
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const candidate = this.items[parent];
      if (!candidate || compare(candidate, value) <= 0) break;
      this.items[index] = candidate;
      index = parent;
    }
    this.items[index] = value;
  }
  pop(): Visit | undefined {
    const first = this.items[0];
    const last = this.items.pop();
    if (!last || !this.items.length) return first;
    let index = 0;
    while (index * 2 + 1 < this.items.length) {
      let child = index * 2 + 1;
      const left = this.items[child];
      const right = this.items[child + 1];
      if (right && left && compare(right, left) < 0) child++;
      const candidate = this.items[child];
      if (!candidate || compare(last, candidate) <= 0) break;
      this.items[index] = candidate;
      index = child;
    }
    this.items[index] = last;
    return first;
  }
}

/**
 * Synthetic baseline service access. This does not dispatch responders or change
 * hazard shelters. Inferred entrances snap to the nearest graph node; only real
 * graph paths connect those nodes. Compute once when city/landmarks change.
 */
export function generateCityServices(
  city: CityResponse,
  landmarks: CivicLandmarkModel,
  buildingAccess?: readonly ServiceBuildingAccess[],
): CityServices {
  const nodes = [...(city.roadGraph?.nodes ?? [])]
    .filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y))
    .sort((a, b) => a.id.localeCompare(b.id));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const buildings = [...city.buildings].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const buildingIds = new Set(buildings.map((building) => building.id));
  const facilities = landmarks.assignments.filter((item) =>
    buildingIds.has(item.buildingId),
  );
  const facilityIds = new Set(facilities.map((item) => item.buildingId));
  const homes = new Set(
    city.citizens?.map((citizen) => citizen.homeBuildingId),
  );
  const residences = buildings.filter(
    (building) =>
      !facilityIds.has(building.id) &&
      (building.use === 'residential' || homes.has(building.id)),
  );
  const access = new Map<string, string>();
  if (buildingAccess) {
    for (const item of buildingAccess)
      if (buildingIds.has(item.buildingId) && nodeIds.has(item.nodeId))
        access.set(item.buildingId, item.nodeId);
  } else {
    for (const building of buildings) {
      const x = (building.minCorner.x + building.maxCorner.x) / 2;
      const y = (building.minCorner.y + building.maxCorner.y) / 2;
      let nearest: string | undefined;
      let distance = Infinity;
      for (const node of nodes) {
        const candidate = Math.hypot(node.x - x, node.y - y);
        if (candidate < distance) {
          nearest = node.id;
          distance = candidate;
        }
      }
      if (nearest) access.set(building.id, nearest);
    }
  }
  // Reverse arcs let a multi-source search find home -> facility paths even on one-way streets.
  const reverse = new Map(
    nodes.map((node) => [node.id, [] as { nodeId: string; length: number }[]]),
  );
  for (const edge of city.roadGraph?.edges ?? []) {
    if (
      !nodeIds.has(edge.from) ||
      !nodeIds.has(edge.to) ||
      !Number.isFinite(edge.lengthInMeters) ||
      edge.lengthInMeters <= 0
    )
      continue;
    reverse
      .get(edge.to)
      ?.push({ nodeId: edge.from, length: edge.lengthInMeters });
    if (edge.bidirectional)
      reverse
        .get(edge.from)
        ?.push({ nodeId: edge.to, length: edge.lengthInMeters });
  }
  const assignments: ServiceAssignment[] = [];
  const roles = civicRoles.map((role): ServiceCoverage => {
    const roleFacilities = facilities.filter((item) => item.role === role);
    const best = new Map<string, Visit>();
    const queue = new VisitQueue();
    for (const facility of roleFacilities) {
      const nodeId = access.get(facility.buildingId);
      if (nodeId)
        queue.push({ nodeId, facilityId: facility.buildingId, distance: 0 });
    }
    let visit: Visit | undefined;
    while ((visit = queue.pop())) {
      const existing = best.get(visit.nodeId);
      if (existing && compare(existing, visit) <= 0) continue;
      best.set(visit.nodeId, visit);
      for (const arc of reverse.get(visit.nodeId) ?? []) {
        const next = {
          nodeId: arc.nodeId,
          facilityId: visit.facilityId,
          distance: visit.distance + arc.length,
        };
        const known = best.get(arc.nodeId);
        if (!known || compare(next, known) < 0) queue.push(next);
      }
    }
    let reachableBuildingCount = 0;
    let totalDistance = 0;
    for (const building of residences) {
      const nodeId = access.get(building.id);
      const nearest = nodeId ? best.get(nodeId) : undefined;
      assignments.push({
        buildingId: building.id,
        role,
        facilityBuildingId: nearest?.facilityId ?? null,
        distanceInMeters: nearest?.distance ?? null,
      });
      if (nearest) {
        reachableBuildingCount++;
        totalDistance += nearest.distance;
      }
    }
    return {
      role,
      facilityCount: roleFacilities.length,
      reachableBuildingCount,
      coverageRatio: residences.length
        ? reachableBuildingCount / residences.length
        : 0,
      meanDistanceInMeters: reachableBuildingCount
        ? totalDistance / reachableBuildingCount
        : null,
    };
  });
  return {
    residentialBuildingCount: residences.length,
    accessSource: nodes.length
      ? buildingAccess
        ? 'provided'
        : 'nearest-node'
      : 'unavailable',
    roles,
    assignments,
  };
}
