# Build a recognizable small synthetic district

Objective: turn the existing grid into a small seeded district with parcels, varied buildings, parks and sidewalks, represented in both JSON and 3D.
Delivery: local working tree, preserve existing edits and legacy grid output; no staging, commits or push. Runner: Vitest / TypeScript / ESLint / Prettier. Forecast: approximately 800 authored lines plus generated fixture.

## Specs

S1. User asked: "con lo q tenemos podes armar literalmente una ciudad peqeñaa?" and authorized the proposed outcome with "hacelo".
S2. Accepted proposal: "Varios edificios por manzana, dividida en parcelas", "Mezcla de alturas y tamaños", "Algunas manzanas destinadas a plazas y espacios abiertos", "Veredas y una representación más clara de calles y refugios". These differences must be actual generator data, not disconnected decorations in Three.js.
S3. Preserve the existing seeded grid path, HTTP endpoint, previous fixture and tested outputs. Add an explicitly requested district layout with recorded settings/version and validated relationships. Use a 500 x 500 metre district as proposed; no Meta, climate, physical traffic or manual editor in this task.
S4. The scene must request the richer layout, render its data and frame the complete district. JSON import/export/regeneration must work with both old grid and new district. Reject invalid layouts without silently modifying accepted input.

## Tasks

- T1 [S1,S2,S3] inline, complete: district parcel/park/sidewalk generation, backward-compatible types and semantic validation; RED observed, focused generator/HTTP tests passed. Commit: none.
- T2 [S2,S3,S4] inline, complete: endpoint layout selection, version-aware JSON regeneration, separate district fixture and export flag; focused checks passed; full suite 105/105 passed. Commit: none.
- T3 [S1,S2,S4] inline, complete: render varied district buildings, parks, sidewalks and shelter markers; camera/cleanup; focused checks passed; full suite 105/105 passed. Commit: none.
- T4 [S1,S3,S4] inline, checking: functional and independent verification passed; production frontend build unavailable in isolated snapshot; native consent pending. Commit: none.

## Log

L1. User original request: "con lo q tenemos podes armar literalmente una ciudad peqeñaa?". Assistant proposed multiple buildings per block, varied dimensions/heights, parks, sidewalks and visible shelters, starting with a 500 x 500 metre seeded district. User authorization: "hacelo".
L2. Baseline has Scene road meshes and two road geometry tests uncommitted, plus an unrelated pnpm-lock.yaml edit from Three.js installation. Preserve those edits. Existing page.test.ts expects the obsolete placeholder and fails on baseline HEAD; previously reproduced separately. It must be updated proportionally when the scene's visible loading/legend behavior is changed by T3.
L3. Route: sequential inline because model, generator, schema, API and renderer share one evolving contract; no disjoint writer batch. Preserve the user's established no-commit/no-push boundary. New district mode is opt-in so existing city tests/JSON consumers retain legacy results.

L4. T1/T2 initial RED: four district/HTTP failures; frontend layer RED: module absent. Implementation now passes 105 tests across 16 files, TypeScript in four packages and lint. District fixture scenarios/small-district.json (seed42) has348 buildings,13 parks,361 parcels,400 sidewalk strips,200 residents. Existing grid fixture/output retained. Initial mesh checks ran without browser tools; later real headless Chromium QA verified the live scene. Independent contract verification pending.

L5. Real Chromium screenshots on the existing local frontend/backend confirmed seed123 produces332 buildings,17 parks,400 sidewalks and2 shelter markers with complete camera framing. Before/after inspection caught depth striping; camera near plane increased0.1->2 to restore depth precision, clearing the artifact. Screenshot QA used a fresh isolated browser profile, no existing authenticated session.
L6. Independent copied-source verifier confirmed old geometry and fixture compatibility, district determinism, HTTP modes and meshes. It reported infeasible margin21 accepted on import and park/sidewalk overlap accepted; one correction batch plus regression test resolved both. Targeted independent recheck2/2 passed, and parent reran the same probe successfully. Final full suite107/107, types4packages, lint and formatting pass.
L7. Optional isolated production build: shared/API builds passed; frontend Turbopack could not resolve next/package.json because dependency symlinks escape the copied workspace root; hazards build interrupted. Production frontend build is NOT verified; no live development output was touched. No installs, network service calls, staging, commits, push or deployment. Native assessment high due to modified export CLI; supplemental review consent remains pending.
