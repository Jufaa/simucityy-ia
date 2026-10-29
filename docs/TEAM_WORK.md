# Coordinate a shared task

Use this template in the team's issue/PR or a dedicated task document. Keep one authoritative record per task; do not have every agent rewrite a common status file concurrently.

## Before starting

- Agree on a human owner, acceptance criteria and base branch/revision.
- Read `../AGENTS.md` and the matching project skills from the repository root.
- Check the current worktree and other active work before assigning paths.
- Publish accepted decisions and handoffs through Git/your team's issue system. Local files become available to teammates only after an authorized commit, push and pull.

## Task and delegation template

```text
Task ID / title:
Human owner / integrator:
Goal and acceptance criteria:
Base branch and revision:
Scope and explicit non-goals:
Allowed edit paths (exact paths or narrow globs):
Shared contracts and their owner:
Existing helpers and invariants to preserve:
Skills to read (repository-relative paths):
Verification commands and manual scenarios:
Dependencies / blocked-by:

You are not alone in the codebase. Preserve others' edits.
Stop and report if implementation needs paths outside the allowed surface.
Do not perform Git mutations or paid/external operations without authorization.
```

## Handoff template

```text
Task / owner:
Branch and commit (or explicitly uncommitted):
Acceptance criteria covered:
Changed files and key behavior:
Contracts or decisions changed and why:
Commands run and observed results:
Browser evidence, if applicable:
Failures, skipped checks and limitations:
Conflicts / integration order:
Next action and responsible person:
```

## Integration checklist

- Confirm each writer stayed inside its allowed paths and preserved shared contracts.
- Review the combined diff; resolve overlapping edits deliberately, never by discarding a teammate's work.
- Run focused checks and the combined test/type/lint checks from `AGENTS.md`.
- Update affected docs and record the actual base/revision in the handoff.
- Have the human integrator authorize commit, push and merge separately.

These records share decisions, not live agent memory. Ask a fresh agent to read `AGENTS.md`, the task record and current diff before resuming.
