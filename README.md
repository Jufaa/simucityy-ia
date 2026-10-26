# Simulicity IA

An experimental urban simulation platform for the Meta Global AI Developer Hackathon 2026: explore real geography, simulate a disaster, model synthetic evacuation, and compare interventions proposed by a Meta AI agent.

**Current stage: runnable foundation, not a completed flood simulator.** The map is an external geographic basemap; the local scenario is an explicitly synthetic, empty demo. There is no flood physics, population simulation, real city importer, or connected AI agent yet. This is not a scientific prediction or a certified emergency-management tool.

## Start here

After cloning the repository, open a terminal at its root. You need:

- Node.js **22.23.2**, as recorded in `.nvmrc`.
- pnpm **10.32.1**, as recorded in `package.json`.
- Internet access and a WebGL-capable browser for the external basemap.
- Docker **only if** you want the optional local database.

```bash
node --version
pnpm --version
pnpm install --frozen-lockfile
```

Copy `.env.example` to `.env` at the repository root **only if `.env` does not already exist**:

```bash
cp .env.example .env
pnpm dev
```

Open **http://localhost:3000**. The root command starts Next.js and Fastify together; stop them with `Ctrl+C`. No database, Meta account, or API key is needed for this first run.

| Service           | Default address       | Purpose                                   |
| ----------------- | --------------------- | ----------------------------------------- |
| Web               | http://localhost:3000 | Dashboard and server-side health proxy    |
| API               | http://127.0.0.1:4000 | Health and local demo catalogs            |
| Optional database | localhost:5433        | PostgreSQL/PostGIS for future persistence |

### If port 3000 is already in use

Do not stop another project's server. In Bash/Zsh, use:

```bash
WEB_PORT=3100 \
CORS_ORIGINS=http://localhost:3100,http://127.0.0.1:3100 \
pnpm dev
```

Open http://localhost:3100. Alternatively, set those two values in `.env`, which also works without shell-specific syntax. Use the same web port in the checks below. To change the API port, update `PORT` and the matching `API_URL`.

## First-run checklist

- [ ] The dashboard opens and shows **API online**.
- [ ] The map loads; zoom, pan and rotate it. Building extrusion depends on the provider's data and zoom level.
- [ ] Searching `Miami` shows the local demo. Another city shows no matching demo, not an invented import.
- [ ] Selecting a hazard changes its preview only; no simulation starts.
- [ ] Playback, infrastructure editing and unimplemented settings are visibly disabled.
- [ ] Unknown metrics remain unavailable rather than displaying fabricated results.
- [ ] The layout remains usable in a narrow browser window.

The initial HTTP smoke checks passed, but visual/WebGL interaction still requires this browser check. External tiles are not bundled for offline use. A basemap on screen does **not** mean its buildings, population or terrain have been imported into the engine.

## Verify the project

Run from the repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

The foundation passed these commands. GitHub Actions runs the same checks with a frozen install, without a database or AI credentials. A successful build does not replace browser testing or validate scientific accuracy.

For focused tests:

```bash
pnpm exec vitest run packages/simulation-core
pnpm exec vitest run packages/geo packages/ai-planner
pnpm exec vitest run apps/api
pnpm exec vitest run apps/web
```

Current tests cover seeded reproducibility, pause/reset, detached snapshots, coordinate validation, GeoJSON normalization, bounded AI tool inputs, API validation/CORS/errors and the health proxy. Playwright interaction tests and physical/evacuation invariants are **planned**, not installed or implemented yet.

### Check frontend-to-backend communication

With `pnpm dev` running, open another terminal:

```bash
curl http://127.0.0.1:4000/health
curl http://localhost:3000/api/health
curl http://127.0.0.1:4000/api/v1/cities
curl http://127.0.0.1:4000/api/v1/cities/miami-demo
curl http://127.0.0.1:4000/api/v1/scenarios
```

Both health endpoints should return:

```json
{ "status": "ok", "service": "simulicity-api", "version": "0.1.0" }
```

The Next.js endpoint calls Fastify on the server, validates the response and returns a sanitized `502` if the upstream API is unavailable. It is not a second simulation backend.

Check that unavailable work does **not** report success:

```bash
curl -i http://127.0.0.1:4000/api/v1/simulations \
  -H 'Content-Type: application/json' \
  -d '{"scenarioId":"miami-empty-demo"}'
```

Expected: **501**, with error code `NOT_AVAILABLE`. An empty JSON body should instead produce **400**. An unknown city should produce **404**:

```bash
curl -i http://127.0.0.1:4000/api/v1/cities/not-a-city
```

## What exists today

