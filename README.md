# Simulicity IA

An AI-assisted urban simulation workspace for the Meta Global AI Developer Hackathon 2026. The intended MVP imports a real area, visualizes it in 3D, simulates flooding and synthetic population behavior, then compares interventions through Meta Model API / Muse Spark. **This repository implements the foundation, not that complete MVP. It is not an emergency-planning tool.**

## Quick start

Requirements: Node.js 22 (see `.nvmrc`), pnpm 10.32.1. Enable Corepack or install that pnpm version using your preferred Node version manager.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open http://localhost:3000. The root command starts both apps through Turborepo:

| Service                     | Default        | Dependency                                 |
| --------------------------- | -------------- | ------------------------------------------ |
| Next.js dashboard           | localhost:3000 | API for health; internet/WebGL for basemap |
| Fastify API                 | 127.0.0.1:4000 | No database or AI credentials              |
| Optional PostgreSQL/PostGIS | 127.0.0.1:5433 | Docker Compose, explicit local password    |

`Ctrl+C` stops the development group. If port 3000 is occupied, use `WEB_PORT=3100 CORS_ORIGINS=http://localhost:3100,http://127.0.0.1:3100 pnpm dev` without stopping another project. Next.js proxies `/api/health` to Fastify's `/health` on the server. The dashboard reports a real connection failure when the API is down, rather than pretending it is healthy. The map uses external OpenFreeMap/OSM tiles; without internet or WebGL it displays a warning. No Overpass imports run at startup.

## Implemented versus planned

| Available now                                                                               | Not implemented yet                                                       |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Responsive dark dashboard, MapLibre navigation and building display from the external style | Flood physics, earthquakes, fires, tornadoes                              |
| Local city lookup and one explicitly synthetic empty scenario                               | Real city import, DEM downloads, population/traffic/evacuation simulation |
| Fastify health, shared request/error contracts and unavailable responses                    | Scenario persistence, simulation HTTP execution, AI recommendations       |
| Pure TypeScript seeded empty-world lifecycle with tests                                     | Worker transport, background job scheduling                               |
| Bounded AI tool schemas and an unavailable Meta provider adapter                            | Real Muse Spark/Meta integration or arbitrary tool execution              |
| Optional Prisma metadata schema and PostGIS development service                             | Geospatial persistence, migrations, authentication                        |

The UI intentionally disables simulation/configuration controls that have no implementation. Unknown indicators show an em dash. `simulation-core` can count its actual empty arrays (zero entities) but those are not real-world city population estimates. Demo geography is synthetic and must not be presented as imported observations. Heights and occupancy may be unknown; OSM is not assumed to provide either.

## Workspace architecture

```text
apps/web                 Next.js App Router, React, Tailwind, shadcn-style UI, Zustand
apps/api                 Fastify server, config, CORS, errors, versioned modules
packages/shared          Zod schemas, shared types, explicit local demo records
packages/simulation-core Pure TypeScript deterministic lifecycle and hazard interface
packages/geo             Bounded import contracts, GeoJSON validation, local projection, demo
packages/ai-planner      Provider and controlled-tool contracts; no network calls
packages/database        Optional Prisma schema and PostGIS initialization SQL
```

Dependencies flow inward: apps consume shared/domain packages; simulation-core does not import React, Next.js or Fastify. Source-exported internal packages are typechecked by Turbo, transpiled by Next.js and bundled into the API build. They are private workspace modules, not published libraries. Three.js is installed for future visual effects but is not used to simulate physics.

Four developers can own web, API/persistence, simulation/geo, and AI integration separately. Coordinate changes to `shared` contracts and lockfiles. See [architecture decisions](docs/ARCHITECTURE.md).

## Environment

Copy `.env.example` to root `.env`; both applications explicitly load this file without overriding exported shell variables. Next.js public map settings are inlined at build time: rebuild production after changing them.

