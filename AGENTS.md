# Simulicity IA — shared engineering contract

Read this file before changing the project. It is the shared baseline for people and coding agents, not a replacement for inspecting the current code.

## Product and current context

- Build a synthetic city simulator: establish terrain, water, streets, buildings, services and people first; add AI-driven generation and behavior incrementally afterward.
- Prioritize a coherent, reproducible city and visible walking/evacuation over adding disconnected visual props. Use deterministic seeds and stable entity identifiers.
- Keep the demo free to run locally. Prefer existing dependencies and local, licensed assets. A developer's coding-assistant API credits do not make a runtime service free.
- The frontend currently renders a Three.js organic city, lake/channel and bridge, surroundings, local Kenney CC0 buildings and procedural fallback. It also retains the original grid.
- Rain/flood visualization and graph-based evacuation run automatically. The visible city behavior is deterministic simulation, not proof that an LLM controls citizens.
- The backend registers city-generation and AI/BYOK routes. Inspect their implementation before describing capabilities; registration alone does not prove frontend integration.
- This is an experimental demonstration, not calibrated flood forecasting or certified emergency guidance.

Historical documents may disagree with this implementation. In particular, the root README and backend README still describe an earlier health-only baseline; `Ideadelproyect.md` describes an earlier real-neighborhood direction. Do not silently restore those older scopes. Confirm uncertain requirements with the task owner and update affected documentation with accepted changes.

## Repository map and boundaries

| Location                                   | Responsibility                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `apps/frontend/src/components/`            | Scene lifecycle, presentation, procedural city/world models, simulation integration |
| `apps/frontend/src/app/`                   | Next.js pages and server route handlers                                             |
| `apps/backend/src/modules/`                | Fastify city-generation and AI modules                                              |
| `apps/backend/src/config/`                 | Validated server configuration                                                      |
| `packages/shared/`                         | Shared schemas and inferred types                                                   |
| `packages/hazards/`                        | Flood/environment/evacuation logic; keep independent of React and Three.js          |
| `apps/frontend/public/models/kenney-city/` | Local models, textures, licenses and provenance manifest                            |
| `odd/tasks/`                               | Existing feature specifications and implementation history; verify before resuming  |
| `docs/TEAM_WORK.md`                        | Team coordination and handoff template                                              |

Reuse existing terrain, road-surface, geometry and schema helpers. Do not create a second representation of the same state without an explicit boundary and conversion.

## Local setup

1. Use `.nvmrc` for Node and the root `packageManager` for pnpm. Install from the repository root with `pnpm install --frozen-lockfile`.
2. If `apps/backend/.env` is absent, copy `apps/backend/.env.example` there. Never overwrite an existing `.env`.
3. Generate a separate local encryption key with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and put it in `BYOK_MASTER_KEY` in that backend file. Current backend validation requires 64 hexadecimal characters.
4. Run `pnpm dev` from the root. Default web: `http://localhost:3000`; API: `http://127.0.0.1:4000`.

`MODEL_API_KEY` configures a developer's coding client; it is not the same as the backend encryption key. Do not put either key in tracked files, prompts, screenshots or browser bundles. Meta runtime integration has its own server configuration; never assume the coding client's key configures the application.

If `@simulicity/hazards` cannot resolve, check the branch, workspace installation and presence of `packages/hazards/src/index.ts`. From the root, diagnose with `pnpm --filter @simulicity/web exec node --input-type=module -e "console.log(import.meta.resolve('@simulicity/hazards'))"`. The package currently exports TypeScript source; do not invent a missing `dist` build requirement.

Do not stop someone else's server or silently change ports. Do not publish the development API or expose it beyond loopback without explicit authorization.

## Code conventions