| Area       | Implemented                                                                                                                   | Still pending                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Web        | Dark responsive dashboard, MapLibre integration, Zustand preview state, reusable shadcn-style UI primitives, health indicator | Water/agent layers, charts, active playback, inspection and scenario comparison        |
| API        | Fastify app factory, health, local catalogs, validation, exact-origin CORS, 64 KiB body limit, structured logs/errors         | Persistence, imports, simulation execution and AI orchestration                        |
| Shared     | Zod contracts, geographic/local coordinates, entity types, provenance, demo records                                           | Versioned real-world scenario package and richer domain contracts                      |
| Simulation | Empty-world lifecycle, seeded PRNG, hazard factory interface, snapshots and basic counters                                    | Flood grid, populated worlds, routing, evacuation, Worker transport and replay storage |
| Geography  | Bounded importer/elevation/graph interfaces, supported GeoJSON validation, local projection, synthetic sample footprints      | OSM/DEM downloading, topology repair, graph construction and terrain ingestion         |
| AI         | Provider interface, unavailable Meta adapter, allowlisted bounded tool schemas and executor contracts                         | Real model calls, tool dispatch, enforced execution budgets and comparative runs       |
| Database   | Optional Prisma metadata schema, Compose service and PostGIS initialization SQL                                               | Application persistence routes and geospatial queries/migrations                       |

Three.js is installed for future effects, not used for physics. Recharts and Playwright are roadmap choices, not current dependencies. An interface is not an implemented feature.

## Project map and architecture

```text
apps/web/                 Next.js App Router, React, Tailwind, Zustand, MapLibre
apps/api/                 Fastify server, config, errors and versioned modules
packages/shared/          Zod schemas, shared types and local demo records
packages/simulation-core/ Pure TypeScript lifecycle, world, hazards and metrics
packages/geo/             Import contracts, GeoJSON, projection and synthetic demo
packages/ai-planner/      Provider/tool contracts; no real provider calls
packages/database/        Optional Prisma schema and PostGIS initialization
```

```text
Browser → Next.js dashboard → /api/health proxy → Fastify /health
                ↓                                    ↓
           shared contracts ← simulation-core / geo / ai-planner
                                                     ↓ future, optional
                                                database / PostGIS
```

**Keep the current architecture unless the team explicitly agrees to change it.** The supplied master guide proposes a Next.js-only server and different package/endpoint names; this repository already uses a separate Fastify API. Do not create a second simulation backend or duplicate the engine in Route Handlers. Future Worker and Node runners should call the same pure TypeScript package.

Internal packages export TypeScript sources: Next.js transpiles them, the API bundles shared code with tsup, and Turbo coordinates checks. They are private workspace packages, not published libraries. See [technical decisions and units](docs/ARCHITECTURE.md) and the [API-specific guide](apps/api/README.md).

## Four-person work split

This is the proposed split from the master guide, mapped to **existing** paths. Everyone participates in integration and review.

| Owner                  | Main responsibility                                                                      | Starting points                                 | Deliverable for the next stage                                   |
| ---------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| A — Geo/data           | Select the area, inspect OSM/DEM quality, normalize geography and prepare the road graph | `packages/geo`, `packages/shared`               | A versioned, attributed, validated real scenario                 |
| B — Flood              | Terrain grid, rainfall, stable volume exchange, thresholds and conservation tests        | `packages/simulation-core/src/hazards`, `world` | A reproducible experimental flood system                         |
| C — Population/routing | Citizen state machine, routes, shelter allocation and evacuation metrics                 | `packages/simulation-core`, `packages/shared`   | Synthetic agents that reroute and respect blocked roads/capacity |
| D — Web/AI/integration | Map layers, controls, Worker/Node adapters, Meta tools, integration and demo             | `apps/web`, `apps/api`, `packages/ai-planner`   | A visible end-to-end flow and bounded comparative agent          |

Agree on shared schemas, scenario versions and ownership before editing common files. Owners B and C both work in the simulation package: coordinate exact files rather than editing the same engine/world contracts independently. Create agent/routing modules when they contain real behavior; do not pre-create empty directories.

### Working agreements

1. Start from an updated shared baseline and work on a focused branch.
2. Reuse `packages/shared`; do not copy competing `Scenario` or `Citizen` interfaces into apps.
3. Pair behavior changes with deterministic tests. Keep scenario data provenance and units explicit.
4. Coordinate dependency changes and commit the updated lockfile; do not regenerate it unnecessarily.
5. Run formatting **before** final checks. `pnpm format` modifies files; `pnpm format:check` does not.
6. Keep unavailable actions explicit. Never present mocked AI responses or synthetic measurements as real results.
7. Review before merging. The initialization belongs to one PR; publishing and opening it remain the repository owner's decision.

## MVP roadmap — not implemented yet

