# Visual improvements for real and synthetic cities

Objective: apply the seven proposed presentation improvements (per-building tint, roof colours, lighting/atmosphere, dressed streets, lit windows, vegetation/furnishing reuse, instanced rooftop detail) without changing simulation truth, contracts or network sources.
Branch: optimizacion. Delivery: local working tree only, no staging/commits/push (project contract). Tests: Vitest focused + full, typecheck, lint, prettier on changed files, browser inspection. Forecast: ~700 authored lines.

## Specs

S1. User asked: "q cosas podemos hacer para mejorar la parte visual?" and then authorized all of it: "podes hacer todo eso?" / "si".
S2. Per-building deterministic tint variation within the existing sand/brick/stone palettes; stable across regeneration (seeded by building id, never Math.random in the renderer).
S3. Roof colour variety for flat caps and gable roofs, deterministic per building.
S4. Lighting/atmosphere: subtle clear-weather fog matched to the sky colour; storm fog behaviour unchanged.
S5. Streets dressed with existing street-detail data where present; real imported zones without detail data keep current road rendering (no invented simulation geometry).
S6. Some windows lit with emissive presentation only; no citizen/simulation state changes.
S7. Vegetation/furnishing: reuse the existing urban detail layer data where present; do not invent placement data in the renderer for imported zones.
S8. Rooftop/per-building detail for exact footprints must not grow draw calls materially: reuse instanced/chunked buckets where detail is added.
S9. Presentation only: never mutate solver snapshots, terrain truth, bridge-deck or evacuation state. Own and dispose new Three.js resources. Keep procedural fallback.

## Tasks

- T1 [S2,S3,S8] inline, complete: deterministic building tint + roof palettes via chunked instances, tests. Commit: none.
- T2 [S4] inline, complete: clear-weather fog in Scene, storm toggle preserved, tests if applicable. Commit: none.
- T3 [S5,S6,S7] inline, complete: lit windows + deterministic real-park trees added; street details already rendered where data exists — real zones generate none because streetDetails are axis-aligned blocks and imported roads are rotated segments (recorded limitation, no invented geometry). Commit: none.
- T5 [S10] inline, complete: warm subtle tints + coherent weighted roof palette. Commit: none.
- T6 [S11] inline, complete: textured windows on exact footprints via scaled UVs. Commit: none.
- T7 [S12] inline, complete: smooth relief-water shading (presentation only, solver untouched). Commit: none.
- T8 [S13] inline, complete: performance — bound per-building rooftop detail meshes, keep adaptive pixel ratio, verify draw calls/FPS in browser. Commit: none.
- T9 [S14] inline, complete: road skirt + polygon offset, water sliver suppression, re-verify. Commit: none.
- T10 [S15] inline, complete: paved urban ground for real zones (grass only in parks), converter/render sidewalks, intersection plates in road layer. Commit: none.
- T11 [S15] inline, complete: crosswalks at intersections + verification (tests, tsc, lint, browser). Commit: none.
- T12 [S16] inline, complete: true-intersection-only plates/crosswalks with 30 m clustering, crosswalk detail culling, x1.2 real presentation scale. Commit: none.
- T4 [S9] inline, complete: full verification (test/typecheck/lint/prettier/diff-check), browser inspection default + storm, report limitations. Commit: none.

S10. User showed a real-zone screenshot and asked: "porqe se ve asi?" then "Aplica todo, y dsp arregla rendimiento la idea es qe ande lo mas fluido posible" — fix pastels, grey windowless footprints, triangular water, incoherent roofs, hard patches.
S11. Exact footprints must show facade windows like instanced rectangles.
S12. Relief water must read as a smooth sheet, not faceted triangles; solver output unchanged.
S13. Performance is a goal: minimise draw calls and per-frame cost; fluidity over detail density.

S14. User screenshot after the first fixes: "se sigue viendo asi" — green terrain shards still cut across draped roads and thin blue water slivers still spike across streets. Fix ground/road coplanar fighting (road skirt + polygon offset) and suppress near-zero-depth water slivers, presentation only.

S15. User: "Agrega todo lo necesario para qe se cree perfecto, y no exista esos parches." — real zones must render complete urban fabric: paved block surface instead of grass gaps, sidewalks, correct intersection plates (no overlapping segment boxes reading as patches), crosswalks/detail where derivable, all instanced/budgeted for performance. Real scale must not change; simulation centrelines unchanged.

S16. User screenshot of the new fabric: "perfecto, el rpoblema me parece q es tamaño ahora... debeiramos hacerlo mas grande si o si" then "arregla todo, y si hay q agrandar agrandalo, quiero qe qede prolijo". Fix crosswalk/plate spam at intermediate nodes, cluster nearby intersections, hide crosswalks beyond detail distance, and enlarge real-zone street presentation moderately (x1.2) without changing simulation widths/centrelines.

## Log

L1. Original user request: "q cosas podemos hacer para mejorar la parte visual?" then "podes hacer todo eso?" then "si".
L2. Workspace clean on branch optimizacion at feature start. Prior context: real zones come from Nominatim/Overpass/Terrarium; colours are local (real-city-model facade rule, urban-materials palettes).