- Use TypeScript and existing strict compiler settings. Prefer concrete types; validate untrusted input at boundaries with existing Zod schemas. Avoid `any`, ignored diagnostics and non-null assertions as shortcuts.
- Use English identifiers, comments and technical documentation. Extend existing Spanish UI in consistent neutral Spanish. Match the user's language in chat.
- Use PascalCase for components/types, camelCase for variables/functions and existing kebab-case module filenames. Prefer descriptive names with units, such as `depthInMeters`.
- Follow Prettier and ESLint rather than personal formatting preferences. Current Prettier uses single quotes and trailing commas. Do not reformat unrelated files.
- Keep calculations and seeded generation pure where possible. Do not mutate source scenarios or solver snapshots from rendering code.
- Preserve IDs, home/node references, routes, shelter capacity, units and bridge-deck semantics across transformations. Explicitly test intentional contract changes.
- Separate presentation from simulation truth: a visual offset, water reconstruction or animation must not silently alter hydraulic depth or evacuation state.
- Own Three.js resources explicitly. Clean up geometry, materials, textures, instances and subscriptions; dispose late async results after scene release. Retain a visible fallback when models fail.
- Keep changes focused. Reuse local patterns before introducing layers, libraries, stores or generic abstractions. Discuss dependency, persistence, security and breaking contract changes first.

## Work with people and multiple agents

- Before work, read the task, this file, matching skills and `git status --short`. Preserve other people's changes. Verify assumptions against current code.
- Use one feature branch per human-owned task. Before creating a branch, verify the agreed base and a safe working tree; never move uncommitted work or switch another person's checkout automatically.
- Every task has one human owner. Record the goal, acceptance criteria, exact allowed paths and shared-contract owner using `docs/TEAM_WORK.md` in the team's issue/PR or a dedicated task file.
- Parallel agents may write only disjoint paths in a shared checkout. Give each writer its implementation, tests and documentation together. If paths overlap, serialize the work or use separately owned worktrees/branches.
- Only the designated integrator runs Git mutations and repository-wide normalizers in a shared checkout. Do not stage, commit, push, merge, reset, clean or rewrite history without authorization.
- Delegate with the exact task, base revision, allowed paths, relevant skill paths, invariants and verification commands. Tell workers they are not alone and must not revert others' edits. Require a bounded handoff and wait before dependent work.
- Review shared contracts together before implementation. Reconcile one worker's output before integrating another's dependent changes. Run one integration check after combining parallel units.
- If the runtime cannot spawn agents, say so; do not pretend parallel work happened. Optional delegation is not a prerequisite for ordinary local work.
- Shared files do not synchronize private chats or memory automatically. Keep accepted decisions, limitations and next steps in versioned task/PR handoffs. Do not store secrets or full chat transcripts there.

## Required project skills

Load only skills relevant to the task, before editing. These repository-relative files are the portable registry; a teammate must not need another developer's home-directory skills, plugins or memory server.

| Skill                      | Trigger                                                       | File                                               |
| -------------------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| `simulicity-development`   | Implement or fix application/domain behavior                  | `.agents/skills/simulicity-development/SKILL.md`   |
| `simulicity-visuals`       | Three.js, city placement, terrain, water or citizen animation | `.agents/skills/simulicity-visuals/SKILL.md`       |
| `simulicity-verification`  | Tests, review, regression checks or delivery                  | `.agents/skills/simulicity-verification/SKILL.md`  |
| `simulicity-collaboration` | Multiple people/agents, ownership, integration or handoff     | `.agents/skills/simulicity-collaboration/SKILL.md` |

When delegating, pass the matching exact paths and require workers to read them. If a client does not discover skills automatically, open those files explicitly. Do not copy all skills into every prompt. Existing `.atl/skill-registry.md` includes machine-local tools; it is not the portable team dependency list.

## Verification and completion

For a behavior change, reproduce the issue or observe a meaningful failing test, implement the smallest fix, then run the focused tests. Use existing Vitest tests; backend tests can use Fastify injection without live services. Do not make paid calls to verify ordinary offline behavior.

Before integration, run and report actual results:

```bash
pnpm test
pnpm typecheck
pnpm lint
git diff --check
```

Run `pnpm exec prettier --check <changed-files>` for authored files, and `pnpm build` when build/bundling behavior is affected. Do not pass shell placeholders literally. For visual changes, inspect real default and later storm states in a browser, including pause/reset and model failure where relevant. Unit tests alone do not prove appearance.

Never report an unrun check as passing. Separate existing failures from caused regressions using evidence. Finish with changed paths, verified behavior, failed/skipped checks, remaining limitations and a concrete handoff. Keep docs aligned with code; update this file when an accepted project decision changes its context.
