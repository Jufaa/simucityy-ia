import { describe, expect, it } from 'vitest';
import { EvacuationEngine } from '../src/evacuation-engine';
import type { EvacuationScenario } from '../src/evacuation-types';

describe('ciudadanos atrapados por derrumbes', () => {
  it('atrapa solo a quien sigue en casa y el resto evacúa con normalidad', () => {
    const base = scenario();
    const engine = new EvacuationEngine({
      ...base,
      citizens: [
        { ...base.citizens[0]!, id: 'lento', reactionDelayInSeconds: 600 },
        {
          ...base.citizens[0]!,
          id: 'rapido',
          homeBuildingId: 'otra-casa',
          reactionDelayInSeconds: 0,
        },
      ],
      shelters: [{ id: 'shelter', nodeId: 'd', capacity: 2, active: true }],
    });
    // "rapido" sale de inmediato; su casa no es la que se derrumba.
    engine.advance(30, []);
    expect(engine.trapCitizensInBuildings(['home'])).toBe(1);
    expect(engine.trapCitizensInBuildings(['home'])).toBe(0);
    const mid = engine.getSnapshot();
    expect(mid.trappedCount).toBe(1);
    expect(mid.citizens.find((c) => c.id === 'lento')?.status).toBe('trapped');
    engine.advance(120, []);
    const end = engine.getSnapshot();
    expect(end.citizens.find((c) => c.id === 'lento')?.status).toBe('trapped');
    expect(end.citizens.find((c) => c.id === 'lento')?.position).toEqual({
      x: -6,
      y: 0,
    });
    expect(end.citizens.find((c) => c.id === 'rapido')?.status).toBe(
      'evacuated',
    );
    expect(end.evacuatedCount + end.trappedCount).toBe(2);
    expect(end.completionTimeInSeconds).toBeNull();
  });
});

function scenario(): EvacuationScenario {
  return {
    roadGraph: {
      nodes: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 12, y: 0 },
        { id: 'c', x: 0, y: 12 },
        { id: 'd', x: 12, y: 12 },
      ],
      edges: [
        {
          id: 'ab',
          roadId: 'main',
          from: 'a',
          to: 'b',
          lengthInMeters: 12,
          bidirectional: true,
        },
        {
          id: 'bd',
          roadId: 'right',
          from: 'b',
          to: 'd',
          lengthInMeters: 12,
          bidirectional: true,
        },
        {
          id: 'ac',
          roadId: 'left',
          from: 'a',
          to: 'c',
          lengthInMeters: 12,
          bidirectional: true,
        },
        {
          id: 'cd',
          roadId: 'top',
          from: 'c',
          to: 'd',
          lengthInMeters: 12,
          bidirectional: true,
        },
      ],
    },
    citizens: [
      {
        id: 'citizen',
        homeBuildingId: 'home',
        nodeId: 'a',
        position: { x: -6, y: 0 },
        mobilityFactor: 0.5,
        reactionDelayInSeconds: 5,
      },
    ],
    shelters: [{ id: 'shelter', nodeId: 'd', capacity: 1, active: true }],
  };
}

