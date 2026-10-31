import type { Point } from './types';
import type {
  EvacuationCitizenInput,
  EvacuationScenario,
  EvacuationShelterInput,
  EvacuationSnapshot,
  EvacuationStatus,
} from './evacuation-types';

type Arc = { id: string; from: string; to: string; length: number };
type Shelter = EvacuationShelterInput & { occupancy: number; reserved: number };
type Agent = {
  input: EvacuationCitizenInput;
  position: { x: number; y: number };
  nodeId: string;
  phase: 'home' | 'connector' | 'node' | 'edge' | 'done' | 'trapped';
  status: EvacuationStatus;
  route: Arc[];
  shelter: Shelter | null;
  edge: Arc | null;
  progress: number;
  arrival: number | null;
};
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const finitePoint = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);

/** Deterministic walking on a fixed graph; callers supply simulated time and closures. */
export class EvacuationEngine {
  private readonly nodes = new Map<string, Point>();
  private readonly adjacency = new Map<string, Arc[]>();
  private readonly shelters: Shelter[];
  private readonly agents: Agent[];
  private elapsed = 0;

  constructor(scenario: EvacuationScenario) {
    for (const node of scenario.roadGraph.nodes) {
      if (!node.id || this.nodes.has(node.id) || !finitePoint(node))
        throw new RangeError(
          'Evacuation graph nodes must have unique IDs and finite coordinates.',
        );
      this.nodes.set(node.id, { x: node.x, y: node.y });
      this.adjacency.set(node.id, []);
    }
    const edges = new Set<string>();
    for (const edge of scenario.roadGraph.edges) {
      if (
        !edge.id ||
        edges.has(edge.id) ||
        !this.nodes.has(edge.from) ||
        !this.nodes.has(edge.to) ||
        edge.from === edge.to ||
        !Number.isFinite(edge.lengthInMeters) ||
        edge.lengthInMeters <= 0
      )
        throw new RangeError(
          'Evacuation graph edges must have valid references, unique IDs and positive lengths.',
        );
      edges.add(edge.id);
      const arc = {
        id: edge.id,
        from: edge.from,
        to: edge.to,
        length: edge.lengthInMeters,
      };
      this.adjacency.get(edge.from)!.push(arc);
      if (edge.bidirectional)
        this.adjacency
          .get(edge.to)!
          .push({ ...arc, from: edge.to, to: edge.from });
    }
    for (const arcs of this.adjacency.values())
      arcs.sort((a, b) => compare(a.id, b.id) || compare(a.to, b.to));
    const shelterIds = new Set<string>();
    this.shelters = scenario.shelters
      .map((shelter) => {
        if (
          !shelter.id ||
          shelterIds.has(shelter.id) ||
          !this.nodes.has(shelter.nodeId) ||
          !Number.isSafeInteger(shelter.capacity) ||
          shelter.capacity < 0
        )
          throw new RangeError(
            'Evacuation shelters require unique IDs, graph nodes and nonnegative integer capacities.',
          );
        shelterIds.add(shelter.id);
        return { ...shelter, occupancy: 0, reserved: 0 };
      })
      .sort((a, b) => compare(a.id, b.id));
    const citizenIds = new Set<string>();
    this.agents = scenario.citizens
      .map((citizen) => {
        if (
          !citizen.id ||
          citizenIds.has(citizen.id) ||
          !this.nodes.has(citizen.nodeId) ||
          !finitePoint(citizen.position) ||
          !Number.isFinite(citizen.mobilityFactor) ||
          citizen.mobilityFactor <= 0 ||
          citizen.mobilityFactor > 1 ||
          !Number.isFinite(citizen.reactionDelayInSeconds) ||
          citizen.reactionDelayInSeconds < 0
        )
          throw new RangeError(
            'Evacuation citizens require unique IDs, valid access, finite positions, mobility in (0,1] and nonnegative delays.',
          );
        citizenIds.add(citizen.id);
        return {
          input: { ...citizen, position: { ...citizen.position } },
          position: { ...citizen.position },
          nodeId: citizen.nodeId,
          phase: 'home' as const,
          status: 'waiting' as const,
          route: [],
          shelter: null,
          edge: null,
          progress: 0,
          arrival: null,
        };
      })
      .sort((a, b) => compare(a.input.id, b.input.id));
  }

