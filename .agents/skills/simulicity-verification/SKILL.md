---
name: simulicity-verification
description: 'Trigger: test, verify, review, regression or delivery. Produce evidence for Simulicity changes without invented passes.'
license: Apache-2.0
metadata:
  author: 'Simulicity team'
  version: '1.0'
---

## Activation Contract

Load when checking a change, reviewing a handoff or preparing integration.

## Hard Rules

- Verify acceptance criteria against the actual diff and current implementation.
- Do not alter source during read-only review, overwrite others' work or restart their services.
- Use deterministic offline tests; live API spend requires explicit authorization.
- Distinguish caused defects, pre-existing failures, skipped checks and unavailable proof.

## Decision Gates

- Documentation-only change: check structure, links, paths, formatting and consistency; no artificial failing test is required.
- Behavior change: run focused regression tests and applicable combined checks.
- Visual change: require actual browser inspection in addition to tests.
- Build or bundler change: include the build command.

## Execution Steps

1. Read `AGENTS.md`, task acceptance criteria and the diff.
2. Run applicable focused checks, then `pnpm test`, `pnpm typecheck`, `pnpm lint` and `git diff --check` for integration.
3. Check formatting only for changed authored files; do not normalize the entire repository during review.
4. Inspect affected scenarios and failure paths; record exact commands and outcomes.

## Output Contract

Return criteria covered, checks with observed results, reproducible blockers and limitations. Never write PASS for an unavailable check.

## References

- Repository root: `AGENTS.md`.
- Handoff format: `docs/TEAM_WORK.md`.
