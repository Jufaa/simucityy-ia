---
name: simulicity-collaboration
description: 'Trigger: multiple agents, teammates, delegation, parallel work, ownership, integration or handoff. Coordinate bounded work safely.'
license: Apache-2.0
metadata:
  author: 'Simulicity team'
  version: '1.0'
---

## Activation Contract

Load before splitting work among people or agents, integrating parallel changes or resuming another contributor's task.

## Hard Rules

- Assign one human owner and integrator per task.
- Pass exact allowed edit paths, acceptance criteria, base revision, skill paths, invariants and verification commands.
- Tell each writer others are active; forbid reverting their edits or expanding its own scope.
- Give each behavior its tests/docs together; do not split one behavior into competing code and test writers.
- Reserve shared files and Git operations for the integrator. Never treat a local task file as a distributed lock.

## Decision Gates

- Disjoint paths in one checkout: parallel writers are allowed with declared ownership.
- Overlapping paths: serialize or use independently owned worktrees/branches.
- A unit depends on another: wait for its handoff and reconcile contracts first.
- Delegation unavailable: report it and perform only work safely owned by the current actor.

## Execution Steps

1. Read root `AGENTS.md`, current task handoffs and Git status.
2. Fill the task template in `docs/TEAM_WORK.md` in the chosen issue/PR or task record.
3. Delegate bounded units and wait for completion before dependent work.
4. Inspect each diff against its surface and run combined integration checks.
5. Record decisions, evidence, unresolved items and the next responsible person.

## Output Contract

Return ownership, changed paths, integration order, checks and outstanding decisions. Do not claim private memory was shared or remote changes were published.

## References

- Repository root: `AGENTS.md`.
- Task and handoff templates: `docs/TEAM_WORK.md`.
