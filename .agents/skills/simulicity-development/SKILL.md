---
name: simulicity-development
description: 'Trigger: implement, fix, refactor, TypeScript, React, Fastify or simulation. Apply shared Simulicity development conventions.'
license: Apache-2.0
metadata:
  author: 'Simulicity team'
  version: '1.0'
---

## Activation Contract

Load before implementing or changing application or domain behavior.

## Hard Rules

- Read root `AGENTS.md` and the task before editing; preserve unrelated work.
- Keep domain calculations independent of React, Three.js and provider clients.
- Reuse shared schemas and helpers; validate external input at boundaries.
- Preserve scenario IDs, units, seeded reproducibility and public contracts unless the task explicitly changes them.
- Keep secrets server-side. Do not call paid providers or change dependencies without authorization.

## Decision Gates

- If requirements or a breaking contract are unclear, ask the owner before implementing that part.
- If a change touches rendering, also load `simulicity-visuals`.
- If other writers are active, also load `simulicity-collaboration`.

## Execution Steps

1. Check Git status and inspect the existing implementation and tests.
2. Reproduce the bug or add a deterministic failing test when meaningful.
3. Make the smallest coherent change with tests and affected docs together.
4. Load `simulicity-verification` and run applicable checks.

## Output Contract

Return changed paths, behavior, observed checks and limitations. Do not claim integration or publication without evidence.

## References

- Repository root: `AGENTS.md`.
- Team handoffs: `docs/TEAM_WORK.md`.