describe('EvacuationEngine', () => {
  it('honors reaction delay, real home connector distance, mobility and exact completion time', () => {
    const input = scenario();
    const before = structuredClone(input);
    const engine = new EvacuationEngine(input);
    expect(engine.getSnapshot().completionTimeInSeconds).toBeNull();
    expect(engine.advance(5, []).citizens[0]).toMatchObject({
      position: { x: -6, y: 0 },
      status: 'evacuating',
    });
    expect(engine.advance(5, []).citizens[0]!.position.x).toBeCloseTo(-3);
    expect(engine.advance(10, []).citizens[0]!.position.x).toBeCloseTo(3);
    const final = engine.advance(35, []);
    expect(final.evacuatedCount).toBe(1);
    expect(final.completionTimeInSeconds).toBeCloseTo(55);
    expect(final.shelters[0]).toMatchObject({ occupancy: 1, reserved: 0 });
    expect(input).toEqual(before);
  });

  it('reroutes deterministically around a future closure at a node and respects graph direction', () => {
    const input = scenario();
    input.citizens = [
      {
        ...input.citizens[0]!,
        position: { x: 0, y: 0 },
        reactionDelayInSeconds: 0,
        mobilityFactor: 1,
      },
    ];
    const engine = new EvacuationEngine(input);
    const started = engine.advance(0, ['ab']);
    expect(started.citizens[0]!.status).toBe('evacuating');
    expect(engine.advance(5, ['ab']).citizens[0]!.position).toEqual({
      x: 0,
      y: 6,
    });
    const oneWay = scenario();
    oneWay.roadGraph = {
      nodes: oneWay.roadGraph.nodes,
      edges: [
        {
          ...oneWay.roadGraph.edges[0]!,
          from: 'b',
          to: 'a',
          bidirectional: false,
        },
      ],
    };
    expect(new EvacuationEngine(oneWay).advance(10, []).strandedCount).toBe(1);
  });

  it('stops exactly mid-edge on closure, preserves reservation and resumes when reopened', () => {
    const input = scenario();
    input.citizens = [
      {
        ...input.citizens[0]!,
        position: { x: 0, y: 0 },
        reactionDelayInSeconds: 0,
        mobilityFactor: 1,
      },
    ];
    const engine = new EvacuationEngine(input);
    const moving = engine.advance(5, []);
    expect(moving.citizens[0]!.position).toEqual({ x: 6, y: 0 });
    const stopped = engine.advance(10, ['ab']);
    expect(stopped.citizens[0]).toMatchObject({
      position: { x: 6, y: 0 },
      status: 'stranded',
    });
    expect(stopped.shelters[0]!.reserved).toBe(1);
    expect(stopped.completionTimeInSeconds).toBeNull();
    expect(engine.advance(5, []).citizens[0]!.position).toEqual({
      x: 12,
      y: 0,
    });
    expect(engine.advance(10, []).evacuatedCount).toBe(1);
  });

  it('replans a remaining blocked route at a node rather than entering the closed edge', () => {
    const input = scenario();
    input.citizens = [
      {
        ...input.citizens[0]!,
        position: { x: 0, y: 0 },
        reactionDelayInSeconds: 0,
        mobilityFactor: 1,
      },
    ];
    const engine = new EvacuationEngine(input);
    engine.advance(10, []);
    const next = engine.advance(5, ['bd']);
    expect(next.citizens[0]!.position).toEqual({ x: 6, y: 0 });
    expect(next.citizens[0]!.status).toBe('evacuating');
  });

  it('reserves finite active shelter capacity, retries stranded agents and excludes inactive shelters', () => {
    const input = scenario();
    input.citizens = ['b-citizen', 'a-citizen'].map((id) => ({
      ...input.citizens[0]!,
      id,
      position: { x: 0, y: 0 },
      mobilityFactor: 1,
      reactionDelayInSeconds: 0,
    }));
    input.shelters = [
      ...input.shelters,
      { id: 'inactive', nodeId: 'a', capacity: 99, active: false },
    ];
    const engine = new EvacuationEngine(input);
    const initial = engine.advance(0, ['ab', 'ac']);
    expect(initial.strandedCount).toBe(2);
    const opened = engine.advance(20, []);
    expect(opened.evacuatedCount).toBe(1);
    expect(opened.strandedCount).toBe(1);
    expect(
      opened.citizens.find((citizen) => citizen.id === 'a-citizen')!.status,
    ).toBe('evacuated');
    expect(opened.completionTimeInSeconds).toBeNull();
    for (const shelter of opened.shelters)
      expect(shelter.occupancy + shelter.reserved).toBeLessThanOrEqual(
        shelter.capacity,
      );
  });

  it('isolates source and snapshot mutations, resets with a fresh engine and rejects invalid time', () => {
    const input = scenario();
    const engine = new EvacuationEngine(input);
    const snapshot = engine.getSnapshot();
    (snapshot.citizens[0]!.position as { x: number }).x = 999;
    expect(engine.getSnapshot().citizens[0]!.position.x).toBe(-6);
    engine.advance(100, []);
    expect(new EvacuationEngine(input).getSnapshot().elapsedTimeInSeconds).toBe(
      0,
    );
    expect(
      new EvacuationEngine({ ...input, citizens: [] }).getSnapshot()
        .completionTimeInSeconds,
    ).toBe(0);
    for (const dt of [-1, NaN, Infinity])
      expect(() => engine.advance(dt, [])).toThrow(RangeError);
  });

  it('uses weighted distance rather than edge count or lexical route order', () => {
    const input = scenario();
    input.citizens = [
      {
        ...input.citizens[0]!,
        position: { x: 0, y: 0 },
        reactionDelayInSeconds: 0,
        mobilityFactor: 1,
      },
    ];
    input.roadGraph = {
      ...input.roadGraph,
      edges: input.roadGraph.edges.map((edge) =>
        edge.id === 'ab' ? { ...edge, lengthInMeters: 120 } : edge,
      ),
    };
    expect(
      new EvacuationEngine(input).advance(5, []).citizens[0]!.position,
    ).toEqual({ x: 0, y: 6 });
  });

  it('allocates capacity at reaction events consistently for large and small time steps', () => {
    const input = scenario();
    input.citizens = [
      {
        ...input.citizens[0]!,
        id: 'a-later',
        position: { x: 0, y: 0 },
        reactionDelayInSeconds: 5,
        mobilityFactor: 1,
      },
      {
        ...input.citizens[0]!,
        id: 'z-earlier',
        position: { x: 0, y: 0 },
        reactionDelayInSeconds: 0,
        mobilityFactor: 1,
      },
    ];
    const large = new EvacuationEngine(input).advance(30, []);
    const smallEngine = new EvacuationEngine(input);
    for (let i = 0; i < 30; i++) smallEngine.advance(1, []);
    expect(smallEngine.getSnapshot()).toEqual(large);
    expect(
      large.citizens.find((citizen) => citizen.id === 'z-earlier')!.status,
    ).toBe('evacuated');
    expect(
      large.citizens.find((citizen) => citizen.id === 'a-later')!.status,
    ).toBe('stranded');
  });
});