  /**
   * Atrapa a los ciudadanos que aún están en casa cuando su edificio se
   * derrumba. Quien ya salió (conector/calle/refugio) no resulta atrapado.
   * Devuelve cuántos quedaron atrapados en esta llamada.
   */
  trapCitizensInBuildings(buildingIds: readonly string[]): number {
    const buildings = new Set(buildingIds);
    let trapped = 0;
    for (const agent of this.agents) {
      if (agent.phase !== 'home' || !buildings.has(agent.input.homeBuildingId))
        continue;
      this.release(agent);
      agent.phase = 'trapped';
      agent.status = 'trapped';
      agent.edge = null;
      trapped++;
    }
    return trapped;
  }

  /**
   * Ciudadanos alcanzados por el agua (o por otro peligro puntual): quedan
   * incapacitados donde están, como los atrapados por un derrumbe. No
   * afecta a quien ya llegó al refugio ni a quien ya estaba atrapado.
   * Devuelve cuántos fueron alcanzados en esta llamada.
   */
  sweepCitizens(citizenIds: readonly string[]): number {
    const ids = new Set(citizenIds);
    let swept = 0;
    for (const agent of this.agents) {
      if (
        !ids.has(agent.input.id) ||
        agent.phase === 'done' ||
        agent.phase === 'trapped'
      )
        continue;
      this.release(agent);
      agent.phase = 'trapped';
      agent.status = 'trapped';
      agent.edge = null;
      swept++;
    }
    return swept;
  }

  private release(agent: Agent) {
    if (agent.shelter) agent.shelter.reserved--;
    agent.shelter = null;
    agent.route = [];
  }

  private plan(agent: Agent, blocked: ReadonlySet<string>): boolean {
    this.release(agent);
    if (
      !this.shelters.some(
        (shelter) =>
          shelter.active &&
          shelter.occupancy + shelter.reserved < shelter.capacity,
      )
    )
      return false;
    const paths = new Map<
      string,
      { distance: number; key: string; route: Arc[] }
    >();
    paths.set(agent.nodeId, { distance: 0, key: '', route: [] });
    const visited = new Set<string>();
    while (true) {
      let selected: string | null = null;
      for (const [id, path] of paths) {
        if (visited.has(id)) continue;
        const best = selected === null ? null : paths.get(selected)!;
        if (
          !best ||
          path.distance < best.distance ||
          (path.distance === best.distance && compare(path.key, best.key) < 0)
        )
          selected = id;
      }
      if (selected === null) break;
      visited.add(selected);
      const current = paths.get(selected)!;
      for (const arc of this.adjacency.get(selected)!) {
        if (blocked.has(arc.id) || visited.has(arc.to)) continue;
        const distance = current.distance + arc.length;
        const key = `${current.key}\0${arc.id}\0${arc.to}`;
        const previous = paths.get(arc.to);
        if (
          !previous ||
          distance < previous.distance ||
          (distance === previous.distance && compare(key, previous.key) < 0)
        )
          paths.set(arc.to, { distance, key, route: [...current.route, arc] });
      }
    }
    let selected: Shelter | null = null;
    for (const shelter of this.shelters) {
      if (
        !shelter.active ||
        shelter.occupancy + shelter.reserved >= shelter.capacity ||
        !paths.has(shelter.nodeId)
      )
        continue;
      if (
        !selected ||
        paths.get(shelter.nodeId)!.distance <
          paths.get(selected.nodeId)!.distance
      )
        selected = shelter;
    }
    if (!selected) return false;
    agent.shelter = selected;
    selected.reserved++;
    agent.route = [...paths.get(selected.nodeId)!.route];
    return true;
  }

