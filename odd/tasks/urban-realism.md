# Add four layers of urban detail

Objective: make the synthetic district more recognizable through building architecture, furnished parks, street details and local procedural materials/lighting.
Delivery: local working tree only, no staging/commits/push. Preserve grid 1.0.0 and basic district 1.1.0. Tests: Vitest, types, lint, formatting, isolated compatibility probes and real browser QA. Forecast: approximately 1200 authored lines plus generated fixture.

## Specs

S1. User authorization: "hace eso q me dijiste esas 4 tasks". The preceding proposal listed "Edificios con identidad", "Plazas diseñadas", "Calles y veredas", "Iluminación y materiales".
S2. Building identities: houses with pitched roofs/patios; apartments with floors/windows/balconies; shops with ground-floor storefronts/entrances/signage. Use procedural facade textures rather than a mesh for every window. Store architecture choices in scenario data.
S3. Parks: pedestrian paths, trees that do not block paths, benches, lighting, a central feature and entries from sidewalks. Relevant placement data must be seeded and stored, not randomized by the renderer.
S4. Streets: curbs, crossings, lane markings and building access paths, without implementing cars or calibrated traffic. Retain centreline graph semantics and preserve simulation geometry.
S5. Lighting/materials: shadows and distinct asphalt/concrete/masonry/vegetation materials, without external assets, network calls or new dependencies. Keep synthetic/experimental labels and the current Three.js stack.
S6. Preserve legacy JSON/API generation and regeneration. New detail profile must be opt-in and versioned. Keep the flood module untouched; decorative amenities are not flood obstacles or simulated water.

## Tasks

- T1 [S1,S2,S6] inline, complete: versioned optional urban profile, architecture metadata and strict validation/roundtrip tests. Commit: none. Evidence: urban/HTTP RED observed; full suite116/116, types4packages, lint/format passed.
- T2 [S1,S3,S4,S6] inline, complete: seeded park and street furnishing geometry, semantic validation, HTTP/CLI flag and separate fixture. Commit: none. Evidence: urban/HTTP RED observed; full suite116/116, types4packages, lint/format passed.
- T3 [S1,S2,S3,S4,S5] inline, complete: procedural facade/roof/balcony/storefront rendering, instanced furnishings, shadows/materials, cleanup and browser checks. Commit: none. Code/geometry tests and production Chromium screenshot passed.
- T4 [S1,S6] inline, complete: full verification, backward-compatibility probe, independent verifier and delivery explanation. Commit: none.

## Log

L1. Original user request: "hace eso q me dijiste esas 4 tasks". User's preceding question about generator changes was interrupted, so explain model additions and backward compatibility clearly at delivery.
L2. Workspace clean at HEAD 751d2529a67522485764958c13a7a4e12a5bd8be. Existing grid/district fixtures and tests are baseline. Prior candidate review choices are not consent for the new candidate.
L3. Design: detailLevel urban is opt-in on layout district and records generator version1.2.0. Basic district and grid remain byte-compatible. Geometry stays bounded; roof height is included in building height. Park furnishings and street details are separate optional district data, not physical simulation changes. Default homepage will request urban details.
L4. Route: inline sequential work because the same scenario schema/renderer contract connects all four blocks; no independent writer batch. No commits/publishing under the user's established boundary.

L5. Implemented opt-in generator1.2.0 profile with architecture, yards, park paths/furnishings and instanced street details. Initial urban and renderer tests observed RED, then full116tests/19files passed, TypeScript4packages, lint and format pass. CLI test maxBuffer raised to3MiB because the bounded urban JSON exceeds the child-process default1MiB (runtime JSON limit remains2MiB). Baseline fixtures unchanged. Independent compatibility/production build/browser QA pending.

L6. Independent verifier passed20 compatibility/invalid-input probes and100 city/renderer tests against baseline751d252, with unchanged legacy fixture bytes. Parent reran20probes successfully. Production build passed4/4packages; only existing hazards output-declaration warning. Old build actor was interrupted after stale sandbox instructions; parent ran the same build under current runtime permissions. Next generated next-env paths were restored to their pre-build dev values.
L7. Production Chromium/SwiftShader screenshot at1440x1000 successfully loaded500m seed123:332buildings,17parks,2shelters; roofs, facade windows, park paths/trees, curbs/crossings and shadows visible. Preview used isolated temporary SQLite data; no Meta calls. Owned servers stopped. Native candidate assessment/consent remains separate from functional completion.
