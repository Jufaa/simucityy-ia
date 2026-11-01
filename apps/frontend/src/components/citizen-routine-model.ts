import type { WaitingCitizenLocation } from '@simulicity/hazards';
import type { CivicLandmarkModel } from './civic-landmarks';
import type { CityResponse, Point } from './city-types';

type Activity = 'home' | 'work' | 'school' | 'museum' | 'park' | 'walking';
type Arc = { id: string; from: string; to: string; length: number };
type Destination = {
  nodeId: string;
  buildingId: string | null;
  activity: Activity;
};
interface Walker {
  id: string;
  mobility: number;
  active: boolean;
  nodeId: string;
  position: Point;
  itinerary: Destination[];
  destination: number;
  occupiedBuildingId: string | null;
  activity: Activity;
  walking: boolean;
  dwell: number;
  edge: Arc | null;
  progress: number;
}
const hash = (text: string) => {
  let value = 2166136261;
  for (const character of text)
    value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
};

/** Synthetic daily visits on the road graph; no capacity, entrances or crowd physics. */
export class CitizenRoutineModel {
  private readonly nodes: Map<string, Point>;
  private readonly adjacency = new Map<string, Arc[]>();
  private readonly walkers: Walker[];
  private readonly routes = new Map<string, Arc[] | null>();
  private elapsed = 0;
  private closureKey = '';

  constructor(
    city: CityResponse,
    facilities: CivicLandmarkModel['assignments'] = [],
    maxActive = 96,
  ) {
    this.nodes = new Map(
      city.roadGraph?.nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
    );
    for (const edge of city.roadGraph?.edges ?? []) {
      if (
        !this.nodes.has(edge.from) ||
        !this.nodes.has(edge.to) ||
        edge.lengthInMeters <= 0
      )
        continue;
      const arc = {
        id: edge.id,
        from: edge.from,
        to: edge.to,
        length: edge.lengthInMeters,
      };
      for (const directed of edge.bidirectional
        ? [arc, { ...arc, from: arc.to, to: arc.from }]
        : [arc]) {
        const outgoing = this.adjacency.get(directed.from) ?? [];
        outgoing.push(directed);
        this.adjacency.set(directed.from, outgoing);
      }
    }
    for (const outgoing of this.adjacency.values())
      outgoing.sort(
        (a, b) => a.id.localeCompare(b.id) || a.to.localeCompare(b.to),
      );
    const nearest = (point: Point) =>
      [...this.nodes].reduce<string | undefined>((best, [id, node]) => {
        const previous = best ? this.nodes.get(best) : undefined;
        return !previous ||
          Math.hypot(node.x - point.x, node.y - point.y) <
            Math.hypot(previous.x - point.x, previous.y - point.y)
          ? id
          : best;
      }, undefined);
    const targets = new Map<string, Destination>();
    for (const building of city.buildings) {
      const nodeId = nearest({
        x: (building.minCorner.x + building.maxCorner.x) / 2,
        y: (building.minCorner.y + building.maxCorner.y) / 2,
      });
      if (!nodeId) continue;
      const role = facilities.find(
        (item) => item.buildingId === building.id,
      )?.role;
      targets.set(building.id, {
        nodeId,
        buildingId: building.id,
        activity:
          role === 'school' || role === 'museum'
            ? role
            : building.use === 'commercial'
              ? 'work'
              : 'home',
      });
    }
    const parks: Destination[] = (city.district?.parks ?? []).flatMap(
      (park) => {
        const nodeId = nearest({
          x: (park.minCorner.x + park.maxCorner.x) / 2,
          y: (park.minCorner.y + park.maxCorner.y) / 2,
        });
        return nodeId
          ? [{ nodeId, buildingId: null, activity: 'park' as const }]
          : [];
      },
    );
    const work = [...targets.values()].filter(
      (target) => target.activity === 'work',
    );
    const school = [...targets.values()].filter(
      (target) => target.activity === 'school',
    );
    const leisure = [...targets.values()]
      .filter((target) => target.activity === 'museum')
      .concat(parks);
    const cap = Number.isFinite(maxActive)
      ? Math.max(0, Math.min(96, Math.floor(maxActive)))
      : 96;
    this.walkers = [...(city.citizens ?? [])]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((person, index) => {
        const home = targets.get(person.homeBuildingId) ?? {
          nodeId: person.nodeId,
          buildingId: person.homeBuildingId,
          activity: 'home' as const,
        };
        const seed = hash(`${city.config.seed ?? 1}:${person.id}`);
        const jobs = seed % 4 === 0 && school.length ? school : work;
        const itinerary: Destination[] = [{ ...home, activity: 'home' }];
        const job = jobs[seed % jobs.length];
        if (job && job.buildingId !== home.buildingId) itinerary.push(job);
        const visit = leisure[(seed >>> 4) % leisure.length];
        if (visit) itinerary.push(visit);
        const position = this.nodes.get(home.nodeId) ?? person.position;
        return {
          id: person.id,
          mobility: person.mobilityFactor,
          active: index < cap && itinerary.length > 1,
          nodeId: home.nodeId,
          position: { ...position },
          itinerary,
          destination: 1 % itinerary.length,
          occupiedBuildingId: home.buildingId,
          activity: 'home' as const,
          walking: false,
          dwell: 1 + (seed % 12),
          edge: null,
          progress: 0,
        };
      });
    // Build ordinary itineraries once; only a changed closure set invalidates this cache.
    for (const walker of this.walkers.filter((person) => person.active))
      for (let i = 0; i < walker.itinerary.length; i++) {
        const from = walker.itinerary[i],
          to = walker.itinerary[(i + 1) % walker.itinerary.length];
        if (from && to) this.route(from.nodeId, to.nodeId, new Set());
      }
  }