| Variable                                 | Purpose                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| HOST / PORT                              | API bind address and port; default 127.0.0.1:4000                        |
| LOG_LEVEL                                | fatal/error/warn/info/debug/trace/silent                                 |
| CORS_ORIGINS                             | Comma-separated exact HTTP(S) origins; no wildcard, paths or credentials |
| API_URL                                  | **Server only**, Fastify base URL used by Next.js health proxy           |
| NEXT_PUBLIC_MAP_STYLE_URL                | Browser-visible map style URL; default OpenFreeMap liberty               |
| NEXT_PUBLIC_INITIAL_LONGITUDE / LATITUDE | Validated WGS84 starting center; default Miami                           |
| POSTGRES_PASSWORD                        | Optional local Compose database password                                 |
| DATABASE_URL                             | Optional server-only Prisma PostgreSQL connection                        |
| META_API_KEY                             | Reserved server-only credential; not consumed by the placeholder adapter |

Never use `NEXT_PUBLIC_` for keys. The Meta adapter does not fabricate a URL, model ID or SDK. Consult official Meta documentation and confirm access before implementing real calls. No API key is required now, even if that variable is absent.

## API behavior

```bash
curl http://127.0.0.1:4000/health
# {"status":"ok","service":"simulicity-api","version":"0.1.0"}
curl http://localhost:3000/api/health
curl http://127.0.0.1:4000/api/v1/cities
curl http://127.0.0.1:4000/api/v1/scenarios
```

| Route                       | Initial behavior                                        |
| --------------------------- | ------------------------------------------------------- |
| GET /health                 | 200 validated health                                    |
| GET /api/v1/cities          | Local demo list, not a global city search               |
| GET /api/v1/cities/:id      | Demo city or 404                                        |
| GET /api/v1/scenarios       | Local empty demo scenario                               |
| POST /api/v1/scenarios      | Validated body, 501 NOT_AVAILABLE                       |
| POST /api/v1/simulations    | Validated `{ scenarioId }`, 501 NOT_AVAILABLE           |
| GET /api/v1/simulations/:id | Validated ID, 501 NOT_AVAILABLE                         |
| POST /api/v1/ai/analyze     | Validated `{ scenarioId, question }`, 501 NOT_AVAILABLE |

Errors follow `{ error: { code, message, requestId } }`. Requests are limited to 64 KiB. Invalid input is rejected, not converted into fabricated success. CORS is an exact allowlist, not authentication: the unauthenticated development API should remain on loopback and must not be deployed as a privileged public service.

## Commands and checks

```bash
pnpm dev             # Both apps
pnpm build           # Production web and bundled API; domain typechecks
pnpm lint
pnpm typecheck
pnpm test            # Vitest across apps and packages
pnpm format:check
pnpm format          # Mutates source formatting; run before verification
```

GitHub Actions installs with the frozen lockfile and runs all checks plus production build, without a database or Meta keys. For production locally after build, run `pnpm --filter @simulicity/api start` and `pnpm --filter @simulicity/web start` in separate terminals.

## Optional database

Choose `POSTGRES_PASSWORD` and matching `DATABASE_URL` in root `.env`, then:

```bash
docker compose up -d db
pnpm db:generate
pnpm db:validate
pnpm db:push
```

The database scripts load root `.env`. `db:push` explicitly changes your local schema: do not point it at production. PostGIS is enabled by initialization SQL only when a **new** Docker volume is created. Existing volumes require an administrator to enable the extension explicitly. Prisma stores application metadata; spatial types/queries will require explicit SQL or a deliberate integration later. No database connection is created by importing packages or starting the apps. Stop with `docker compose down`; do not remove volumes unless you intend to delete local data.

## Extending simulation safely

1. Add a `HazardSystem` implementation and a factory in your simulation module. `initialize(world)` and `update(world, deltaTime)` must use only supplied world state and injected seeded randomness.
2. Pass the factory keyed by hazard type to `new SimulationEngine(scenario, factories)`. Enabled hazards without a factory throw explicitly.
3. Use seconds for timesteps and metres for local positions; keep WGS84 conversion at the geo boundary. Call `step`, `pause`, `resume`, `reset`, and `getState` from a future worker message handler. Timers/transports are not part of this core.
4. Test identical inputs/seeds/timestep sequences, reset behavior and invalid inputs. Do not use `Math.random`, wall clocks or network I/O in systems.
5. Expose future capabilities through validated API/AI tools only after implementation and budget/approval enforcement exist. The AI executor is a contract, not an execution sandbox that already works.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for units, provenance and integration boundaries.