L3. Engram mirror unavailable in this runtime (mem_save unsupported); mirror pending, local doc is authoritative.
L4. T1-T3 implemented inline: building-palette.ts (stable id tint/roof), instanced-chunks optional per-instance colors, urban-building-layer tint/roof buckets/lit windows/footprint tint, Scene clear-weather fog (storm fog unchanged), real-city-model deterministic park trees on a separate random stream (citizens unchanged). Focused tests: 5 files, 21 tests passed at T3 checkpoint.
L5. Verification: focused 7 files/34 tests passed; component groups b-c 79, d-m 38, organic bridge/integration 15 passed; s-w + packages + backend 178 passed, 1 failed (backend city-json CLI subprocess, unrelated frontend diff; pnpm itself is blocked in this sandbox by a read-only store lock, so the repo-local vitest binary was used). Frontend tsc, ESLint on changed files, Prettier on changed files and git diff --check passed. organic-city-model.test.ts exceeds the 9 s sandbox window and was not re-observed. Browser: headless Chromium (SwiftShader) against the existing local server rendered the default synthetic city with varied roofs/facades and rain running; 1 FPS is software-rendering only, not GPU evidence. Real imported zone was verified by converter/detail tests, not by browser click-through.
L6. Draw calls: no new per-building meshes were added for roofs/tints (chunked buckets per roof colour, at most 5 extra groups); lit windows are one chunked instanced bucket. Exact-footprint detail growth was bounded by reusing roof materials per colour, not per building.

L7. User screenshot diagnosed: independent RGB tints created pastel casts; exact footprints use plain materials; relief water uses per-triangle faceted normals over a 20 m grid; civic rooftop details are per-building meshes (~3,100 draw calls documented for the real district).
L8. Fixes applied: warm correlated tints (r>=g>=b, 0.88-1.00 brightness); weighted roof draw (neutrals dominate, terracotta ~10%); exact footprints now use the facade canvas texture with wall UVs divided by the 3 m module; relief water uses flat up normals (normal map keeps surface detail), solver untouched; decorative rooftop props subsampled to <=120 groups and no longer cast shadows; pixel ratio starts at 1.25; shadow map 1024 for extents >700 m.
L9. Verification: focused suites passed (28 tests); component groups 110 + 68 passed; tsc/ESLint/Prettier/git diff --check passed. Browser (SwiftShader, default synthetic city): draw calls 897 -> 679 and triangles 119,985 -> 114,367 in the metrics overlay after the rooftop budget; 1 FPS is software rendering only. Real-zone browser click-through still pending; covered by unit tests.
L10. Diagnosis of the follow-up screenshot: draped road boxes (top only +0.06 m over the DEM ground, 0.05 thick) left coplanar z-fighting and wedge gaps at segment joints, showing grass triangles on asphalt; relief water emitted hairline clipped fans under 2 cm deep as blue spikes. Fixes: road boxes now carry a 0.3 m skirt with the same +0.06 top (both createRoadMesh and the instanced layer), asphalt material gets polygonOffset -2, flood material polygonOffset -4, and relief triangles whose deepest vertex is <0.02 m are suppressed. Presentation only; solver and road centreline semantics unchanged. Existing road/terrain tests were updated to the new skirt invariant (top still clears terrain >=0.05 m).
L11. Verification: road/terrain/relief/flood suites 20 tests passed; tsc, ESLint, Prettier, git diff --check passed. Headless Chromium screenshot of the default synthetic city renders unchanged (679 draw calls). In-app browser automation was unavailable in this runtime, so the real-zone click-through remains user-side verification.
L12. Urban fabric for real zones: ground base is now paved concrete (cloned texture, 96x tiling; parks stay green on top, synthetic cities keep grass); createRoadLayer optionally grows concrete sidewalks from each road profile, round junction plates (sidewalk + asphalt discs) at every shared graph node, and 4-bar zebra crosswalks on every arm of 3+ arm intersections — all chunked instances, so draw calls stay bounded. Scene passes the sidewalk material only for city.real. Road centrelines, profiles, scale and solver data unchanged.
L13. Verification: road/terrain/real-model/district/detail suites 21 tests passed; component groups 118 + 61 passed; tsc, ESLint, Prettier, git diff --check passed. Headless screenshot of the synthetic default is unchanged (679 draw calls, no sidewalk regression because the material is real-only). Real-zone browser click-through still pending user-side (interactive browser unavailable in this runtime); geometry is covered by create-road-mesh tests (sidewalk layer, junction plates, 16 crosswalk bars at a 4-way node).
L14. Cleanup + enlargement: junction plates and crosswalks now only at true intersections (3+ arms); straight intermediate nodes get none (tested); crosswalk sets cluster within 30 m so dual-carriageway node splits draw one set (tested, 16 bars for two junctions 10 m apart); crosswalks join the distance-culled details, so they vanish from district-wide views instead of spamming; real zones render streets/sidewalks/plates/crosswalks at 1.2x presentation scale via createRoadLayer presentationScale (Scene passes 1.2 only for city.real). Simulation widths, profiles and centrelines unchanged.
L15. Verification: create-road-mesh + detail-culling 10 tests passed; tsc, ESLint, Prettier, git diff --check passed; headless synthetic screenshot unchanged at 680 draw calls. Real-zone click-through remains user-side.
