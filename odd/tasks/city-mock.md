# Make the procedural city mock recognizable

Objective: enrich the existing synthetic city with recognizable civic services and street life, without changing simulation or saved-city contracts.
Branch: feat/cosaslindas. Delivery: local-only (no staging, commits or push); forecast ~900 authored changed lines. Runner: root Vitest, package typechecks and ESLint. Route: parallel disjoint street-life and civic units, parent-owned integration; no PR/chain authorized.

## Specs

- S1 — User: "bien ahora quiero generar lo mas parecido a una ciudad agrega todos los items qe le faltaria a una ciudad pero quiero qe se alo mas pareicdo a una ciudad el mock". Improve the current generated mock rather than replacing it with a real neighborhood or introducing AI.
- S2 — Implementation assumption for S1: add recognizable civic identities to existing suitable buildings (health, education, police, fire, municipal and market services), with rooftop/facade details. Use current footprints, IDs and terrain helpers; never silently change backend/persisted building kinds.
- S3 — Implementation assumption for S1: add deterministic static vehicles, public-transport stops, intersection signals and street furniture where actual street/sidewalk clearance permits. Keep crossings/building access and existing park features clear; do not claim traffic, service coverage or collision simulation.
- S4 — Preserve the existing world, flood and automatic walking/evacuation. Default to a city-focused camera, retain world toggle, show a truthful visual inventory. Resource cleanup and source-city immutability are required integration invariants. Check deterministic placements, grounding, bounds/clearances, resource disposal and legacy tests.

## Tasks

- [x] T1 — S1,S3,S4 — delegated: city-life placement/model/renderer/tests. Writer trigger: independent several-minute street-life unit with disjoint files, launched with T2. Commit: none.
- [x] T2 — S1,S2,S4 — delegated: civic assignment/renderer/tests. Writer trigger: independent several-minute civic unit with disjoint files, launched with T1. Commit: none.
- [x] T3 — S1-S4 — inline: Scene mounting/cleanup/city camera/inventory and README; seam check and independent shared-render lifecycle verification. Commit: none.

## Log

- L1 — Original request verbatim: "bien ahora quiero generar lo mas parecido a una ciudad agrega todos los items qe le faltaria a una ciudad pero quiero qe se alo mas pareicdo a una ciudad el mock".
- L2 — Read-only map confirms existing500m urban district,6m roads/2m sidewalks, varied residential/commercial buildings, parks/trees/benches/lamps/fountains, sea/lake/fields and200people. Add recognizable services and street activity, not duplicate generic boxes. Static visual props only; full real-world completeness, live traffic and AI are not claimed. Existing uncommitted work must remain unchanged.
- L3 — Parent owns Scene/README/task/Git. T1 allowed city-life-model(.test).ts and city-life-layer(.test).ts; T2 allowed civic-landmarks(.test).ts only. Reuse sampleTerrainHeight/buildingBaseHeight. RED→GREEN focused tests per unit, no global formatter or installs. Risk: item3 shared Scene rendering/resource lifecycle; independent verification after own checks. No native review unless applicable assessed review_due.

- L4 — T1 observed missing-module RED then6focusedtests/targetedtypes/lint/format pass. T2 observed missing-module RED then6focusedtests/types/lint/format pass. Parent readback confirms ownership within6newsource/test surfaces, no other worker edits; parent12test spotcheck passes. T1 omits unsafe bus shelters on2m sidewalks, using stop signs. T2 uses existing flat roofs only and ground/base helpers. Both models preserve input bytes and have explicit idempotent disposal. T3 integrating modules, city camera and truthful inventory; UI-effect integration has no meaningful isolated unitRED in current harness, so use geometry tests,types and browser smoke.

- L5 — T3 integrated both owned layers with explicit removal/disposal before shared Scene traversal, city camera and actual inventory. Full178tests/4typechecks/lint/format/diff pass; independent actual500m seeds123/456 flat+relief4probes preserve source/evacuation snapshots, sixcivic roles and600boundeditems. Seed123 has269vehicles/54stops; no clear candidate for signals under current default intersection margins, so0signals is truthful conditional placement, not a claimed working traffic system. Dedicated fresh Chromium/softwareWebGL rendered the city; parent inspected screenshot, no JS exceptions observed, only favicon404. Parent12focusedtest spotcheck pass. Own browser stopped, user servers untouched, scratch removed. No productionbuild or commits. Native assessment medium41files5179lines, review_due:false/under_budget; no review START/authority.