  private route(
    from: string,
    to: string,
    blocked: ReadonlySet<string>,
  ): Arc[] | null {
    const key = `${from}\0${to}`;
    if (this.routes.has(key)) return this.routes.get(key) ?? null;
    const paths = new Map<string, { distance: number; arcs: Arc[] }>([
      [from, { distance: 0, arcs: [] }],
    ]);
    const visited = new Set<string>();
    while (true) {
      let selected: string | undefined;
      for (const [id, path] of paths)
        if (
          !visited.has(id) &&
          (!selected ||
            path.distance < (paths.get(selected)?.distance ?? Infinity))
        )
          selected = id;
      if (!selected || selected === to) break;
      visited.add(selected);
      const current = paths.get(selected);
      if (!current) break;
      for (const arc of this.adjacency.get(selected) ?? []) {
        if (blocked.has(arc.id) || visited.has(arc.to)) continue;
        const distance = current.distance + arc.length;
        if (distance < (paths.get(arc.to)?.distance ?? Infinity))
          paths.set(arc.to, { distance, arcs: [...current.arcs, arc] });
      }
    }
    const result = paths.get(to)?.arcs ?? null;
    this.routes.set(key, result);
    if (result)
      for (let i = 0; i < result.length; i++) {
        const arc = result[i];
        if (arc && !this.routes.has(`${arc.from}\0${to}`))
          this.routes.set(`${arc.from}\0${to}`, result.slice(i));
      }
    return result;
  }

  advance(
    seconds: number,
    blockedEdgeIds: readonly string[] = [],
    inactiveIds: ReadonlySet<string> = new Set(),
  ): void {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 60)
      throw new RangeError(
        'Routine time increment must be between zero and 60 seconds.',
      );
    if (seconds === 0) return;
    const key = [...blockedEdgeIds].sort().join('\0');
    if (key !== this.closureKey) {
      this.routes.clear();
      this.closureKey = key;
    }
    const blocked = new Set(blockedEdgeIds);
    this.elapsed += seconds;
    for (const walker of this.walkers) {
      walker.walking = false;
      if (!walker.active || inactiveIds.has(walker.id)) continue;
      let remaining = seconds;
      while (remaining > 1e-9) {
        if (walker.dwell > 0) {
          const wait = Math.min(walker.dwell, remaining);
          walker.dwell -= wait;
          remaining -= wait;
          if (remaining <= 1e-9) break;
        }
        const destination = walker.itinerary[walker.destination];
        if (!destination) break;
        if (!walker.edge) {
          const route = this.route(walker.nodeId, destination.nodeId, blocked);
          if (!route) break;
          const edge = route[0];
          if (!edge) {
            walker.activity = destination.activity;
            walker.walking = false;
            walker.occupiedBuildingId = destination.buildingId;
            walker.dwell =
              20 + (hash(`${walker.id}:${walker.destination}`) % 31);
            walker.destination =
              (walker.destination + 1) % walker.itinerary.length;
            continue;
          }
          walker.edge = edge;
          walker.progress = 0;
          walker.occupiedBuildingId = null;
        }
        const edge = walker.edge;
        if (blocked.has(edge.id)) break;
        const speed = 1.2 * walker.mobility;
        const travel = Math.min(
          remaining,
          (edge.length - walker.progress) / speed,
        );
        walker.progress += travel * speed;
        remaining -= travel;
        const from = this.nodes.get(edge.from),
          to = this.nodes.get(edge.to);
        if (!from || !to) break;
        const ratio = walker.progress / edge.length;
        walker.position = {
          x: from.x + (to.x - from.x) * ratio,
          y: from.y + (to.y - from.y) * ratio,
        };
        walker.walking = travel > 0;
        walker.activity = 'walking';
        if (walker.progress >= edge.length - 1e-9) {
          walker.nodeId = edge.to;
          walker.edge = null;
          walker.progress = 0;
        }
      }
    }
  }

  get locations(): WaitingCitizenLocation[] {
    return this.walkers.map((walker) => ({
      citizenId: walker.id,
      nodeId: walker.edge?.from ?? walker.nodeId,
      occupiedBuildingId: walker.occupiedBuildingId,
      ...(walker.edge
        ? {
            edge: {
              edgeId: walker.edge.id,
              toNodeId: walker.edge.to,
              progressInMeters: walker.progress,
            },
          }
        : {}),
    }));
  }

  get snapshot() {
    return {
      elapsedTimeInSeconds: this.elapsed,
      citizens: this.walkers.map((walker) => ({
        id: walker.id,
        position: { ...walker.position },
        status: 'waiting' as const,
        walking: walker.walking,
        activity: walker.activity,
      })),
    };
  }
}
