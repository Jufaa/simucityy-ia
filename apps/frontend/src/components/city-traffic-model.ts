import type { CityResponse } from './city-types';

export interface TrafficVehicle {
  readonly id: string;
  readonly laneId: string;
  readonly edgeId: string;
  readonly roadId: string;
  readonly distanceInMeters: number;
  readonly x: number;
  readonly z: number;
  readonly headingRadians: number;
  readonly speedInMetersPerSecond: number;
}

interface Lane {
  id: string;
  edgeId: string;
  roadId: string;
  from: string;
  to: string;
  x: number;
  z: number;
  dx: number;
  dz: number;
  length: number;
}
interface Vehicle {
  id: string;
  lane: Lane;
  distance: number;
  speed: number;
  visits: number;
  junction: string | null;
}

const STEP = 1 / 30;
const GAP = 8;
const CLEARANCE = 8;
const MAX_SPEED = 8;
const EMPTY_ROADS: ReadonlySet<string> = new Set();
const hash = (value: string) => {
  let state = 2166136261;
  for (let i = 0; i < value.length; i++)
    state = Math.imul(state ^ value.charCodeAt(i), 16777619);
  return state >>> 0;
};

/** Small kinematic road model, not a rigid-body or calibrated traffic solver. */
export class CityTraffic {
  private readonly lanes: Lane[] = [];
  private readonly outgoing = new Map<string, Lane[]>();
  private readonly initial: Vehicle[];
  private readonly reservations = new Map<string, string>();
  private state: Vehicle[] = [];
  private accumulated = 0;

