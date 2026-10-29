---
name: simulicity-visuals
description: 'Trigger: Three.js, terrain, water, city geometry, assets or citizen animation. Preserve rendering and simulation invariants.'
license: Apache-2.0
metadata:
  author: 'Simulicity team'
  version: '1.0'
---

## Activation Contract

Load before changing city/world generation, terrain sampling, scene resources, models, flood display or citizen animation.

## Hard Rules

- Separate visual coordinates from solver truth; never mutate input snapshots to improve a screenshot.
- Reuse terrain and road-surface helpers. Preserve bridge-deck height, connectivity and under-deck water semantics.
- Keep local building pose, conservative bounds, foundations, roofs and separately instanced details consistent.
- Preserve deterministic placement and entity references across regeneration.
- Own resource disposal and asynchronous scene lifetimes. Keep procedural fallback visible until assets are ready.
- Preserve licenses, local texture paths and manifest provenance when replacing assets.

## Decision Gates

- If changing hydraulics rather than its display, include domain tests and explicitly describe that scope.
- If appearance cannot be inspected in a browser, report visual verification as pending.

## Execution Steps

1. Inspect existing helpers and affected geometry/lifecycle tests.
2. Add a focused regression for the changed invariant.
3. Check flat/relief terrain, organic/legacy layouts and representative seeds where affected.
4. Inspect default running and later storm states, regeneration and pause/reset.
5. Check local model loading/fallback and scene cleanup when affected.

## Output Contract

Return numerical checks, actual browser observations, evidence location and remaining visual limitations. Never equate passing tests with realism.

## References

- Repository root: `AGENTS.md`.
- Visual model and limits: `apps/frontend/README.md`.
