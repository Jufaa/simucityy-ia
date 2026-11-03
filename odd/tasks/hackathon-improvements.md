# Hackathon improvements

Objective: make the real-zone demo read as a coherent, pitch-ready product: coherent surroundings, guided demo story, visible impact metrics, data-driven narrative (no paid AI), one-page report export.
Branch: optimizacion. Delivery: local working tree only, no staging/commits/push. Tests: Vitest focused, tsc, eslint, prettier, browser screenshot.

## Specs

S1. User screenshot: imported city floats rotated over synthetic sea/lake/grass. When a real zone is loaded, synthetic world surroundings (sea/lake/fields) must not render; an urban paved context apron replaces them.
S2. Guided demo: one entry point that walks context -> event -> impact with camera/speed changes, no manual exploration needed.
S3. Impact metrics visible and large: evacuated people and %, exposed buildings, blocked segments, max water, elapsed simulated time (existing comparison before/after panel stays).
S4. Narrative generated deterministically from simulation data; no LLM or paid API.
S5. One-page report download (text) with city, event, metrics and narrative.
S6. Presentation only: no solver, scenario or contract changes.

## Tasks

- T1 [S1] inline, complete: skip world layer for real zones + paved context apron; hide world controls for real zones.
- T2 [S3,S4] inline, complete: impact-panel component + pure summary/narrative builder with tests.
- T3 [S2] inline, complete: guided demo steps builder + panel wired to existing camera/speed controls.
- T4 [S5] inline, complete: report builder + download button with tests.
- T5 [S6] inline, complete: focused tests, tsc, eslint, prettier, diff-check, synthetic browser screenshot; real-zone check user-side.

## Log

L1. User: "Hace todo eso. para mejorar" after the hackathon proposal list (coherent real surroundings, guided demo, impact metrics, no-paid-AI narrative, one-page report).

L2. Implemented: Scene skips createWorldLayer for city.real (synthetic sea/lake/fields no longer under imported zones), hides WorldControls there, and adds a paved 'real-context-apron' plane (+800 m, -0.5 m, presentation only). New modules: impact-summary.ts (summary + deterministic no-LLM narrative), impact-panel.tsx (evacuated/exposed/blocked/max water/time in large type), demo-tour.ts/demo-tour-panel.tsx (context->event->impact with world/city camera and 30/300/3 speeds), report.ts (one-page text report + Blob download). A floating 'Demo guiada' button opens the panel and starts step 1; report button lives in the panel. Comparison before/after panel unchanged and linked from the report. Verification: hackathon-panels 4 tests + road/flood/comparison 18 tests passed; tsc and ESLint passed; Prettier applied; headless synthetic screenshot unchanged (680 draw calls, world surroundings intact for synthetic). Real-zone surroundings/demo remain user-side click-through.

- T6 [S7] inline, complete: cut exact-footprint budget 200 -> 80. Ghost blocks, apron and zone label were added then REMOVED at user request (L4): real zones generate exactly their selected square, nothing around it.
  S7. User accepted: performance first (real zone showed 5,178 draw calls / 23 FPS), ghost city context + textured apron with soft edges, labels. Verified constraint: preloaded Eixample source carries no street `name` tags (TAG_WHITELIST strips them), so labels use the real zone name; adding `name` to the import whitelist enables street names for future fresh imports only.

L3. T6 done: MAX_EXACT_FOOTPRINTS 200 -> 80 (landmarks always exact; the rest keep instanced rectangles, saving up to ~240 footprint meshes plus their shadow pass). Real-zone apron now uses the cloned concrete texture (64x) in a lighter urban tone instead of flat grey. New real-context.ts: generateGhostBlocks (deterministic ring of muted blocks, 7-19 m, never under the district) rendered as ONE InstancedMesh at 0.55 opacity, plus a canvas sprite zone label with city.real.name — 2 extra draw calls total. 'name' added to the OSM TAG_WHITELIST so future fresh imports can carry street names; the preloaded Eixample JSON has none, so street-name labels remain impossible there (honest limitation). Verification: real-context + urban-building-layer + real-city-import + hackathon-panels 20 tests passed; tsc/ESLint/Prettier/git diff --check passed; synthetic screenshot unchanged at 681 draw calls. Real-zone draw-call count after the cap is user-side (target: hundreds less; the remaining thousands come from chunked detail buckets, not footprints).

L4. User rejected the ghost-context look ("saca esto qe generaste al costado") and the zone label, and required the imported city to generate only inside its selected square — no apron, no surroundings. Removed: real-context.ts/test (deleted), the +800 m apron, ghost InstancedMesh and label sprite from Scene. Kept: synthetic world layer still skipped for real zones, so outside the square there is only sky/fog background; the zone picker already crops 250-1500 m squares and the converter generates exactly that extent.

- T7 [S8] inline, complete: fixed-size zone selection (1000 m), automatic city framing on import, earlier far-detail culling.
  S8. User clarified the plane model: the selection square is always the same size; the user only moves where it sits ("es algo constante el tamaño del plano"). No resizing, no stretching arbitrary selections to fit (metric scale is preserved).

L5. T7 done: zone-picker exports ZONE_SIDE_IN_METERS = 1000; resize corner handle, resize drag mode and the size slider are gone — the square only moves. The importer always crops bboxAroundCenter(center, ZONE_SIDE_IN_METERS) for both OSM search and uploaded GeoJSON plans, and its copy/docs (docs/REAL_CITY.md, AGENTS.md) state the fixed size. Scene: applyImportedCity now forces the 'city' camera view so the imported square is framed on load. detail-culling: details now hide beyond 0.6x view extent (was 1.1x) so far detail chunks stop drawing earlier. Verification: zone-picker + detail-culling + real-city-importer + real-city-import + hackathon-panels 14 tests passed; tsc, ESLint, Prettier and git diff --check passed. Real-zone visual/FPS confirmation remains user-side.

L6. User screenshot: imported zone rendered as an irregular diamond blob with buildings sticking out past the square and floating where the ground ends. Root cause (verified in real-city-model.ts): building footprints crossing the bbox border were kept whole (only fully-outside AABBs were skipped) and parks were never clipped; roads were already segment-clipped. Fix: Sutherland-Hodgman clipPolygonToExtent applied to building footprints, courtyard holes, building:part rings and parks; when a rotated containing rectangle would still poke past the square, the axis-aligned bounds of the clipped footprint are used instead, so rendered boxes stay inside too. Scene adds a 'real-base-plinth' box exactly config-sized under real zones (top at min DEM elevation) so the square reads as a clean maqueta with nothing outside it. New regression test 'clips footprints and parks that cross the square border'. Verification: 39 focused tests passed (real-city-model/import, zone-picker, detail-culling, importer, hackathon-panels, road-mesh), tsc/ESLint/Prettier/git diff --check passed, headless synthetic screenshot unchanged (680 draw calls). Saved zones and the Eixample preload re-convert through the same path, so they get the clipping automatically. Real-zone visual confirmation remains user-side.