  constructor(city: CityResponse, options: { maxVehicles?: number } = {}) {
    const nodes = new Map(city.roadGraph?.nodes.map((node) => [node.id, node]));
    for (const edge of city.roadGraph?.edges ?? []) {
      const from = nodes.get(edge.from),
        to = nodes.get(edge.to);
      if (!from || !to) continue;
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      // Tiny graph subdivisions cannot safely hold a full vehicle and junction clearance.
      if (!Number.isFinite(length) || length < 24) continue;
      for (const reverse of edge.bidirectional ? [false, true] : [false]) {
        const a = reverse ? to : from,
          b = reverse ? from : to;
        const lane: Lane = {
          id: `${edge.id}:${reverse ? 'reverse' : 'forward'}`,
          edgeId: edge.id,
          roadId: edge.roadId,
          from: a.id,
          to: b.id,
          x: a.x,
          z: a.y,
          dx: (b.x - a.x) / length,
          dz: (b.y - a.y) / length,
          length,
        };
        this.lanes.push(lane);
        const outgoing = this.outgoing.get(a.id) ?? [];
        outgoing.push(lane);
        this.outgoing.set(a.id, outgoing);
      }
    }
    const requested = options.maxVehicles ?? 40;
    const count = Number.isFinite(requested)
      ? Math.max(0, Math.min(40, Math.floor(requested)))
      : 40;
    const seed = city.config.seed ?? 1;
    this.initial = [...this.lanes]
      .sort((a, b) => hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`))
      .slice(0, count)
      .map((lane, index) => ({
        id: `traffic-${index}`,
        lane,
        distance:
          CLEARANCE +
          (lane.length - 2 * CLEARANCE) *
            (0.25 + (hash(`${seed}:${index}`) % 500) / 1000),
        speed: 0,
        visits: 0,
        junction: null,
      }));
    this.reset();
  }

  get vehicles(): readonly TrafficVehicle[] {
    return this.state.map((vehicle) => {
      const { lane, distance } = vehicle;
      // Right-hand lanes are kept inside the six-metre road, including bridge decks.
      const offset = 0.85;
      return {
        id: vehicle.id,
        laneId: lane.id,
        edgeId: lane.edgeId,
        roadId: lane.roadId,
        distanceInMeters: distance,
        x: lane.x + lane.dx * distance - lane.dz * offset,
        z: lane.z + lane.dz * distance + lane.dx * offset,
        headingRadians: -Math.atan2(lane.dz, lane.dx),
        speedInMetersPerSecond: vehicle.speed,
      };
    });
  }

  advance(
    deltaSeconds: number,
    blockedRoadIds: ReadonlySet<string> = EMPTY_ROADS,
  ): readonly TrafficVehicle[] {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0)
      return this.vehicles;
    this.accumulated += Math.min(deltaSeconds, 0.25);
    // At most eight fixed steps; background time is intentionally discarded.
    for (
      let steps = 0;
      this.accumulated + 1e-10 >= STEP && steps < 8;
      steps++
    ) {
      this.step(blockedRoadIds);
      this.accumulated -= STEP;
    }
    return this.vehicles;
  }

  reset(): void {
    this.state = this.initial.map((vehicle) => ({ ...vehicle }));
    this.reservations.clear();
    this.accumulated = 0;
  }

  private step(blockedRoadIds: ReadonlySet<string>): void {
    const byLane = new Map<string, Vehicle[]>();
    for (const vehicle of this.state) {
      const laneVehicles = byLane.get(vehicle.lane.id) ?? [];
      laneVehicles.push(vehicle);
      byLane.set(vehicle.lane.id, laneVehicles);
      if (
        vehicle.junction === vehicle.lane.from &&
        vehicle.distance >= CLEARANCE
      ) {
        this.reservations.delete(vehicle.junction);
        vehicle.junction = null;
      }
    }
    const leaderById = new Map<string, Vehicle>();
    for (const laneVehicles of byLane.values()) {
      laneVehicles.sort((a, b) => b.distance - a.distance);
      for (let i = 1; i < laneVehicles.length; i++) {
        const leader = laneVehicles[i - 1],
          following = laneVehicles[i];
        if (leader && following) leaderById.set(following.id, leader);
      }
    }
    for (const vehicle of this.state) {
      const lane = vehicle.lane;
      if (blockedRoadIds.has(lane.roadId)) {
        vehicle.speed = 0;
        continue;
      }
      const candidates = (this.outgoing.get(lane.to) ?? []).filter(
        (next) => !blockedRoadIds.has(next.roadId),
      );
      const forward = candidates.filter((next) => next.to !== lane.from);
      const routes = forward.length ? forward : candidates;
      const next = routes.reduce<Lane | undefined>(
        (best, option) =>
          !best ||
          hash(`${vehicle.id}:${vehicle.visits}:${option.id}`) <
            hash(`${vehicle.id}:${vehicle.visits}:${best.id}`)
            ? option
            : best,
        undefined,
      );
      const nextVehicles = next ? (byLane.get(next.id) ?? []) : [];
      const entryClear = nextVehicles.every(
        (other) => other.id === vehicle.id || other.distance >= GAP + CLEARANCE,
      );
      const owner = this.reservations.get(lane.to);
      const remaining = lane.length - vehicle.distance;
      if (
        remaining < 20 &&
        next &&
        entryClear &&
        (!owner || owner === vehicle.id) &&
        !vehicle.junction
      ) {
        this.reservations.set(lane.to, vehicle.id);
        vehicle.junction = lane.to;
      }
      const canCross =
        next && entryClear && this.reservations.get(lane.to) === vehicle.id;
      const leader = leaderById.get(vehicle.id);
      let available = leader
        ? Math.max(0, leader.distance - vehicle.distance - GAP)
        : Infinity;
      if (!canCross)
        available = Math.min(available, Math.max(0, remaining - CLEARANCE));
      const desiredSpeed = Math.min(MAX_SPEED, Math.sqrt(2 * 4 * available));
      vehicle.speed = Math.max(
        0,
        Math.min(desiredSpeed, vehicle.speed + 2 * STEP),
      );
      const travel = Math.min(available, vehicle.speed * STEP);
      vehicle.distance += travel;
      if (travel < 1e-8) vehicle.speed = 0;
      if (vehicle.distance >= lane.length && canCross) {
        const oldVehicles = byLane.get(lane.id);
        if (oldVehicles) oldVehicles.splice(oldVehicles.indexOf(vehicle), 1);
        vehicle.distance -= lane.length;
        vehicle.lane = next;
        vehicle.visits++;
        const targetVehicles = byLane.get(next.id) ?? [];
        targetVehicles.push(vehicle);
        byLane.set(next.id, targetVehicles);
      }
    }
  }
}
