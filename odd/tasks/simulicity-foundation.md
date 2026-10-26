# Simulicity IA foundation

Objective: executable, honest simulation scaffold. Branch: feat/simulicity-foundation.
Delivery: single-pr (explicit user exception to slicing); forecast ~2,000 authored lines; actual ~3,030 (lockfile excluded). Runner: Vitest; pnpm root checks.

## Specs

- S1: "el proyecto se llama simulicity-ia no el nombre urbanforge". pnpm workspaces, Turbo, strict TypeScript; Next.js/React/Tailwind/shadcn/UI; Fastify/Zod; optional PostgreSQL/PostGIS/Prisma. No database required to boot.
- S2: "No generar métricas falsas presentándolas como resultados reales." Dark responsive dashboard, MapLibre navigation and 3D buildings with available data; configurable Miami starting location. Disabled future controls. Next.js health communication.
- S3: "Implementar completamente `/health`." Versioned cities/scenarios local reads; explicit unavailable errors for unimplemented writes/simulation/AI. Safe CORS, body limits, validated environment, structured logging/errors.
- S4: "Separar coordenadas geográficas WGS84 de coordenadas métricas locales usadas por el motor de simulación." Shared City, Building, Road, Terrain, Citizen, Shelter, Hazard, Scenario, SimulationRun, SimulationMetrics, AIIntervention schemas; provenance and unknown values.
- S5: "Inicializar un escenario vacío." Deterministic seeded core: initialize, step, pause, reset, snapshot, metrics. Extensible HazardSystem. No disaster physics or people engine.
- S6: "No consultar Overpass masivamente al iniciar la aplicación." Geo importer/elevation/graph contracts, GeoJSON normalization, local projection, explicitly synthetic demo. AI provider/tool contracts validated and bounded; no arbitrary code or real network calls.
- S7: "pnpm build", "pnpm typecheck", "pnpm lint" y "pnpm test". Install stable compatible dependencies, lockfile, CI, .env.example, README and docs/ARCHITECTURE.md; runtime smoke proof.
- S8: "la iniciliazacion y todo esto qe sea todo en un pr". Single local feature branch; no publishing or PR creation authorized.

## Tasks

- T1 [S1,S4,S7,S8] inline — workspace/contracts/environment; verified; commit recorded in closing log. Risk: item 5 (dependencies/CI).
- T2 [S2] delegated — frontend/dashboard/map/health; implemented, automated checks pass; visual/WebGL check unavailable; commit recorded in closing log. Writer reason: independent frontend and API units launched together on disjoint surfaces.
- T3 [S3] delegated — API/routes/validation/tests; verified; commit recorded in closing log. Risk: item 2 (CORS/secret boundaries). Writer reason: independent parallel units.
- T4 [S5,S6] inline — simulation/geo/AI contracts and tests; verified; commit recorded in closing log.
- T5 [S7] delegated verification after own checks — install/build/runtime/docs and final independent high-risk verification; automated proof passed, native review consent pending. Risk: items 2,5.

## Log

- L1: User requested a runnable initial urban simulation monorepo, with exact constraints captured above from the supplied initialization prompt. Full user prompt is retained in the session transcript. No physical flood, people or full AI agent implementation is authorized.
- L2: User correction verbatim: "la iniciliazacion y todo esto qe sea todo en un pr". Single-PR delivery accepted; no remote mutations.
- L3: Existing repository inspected at 2c757e8: README only, no existing code to overwrite. Node 22.23.2 and pnpm 12.15.0 available. Shared package source exports will be bundled by consumers; API production build bundles workspace sources. English artifacts; product Simulicity IA.
- L4: No existing behavior baseline beyond README; deterministic tests will be observed RED before implementing core/API behavior. Configuration/docs have structural-check exception.
- L5: Parent observed RED: core/geo/AI suites failed collection before their modules existed; after implementation 12 focused tests passed. API/web functional RED was unavailable before workspace linking; workers reported this explicitly. Initial aggregate typecheck exposed MapLibre 6's removed default export; switched to namespace/named exports and typecheck passed.
- L6: Root lint, 7-package typecheck and all 32 tests pass. Prettier excludes Next-generated next-env.d.ts. Root pnpm dev booted both apps with WEB_PORT=3100 because port 3000 belongs to another project; did not stop that project. Turbo strict environment initially stripped WEB_PORT; added explicit dev passThroughEnv and root .env cache input. Real HTTP: API health, Next health proxy, dashboard HTML, city/scenario lists all 200. Browser inventory is empty; visual/WebGL interaction remains unverified.

- L7: Independent verification completed in fresh /tmp scratch. Frozen install (network fallback for one uncached tarball), lint/typecheck/32 tests/format/Prisma validate+generate passed; rejected API requests leave local catalogs byte-identical. Sole blocker: tsup CLI --no-external failed parsing. Parent reproduced, replaced with tsup.config.ts noExternal, and same verifier rechecked only blocker: root build and compiled API health/cities on4001 passed. Workspace root pnpm build subsequently passed for all7 packages. Docker Compose configuration validates; optional database runtime was not started.
- L8: Final source normalization preceded verification. Next-generated type imports staged after production build. No browser is exposed to this session; HTML and provider style HTTP200 do not prove WebGL rendering or navigation. Native review is due (items2,5), effective RDD on, candidate consent not yet granted. No push or PR creation.

- L9: T1–T4 source implementation commit: 40b015eb597134dc48ecf4e9f89bf56623481541. All initialization remains one PR slice against baseline 2c757e8; authored additions approximately3,030 plus generated lockfile. Final independent checks and root build passed; visual map proof and native candidate consent remain pending.
