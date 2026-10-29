# Add a procedural world foundation

Objective: surround the existing synthetic city with a coherent coast/sea, inland lake, rural fields and reserved dry expansion areas before introducing AI.
Branch: feat/cosaslindas. Delivery: local only, no staging/commits/push. Preserve all existing uncommitted flood-response work. Runner: root Vitest, package typechecks, lint and targeted formatting.

## Specs

- S1 — User direction verbatim: "Nono mi idea es primero tener todas las cosas para generar y las diferentes cosas, y ver como qedan implementadas, hasta intentar llegar a tener una ciudad, dsp implementams la ia y que haga lo q qiera obviamente intentado hacer uan ciudad, pero deberiamos agregar mar, lagos, campos, todas las cosas del mundo real me explico?" Current authorization: "hacelo". This first slice implements the preceding accepted proposal: "ampliar nuestro terreno a un mundo con costa, mar, un lago y zonas de campo, dejando espacio para que la ciudad crezca sobre él." No AI, real-data import or automatic city growth in this slice.
- S2 — Deterministically generate a local world model with a seed, surrounding terrain, coast/sea, one inland lake, rural fields and reserved buildable areas. Water and fields must stay out of the existing city footprint, fields/buildable areas must be dry, and source-city geometry/IDs/scenario bytes must not change. Reuse the city terrain sampler and match its height at the world/city seam.
- S3 — Render terrain, permanent water, fields and expansion annotations using the generated model, with readable materials and a world/city camera toggle. Sea/lake water must be clipped against their terrain, not float through dry land. Keep permanent water state and geometry separate from flood snapshots and rain volumes. Reuse shared visual helpers where safe without changing prior flood behavior.
- S4 — Provide seed/regenerate-environment and layer visibility controls, clear synthetic labels and explicit explanation that expansion zones are reserved annotations, not newly generated buildings. Keep flat/relief and flood-response controls working. Regeneration/terrain changes may rebuild/reset the demo, with that consequence documented; ordinary flood Reset must not erase permanent water or move the camera. World rendering resources must dispose cleanly.
- S5 — Verify determinism, seed variation, no source mutation, dry/non-overlapping areas, matched terrain seams, water/terrain consistency, default flood compatibility, controls markup and lifecycle/resource cleanup. Report browser/production-build proof honestly; no external dependencies or publishing.

Assumptions: an offline synthetic environment extends west of the city into the sea, east into an inland lake and north/south into dry rural/expansion areas. The starting city is unchanged; the environment seed changes surroundings, not its residents or roads. World hydrology (tides, lake inflow/outflow, coastal flooding) is deliberately not connected to the existing city-only flood solver. Layer toggles affect visibility, not physics.

## Tasks

- [x] T1 — S1,S2,S5 — inline: pure typed world model, seeded terrain/land-use generation and invariants/tests. No writer reason: renderer depends on this model; one connected behavior. Commit: none.
- [x] T2 — S3,S4,S5 — inline: 3D world layer, shared water visual helper, controls/camera integration, docs and tests. No writer reason: parent owns Scene seam and dependent renderer. Commit: none.
- [x] T3 — S1-S5 — verify: full checks, independent item3/item4 compatibility/lifecycle audit, local HTTP smoke and browser check if available. Commit: none.

## Log

- L1 — Original user clarification and authorization are quoted in S1; do not replace this with an AI disaster-planner roadmap.
- L2 — Existing working tree contains the completed flood-response feature. Do not stage, revert or commit it. Preserve city/simulation geometry and source data; add a separate local world view model and permanent water. Forecast about800 authored lines; no PR or chain authorized.
- L3 — Architecture: world terrain reuses the existing city grid and sampleTerrainHeight at the seam, with coarser surrounding cells. Permanent water is static world data; the existing solver remains city-only and unchanged. Route inline because these are dependent model/render/control seams, not independent parallel writer units. Tests first; independent verifier at feature end for shared render/lifecycle changes.

- L4 — T1/T2 observed RED for missing model/render/control modules, then focused7tests passed. Added seeded coast/basin/fields/reserves, shared triangle sampler, static clipped permanent water, camera modes and visibility/seed controls. World and city-only flood state remain separate; no underlying city/simulation changes. Existing water-normal function extracted unchanged into a shared visual helper. Webtypes and rootlint pass; fullchecks/independent verifier pending.

- L5 — Final suite155tests and all4types/rootlint/targetformat/diffchecks pass; frontendHTTP200 on the already-running user devserver (not started/stopped by this task). Independent verifier passed multi-seed flat/relief model, seam/dry-area/water-interior/source-hash/normal-baseline/resource probes; found one city-camera corner cropped at16:9. Parent reproduced RED (NDCy=-1.06499554), restored prior city offsets0.8/0.9/0.8, added all-four-corner regression, observedGREEN and independent targeted recheckPASS. No new sweep after correction. Original controller/engine hashes remain unchanged. Browser/WebGL unverified; productionbuild intentionally notrun to avoid disturbing live dev output. No commits/push; native review consent pending for the updated aggregate candidate.
