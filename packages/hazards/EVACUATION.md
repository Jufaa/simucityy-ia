# Simulate citizens walking to shelters

`EvacuationEngine` advances a fixed graph using caller-supplied simulated seconds and blocked road-edge IDs. It has no wall-clock timer, rendering dependency, network access or source-city mutation.

```ts
const evacuation = new EvacuationEngine({ roadGraph, citizens, shelters });
const snapshot = evacuation.advance(60, flood.blockedRoadEdgeIds);
```

The caller starts the common alarm by advancing the engine. Citizen reaction delays are measured from that alarm, not from the beginning of the storm. Construct a new engine to reset.

## Movement and routing

- Citizens wait for their generated reaction delay, then walk at `1.2 * mobilityFactor` metres per simulated second.
- A straight home-to-access connector uses its actual geometric distance; citizens are not teleported from the home to the graph. This simplified connector has no independent flood or building-collision test.
- Graph traversal uses `lengthInMeters` for travel time and linearly interpolates the corresponding endpoints. Directed edges remain directed; bidirectional edges support both directions.
- Weighted shortest paths exclude blocked edge IDs. Equal-cost routes use lexical edge/node IDs, equal-distance shelters use lexical shelter IDs, and simultaneous citizen decisions use lexical citizen IDs.
- Routes reserve one slot at an active shelter. Occupancy plus reservations cannot exceed capacity. Arrival converts a reservation to occupancy.
- At a node, an invalid remaining route releases its reservation and replans. No-route citizens are stranded and retry on subsequent calls or movement events.
- If a currently traversed edge closes, the citizen stops exactly in place, keeps the reservation and remains stranded until that edge reopens. The engine does not teleport or invent an off-road escape path.

Reaction and arrival events are processed on a common simulated timeline. A large `advance` call does not let a late-reacting citizen reserve capacity ahead of someone who reacted earlier. Closure changes are assumed to take effect at the beginning of each call and remain constant for that call. `advance(0, blockedIds)` reconciles closures and routing without moving anyone.

## Snapshot meanings

Snapshots contain copied citizen positions/status, target shelter IDs, current edge IDs, shelter occupancy/reservations and aggregate counts. Mutating a returned snapshot cannot change engine state.

`completionTimeInSeconds` is `null` until every citizen reaches a shelter, then reports the actual final arrival time since the alarm. An empty population has completion time zero. Waiting and stranded citizens are not counted as evacuated.

This is a deterministic synthetic demonstration, not emergency guidance. It does not model crowd congestion, road width, individual hazard dose, vehicle interactions, shelter inundation or rescue of stranded agents.

## Verify

```bash
pnpm exec vitest run packages/hazards/test/evacuation-engine.test.ts
pnpm --filter @simulicity/hazards typecheck
```