The supplied master guide describes the target below. It does not authorize silently replacing current contracts or imply these features already exist.

1. **Prepared real area:** approximately 500 × 500 m, preferably Miami only if suitable terrain data exists. Validate a fallback area before inventing missing data. Preload assets to avoid live import dependencies during the demo.
2. **Experimental flood:** a terrain/water grid with rainfall, simultaneous neighbor updates from the previous state, nonnegative depths, stable timesteps and an auditable volume balance. Report building **exposure**, not computed structural destruction.
3. **Synthetic evacuation:** 100–300 citizens, at least two shelters, explicit reaction/mobility parameters, A*/Dijkstra routing, rerouting, capacity reservations and a stranded state when no route exists.
4. **Responsive visualization:** Worker calculation, sampled snapshots, water/roads/agents layers, accessible legends, inspection and meaningful KPIs. Server-side comparative runs should not require an open browser tab.
5. **Controlled Meta agent:** verify the eligible model/API, run a baseline, test two or three bounded interventions, and explain only metrics returned by actual runs. Compare the same event, seed, population and initial conditions except for the intervention.
6. **Demo readiness:** stabilize the scenario, audit attribution/costs, test the judge's setup, record a three-minute walkthrough and prepare authentic precomputed runs as a fallback.

Full-city simulation, calibrated traffic, real individual population tracking, high-fidelity multi-hazard physics, certified predictions and training a model from scratch are outside this MVP. Rust/WASM, Unity, Kafka and additional services are not needed for the current foundation.

### Future acceptance tests

Add these alongside the corresponding implementation; they do **not** pass today simply because contracts exist:

- No unexplained water creation; depths stay nonnegative and volumes balance against logged inputs/outputs.
- A flooded road crosses a documented threshold and becomes unavailable to routing.
- Citizens never cross blocked edges; full shelters reject extra allocations; unreachable agents are counted as stranded.
- Identical inputs and seeds reproduce metrics; interventions can be inspected and replayed.
- AI-reported numbers exactly match tool results.
- Imported scenarios preserve attribution, units and coordinate metadata.
- The UI stays responsive while the Worker calculates.

The first complete vertical slice is: load an attributed real neighborhood → configure rainfall → run a deterministic Worker → observe a simulated blocked road and citizens rerouting → inspect metrics. The current empty-world demo does not meet that definition yet.

## Data and simulation contracts

- **Current source of truth:** `packages/shared/src/index.ts`. The master guide's illustrative interfaces are proposals, not drop-in replacements. Agree on additive changes/versioning before implementing richer worlds.
- **Geography:** WGS84 (`EPSG:4326`), decimal degrees; GeoJSON uses `[longitude, latitude]`.
- **Simulation:** local metric coordinates, x east / y north / z up; seconds for time, metres for length/depth, integer persons for population/capacity.
- **Projection limits:** the current local approximation rejects points beyond 50 km and origins outside ±85° latitude. It is not survey-grade; choose an appropriate reviewed projection for the real scenario.
- **Unknowns:** missing heights, occupancy and elevation are not zero. Preserve nullable values and distinguish observed, derived and synthetic attributes.
- **Provenance:** current contracts record source/license/kind and optional notes. Real scenario ingestion must additionally agree on download date, resolution, coverage, units, vertical datum and schema version; these are not all implemented fields yet.
- **Determinism:** use injected seeded randomness, never `Math.random`, wall clocks or network calls inside a simulation system.

To extend the current lifecycle, implement `HazardSystem.initialize(world)` and `update(world, deltaTime)`, supply a factory keyed by hazard kind to `SimulationEngine`, and test it. Enabled hazards without an implementation throw explicitly. `step`, `pause`, `resume`, `reset` and detached `getState` snapshots exist; populated-world loading and Worker messaging still need design and implementation.

### Geographic sources and attribution