  advance(
    seconds: number,
    blockedRoadEdgeIds: readonly string[],
  ): EvacuationSnapshot {
    if (
      !Number.isFinite(seconds) ||
      seconds < 0 ||
      !Number.isFinite(this.elapsed + seconds)
    )
      throw new RangeError(
        'Evacuation time increment must be finite and nonnegative.',
      );
    const blocked = new Set(blockedRoadEdgeIds);
    const end = this.elapsed + seconds;
    let time = this.elapsed;
    // Process common reaction/arrival events, not one citizen's whole interval first.
    // This keeps capacity allocation independent of the caller's time-step size.
    while (true) {
      for (const agent of this.agents) {
        if (
          agent.phase !== 'done' &&
          agent.phase !== 'edge' &&
          agent.shelter &&
          agent.route.some((arc) => blocked.has(arc.id))
        )
          this.release(agent);
      }
      for (const agent of this.agents) {
        if (
          agent.phase === 'done' ||
          agent.phase === 'trapped' ||
          agent.input.reactionDelayInSeconds > time
        )
          continue;
        if (agent.phase === 'edge') {
          agent.status = blocked.has(agent.edge!.id)
            ? 'stranded'
            : 'evacuating';
          continue;
        }
        if (!agent.shelter && !this.plan(agent, blocked)) {
          agent.status = 'stranded';
          continue;
        }
        agent.status = 'evacuating';
        if (agent.phase === 'home') agent.phase = 'connector';
        if (agent.phase === 'connector') {
          const node = this.nodes.get(agent.nodeId)!;
          if (
            Math.hypot(
              node.x - agent.input.position.x,
              node.y - agent.input.position.y,
            ) === 0
          ) {
            agent.position = { ...node };
            agent.phase = 'node';
          }
        }
        if (agent.phase === 'node' && !agent.route.length) {
          agent.shelter!.reserved--;
          agent.shelter!.occupancy++;
          agent.phase = 'done';
          agent.status = 'evacuated';
          agent.arrival = time;
        }
      }
      if (time >= end) break;
      let duration = end - time;
      for (const agent of this.agents) {
        if (agent.input.reactionDelayInSeconds > time) {
          duration = Math.min(
            duration,
            agent.input.reactionDelayInSeconds - time,
          );
        } else if (agent.status === 'evacuating') {
          const node = this.nodes.get(agent.nodeId)!;
          const length =
            agent.phase === 'connector'
              ? Math.hypot(
                  node.x - agent.input.position.x,
                  node.y - agent.input.position.y,
                )
              : agent.phase === 'node'
                ? agent.route[0]!.length
                : agent.edge!.length;
          duration = Math.min(
            duration,
            Math.max(0, length - agent.progress) /
              (1.2 * agent.input.mobilityFactor),
          );
        }
      }
      for (const agent of this.agents) {
        if (agent.status !== 'evacuating') continue;
        if (agent.phase === 'node') {
          agent.edge = agent.route.shift()!;
          agent.progress = 0;
          agent.phase = 'edge';
        }
        const from =
          agent.phase === 'connector'
            ? agent.input.position
            : this.nodes.get(agent.edge!.from)!;
        const to = this.nodes.get(
          agent.phase === 'connector' ? agent.nodeId : agent.edge!.to,
        )!;
        const length =
          agent.phase === 'connector'
            ? Math.hypot(to.x - from.x, to.y - from.y)
            : agent.edge!.length;
        agent.progress = Math.min(
          length,
          agent.progress + duration * 1.2 * agent.input.mobilityFactor,
        );
        const ratio = length === 0 ? 1 : agent.progress / length;
        agent.position = {
          x: from.x + (to.x - from.x) * ratio,
          y: from.y + (to.y - from.y) * ratio,
        };
        if (length - agent.progress > 1e-9) continue;
        agent.position = { ...to };
        if (agent.phase === 'edge') agent.nodeId = agent.edge!.to;
        agent.edge = null;
        agent.progress = 0;
        agent.phase = 'node';
      }
      time += duration;
    }
    this.elapsed = end;
    return this.getSnapshot();
  }

  getSnapshot(): EvacuationSnapshot {
    const evacuatedCount = this.agents.filter(
      (agent) => agent.status === 'evacuated',
    ).length;
    return {
      elapsedTimeInSeconds: this.elapsed,
      citizens: this.agents.map((agent) => ({
        id: agent.input.id,
        position: { ...agent.position },
        status: agent.status,
        shelterId: agent.shelter?.id ?? null,
        currentEdgeId: agent.edge?.id ?? null,
      })),
      shelters: this.shelters.map((shelter) => ({
        shelterId: shelter.id,
        capacity: shelter.capacity,
        occupancy: shelter.occupancy,
        reserved: shelter.reserved,
      })),
      evacuatedCount,
      strandedCount: this.agents.filter((agent) => agent.status === 'stranded')
        .length,
      trappedCount: this.agents.filter((agent) => agent.status === 'trapped')
        .length,
      waitingCount: this.agents.filter((agent) => agent.status === 'waiting')
        .length,
      completionTimeInSeconds:
        evacuatedCount === this.agents.length
          ? Math.max(0, ...this.agents.map((agent) => agent.arrival ?? 0))
          : null,
    };
  }
}
