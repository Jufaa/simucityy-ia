# Add deterministic pedestrian routines

Objective: let the existing population visit everyday destinations and return home before the hazard alarm, then transfer control to evacuation at the actual location.
Branch: feat/cosaslindas; baseline: 7506ce0. Human owner: requester; integrator: parent. Route: inline (one dependent behavior, no parallel writer reason). Delivery: local/uncommitted, ask-on-risk before any later authorized commits; forecast 650–1000 authored lines. Runner: Vitest.

## Specs

- S1: User "hacelo" authorizes the immediately recommended "peatones con rutinas": leave home, visit work/school and museum/park destinations, then return. Keep the existing IDs/home metadata and bounded population. Deterministic graph routes; missing/unreachable destinations remain idle rather than inventing paths. No LLM or paid provider.
- S2: Prior constraint "el tema es el rendmineto" — cap active routine walkers, cache/precompute access/routes outside per-frame work, reuse the existing instanced citizen layer. Pause/reset/hidden-tab semantics remain; expose truthful routine activity before the alarm.
- S3: Keep evacuation authoritative after alarm without duplicated people, teleportation, or restarting hydraulic time. Synchronize real node/directed-edge progress and occupied building before alarm. A person away from home must not be trapped by home collapse; occupants of collapsed destinations remain trapped.
- S4: Preserve legacy default simulation/evacuation behavior when the new option is omitted. Scene explicitly opts in. Check existing hazards, shelter capacity, bridge height, comparison arms and caller immutability. Synthetic routine destinations use estimated road-node access, not actual entrance/sidewalk paths; no vehicle-pedestrian collision claim.

## Tasks

- T1 [S3,S4] inline focused verified — atomic pre-alarm location synchronization and actual-occupancy trapping with focused regressions; commit not authorized.
- T2 [S1,S2] inline focused verified — bounded deterministic home/destination/home routine model with graph routing, closures and pause/reset tests; commit not authorized.
- T3 [S1-S4] inline automated verified; browser/native review pending — optional DistrictSimulation integration, one citizen render layer, UI/docs, full regression checks and independent item-3 verification. Browser required; no unsupported visual PASS.

## Log

- L1 User: "hacelo", accepting the immediately prior recommendation: "Yo arrancaría por los peatones con rutinas, con una cantidad limitada y midiendo FPS: haría que la ciudad se sienta habitada sin sumar todavía el costo de destrucción física."
- L2 Clean baseline7506ce0. Mapping found existing EvacuationEngine starts everyone in phase home; moving only rendered positions would incorrectly trap people at home and teleport at alarm. Add an opt-in pre-alarm synchronization API and actual occupancy, preserving existing default behavior.
- L3 Existing user-authorized root pnpm dev session15137 serves ports3000/4000; do not restart or change ports. No Git mutation, dependencies, secrets, provider calls or new destruction. Parent owns all edits; independent verifier read-only after checks because Risk item3 (shared evacuation/coordinator/render logic).

- L4 RED observed for absent synchronization API, routine model, coordinator citizenState and normal walking gait. GREEN: 35 focused tests across evacuation engine, routine model, coordinator and citizen renderer pass. Covers home/work/school/museum/park/home cycle, deterministic seeded visits, 96-active cap, source immutability, disconnected destinations, current-edge closure, zero-time pause, restart, approximate partition consistency, actual-position alarm handoff and actual-building trapping. Typecheck initially found narrow itinerary inference; corrected to Destination[]. Four package typechecks then passed.
- L5 Routes are precomputed by itinerary and cached by node/destination, including path suffixes; changed closures invalidate cache. Each arm uses the existing simulated clock and actual occupancy; library defaults stay opt-out. Browser inventory still has zero browsers, so appearance/actual FPS are pending. No servers restarted, no production build run against the active dev server.

- L6 Full verification observed: 302 tests in 53 files pass; pnpm typecheck 4/4; pnpm lint; changed-file Prettier; git diff --check all pass. Logs /tmp/pedestrian-routine-checks.hRBJRw/. No production build in the active checkout, to preserve the running dev server; no build/bundler config changed.
- L7 Independent item-3 verification found no caused blocker. Realistic 500m/200citizens preserved IDs; all96 active walkers completed cycles, including work/school/museum/park/bridge. Atomic rejection, actual edge/occupancy handoff, home-away survival, museum trapping/no resurrection, shelters, both arms and hydraulic time verified. 100 legacy engine outputs and400 hazard/arm snapshots across5hazards through12000simseconds identical to7506ce0. Supplemental delayed-trapping baseline comparison retains28trapped unchanged. Approximate partition consistency through3000seconds within1e-7; directed paths/disconnected idle pass. Parent reran supplement.ts exit0 before cleanup; retained probe evidence with full-check logs.
- L8 Web3000 and API4000 HTTP200 after changes, servers untouched. CUA inventory still empty: visual default/later storm/regeneration/pause/reset/bridge gait and actual FPS remain UNVERIFIED, not passed. Native RDD globally on, review pending after visual proof and final candidate freeze; no consent or approval/receipt claimed. Required continuation is connected-browser proof, then native review with explicit untracked inventory for the new model/tests/task document. No commits authorized or performed.