Use [OpenStreetMap licensing and attribution guidance](https://www.openstreetmap.org/copyright) before distributing OSM-derived assets. For US terrain, inspect [USGS 3DEP](https://www.usgs.gov/3d-elevation-program) coverage and product metadata. A terrain elevation model is not a building height layer or a water-depth result. FEMA maps may inform exposure checks; they are not a substitute for a temporal flood solver.

Do not query Overpass at application startup or depend on live imports during the demo. The eventual scenario bundle should contain validated terrain, roads, buildings, synthetic population and metadata; no real `/scenarios/miami-demo` bundle is shipped yet. External map tiles remain an independent network dependency until an appropriate fallback is designed.

## Environment and troubleshooting

Both apps load root `.env` without overriding exported shell values. Public map settings are bundled at build time, so rebuild production after changing them.

| Variable                                     | Meaning                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `WEB_PORT`                                   | Frontend port; default 3000                                             |
| `HOST` / `PORT`                              | API address; default 127.0.0.1:4000                                     |
| `API_URL`                                    | Server-only API base URL for the health proxy                           |
| `CORS_ORIGINS`                               | Exact comma-separated HTTP(S) origins; include the actual frontend port |
| `LOG_LEVEL`                                  | fatal/error/warn/info/debug/trace/silent                                |
| `NEXT_PUBLIC_MAP_STYLE_URL`                  | Public HTTPS map style; defaults to OpenFreeMap liberty                 |
| `NEXT_PUBLIC_INITIAL_LONGITUDE` / `LATITUDE` | Public validated starting center; defaults to Miami                     |
| `POSTGRES_PASSWORD` / `DATABASE_URL`         | Optional local database credentials/connection                          |
| `META_API_KEY`                               | Reserved server-only credential; current adapter does not consume it    |

| Symptom                          | Check                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Port already in use              | Choose a free web port and matching CORS origins; do not launch a second instance                             |
| API offline / proxy 502          | Check API terminal, `PORT`, `API_URL` and `curl /health`; the browser health indicator polls every 30 seconds |
| Browser request returns 403      | Confirm the exact origin, including protocol and port, in `CORS_ORIGINS`                                      |
| Map missing or partially loaded  | Check WebGL, network access and style URL; the API does not supply map tiles                                  |
| Simulation/AI returns 501        | Expected: the route is intentionally not implemented                                                          |
| Invalid configuration at startup | Check field names and ranges in `.env`; credentials are not printed in validation errors                      |

Never put secrets in `NEXT_PUBLIC_*` variables or commit `.env`. CORS is not authentication: keep this unauthenticated development API on loopback. Future AI/import endpoints need execution budgets, rate limits, coordinate/size limits, controlled downloads and SSRF protection before public exposure.

## Current API reference

| Route                         | Behavior                                       |
| ----------------------------- | ---------------------------------------------- |
| `GET /health`                 | 200 validated service health                   |
| `GET /api/v1/cities`          | Local demo array, not global city search       |
| `GET /api/v1/cities/:id`      | Demo city or 404                               |
| `GET /api/v1/scenarios`       | Local empty demo array                         |
| `POST /api/v1/scenarios`      | Validated body, then 501                       |
| `POST /api/v1/simulations`    | Validated `{ scenarioId }`, then 501           |
| `GET /api/v1/simulations/:id` | Validated ID, then 501                         |
| `POST /api/v1/ai/analyze`     | Validated `{ scenarioId, question }`, then 501 |

Fastify errors follow `{ error: { code, message, requestId } }`; request bodies are limited to 64 KiB. The guide's `/api/simulation/run` and `/api/ai/plan` routes are suggestions, not existing endpoints. Choose and document the final API together instead of implementing both naming schemes.

## Optional database

Skip this section for normal frontend/API development. If needed, set a local `POSTGRES_PASSWORD` and matching `DATABASE_URL` in root `.env` first. The example URL contains a placeholder, not a usable password; URL-encode special characters in connection credentials.

```bash
docker compose up -d db
pnpm db:generate
pnpm db:validate
pnpm db:push
```

`db:push` changes the selected database schema: use a disposable local database, never production. PostGIS initialization runs only for a new Docker volume; existing volumes require explicit administrator setup. Prisma currently models application metadata, not spatial queries. Stopping with `docker compose down` preserves data; deleting volumes removes it.

## Local production smoke test

Stop development instances first to free their ports:

```bash
pnpm build
```

Then use separate terminals for:

```bash
pnpm --filter @simulicity/api start
```

```bash
pnpm --filter @simulicity/web start
```

Repeat the health checks and browser checklist. This is a local production build, not a deployment. Hosting, deployment configuration and the public judge-facing demo remain future work.

## Meta integration and event checklist

The intended model in the supplied guide is Muse Spark, subject to actual API access and event eligibility. The adapter currently reports unavailable. Before implementing calls, verify the exact model identifier, authentication, endpoint, tool format and quotas using current official documentation and the team's console. The [Meta Model API cookbook](https://github.com/meta-models/meta-model-cookbook) is a starting reference, not proof of this team's access or hackathon eligibility.

The proposed preparation-to-submission schedule in the master guide should follow the milestones above. **Do not treat its dates, scoring weights or stated deadline as verified rules.** Before publishing/submitting, the team must confirm the current official participant guide and announcements, including:

- Eligible Meta model/API and available credits/quotas.
- Allowed team size and the event's new-work window.
- Public repository, deployment, attribution and video requirements.
- Final deadline, timezone conversion and any rule updates.

The specific event guide is not included in this repository. No submission or deployment is performed by the setup commands.
