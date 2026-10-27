# Simulicity IA

A minimal starting point for a self-paced team project. The repository currently contains an empty frontend, a health-only API and their connection. Product behavior will be designed and implemented by the team, one capability at a time.

## Start here

Use Node.js **22.23.2** (`.nvmrc`) and pnpm **10.32.1** (`package.json`). From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

The workspace and lockfile use `apps/frontend`, `apps/backend` and `packages/shared`. The lockfile records the exact resolved dependency versions so local development and CI install the same dependency graph.

Open **http://localhost:3000**. The homepage shows **Simulicity IA** and **Frontend implementation pending.** The command starts Next.js and Fastify together; stop both with `Ctrl+C`.

No database, Docker, external account or API key is required. Defaults work without an `.env` file. To customize them, copy `.env.example` to `.env` only if `.env` does not already exist; do not overwrite local settings.

| Application | Default address       | Current responsibility                    |
| ----------- | --------------------- | ----------------------------------------- |
| Web         | http://localhost:3000 | Neutral page and server-side health proxy |
| API         | http://127.0.0.1:4000 | Liveness check                            |

If port 3000 is occupied, leave the other process alone and use:

```bash
WEB_PORT=3100 CORS_ORIGINS=http://localhost:3100,http://127.0.0.1:3100 pnpm dev
```

To change the API port, update `PORT` and the matching `API_URL` together. The [API guide](apps/backend/README.md) documents configuration and errors.

## What remains

```text
apps/
  frontend/  Next.js, React, Tailwind, neutral page and health proxy
  backend/   Fastify server, configuration, errors, CORS and /health
packages/
  shared/    Health response schema and TypeScript type only
docs/
  TEAM_CHECKLIST.md  Future work and team responsibilities
  API_CATALOG.md     External services to evaluate, not integrations
  ARCHITECTURE.md    Current boundaries and future decisions
```

This is a monorepo: the applications and internal shared library live in one repository. Folder names and package names are separate: the frontend package is still `@simulicity/web`, and the backend package is still `@simulicity/api`.

### Shared code and empty folders

`packages/shared` is not another server. It exports `healthSchema`, which validates the health response with Zod, and `Health`, its inferred TypeScript type. The backend and Next.js health proxy import the same definition rather than duplicate it. There are no city, scenario or simulation contracts yet.

Empty component and state directories contain `.gitkeep` files so Git can retain the folder structure. These files do not execute anything and can be removed once real files are added. A `map` or `simulator` folder does not mean that feature exists.

### Development tools

| Tool              | Purpose                                                     |
| ----------------- | ----------------------------------------------------------- |
| pnpm workspaces   | Manage applications and internal packages with one lockfile |
| Turbo             | Coordinate development, build and type-check tasks          |
| TypeScript        | Check types during development                              |
| ESLint / Prettier | Check code quality and formatting                           |
| Vitest            | Run automated tests                                         |
| GitHub Actions    | Run quality checks; no deployment is configured             |

There are **no product demos, scenario models or routes, simulation engine, geographic utilities/importers, map configuration, AI adapter, Prisma schema or database container** in the current baseline. Map/3D/state/UI dependencies without consumers were removed. No stored database data was changed.

## Current API reference

With both applications running:

```bash
curl http://127.0.0.1:4000/health
curl http://localhost:3000/api/health
```

Both return:

```json
{ "status": "ok", "service": "simulicity-api", "version": "0.1.0" }
```

The web endpoint validates the upstream response and returns `502 API_UNAVAILABLE` when the API is unavailable or invalid. This connection does not add a visible status widget to the homepage.

Previous `/api/v1/*` demo and placeholder routes were removed; they return `404 NOT_FOUND`. No simulation, persistence or AI operation is registered.

## Verify the baseline

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

GitHub Actions runs these checks with a frozen dependency install. Tests cover the neutral homepage, shared health contract, API health/configuration/CORS/errors, absence of product routes and health proxy success/failure. A build is not evidence of a working simulator.

The local, user-provided `Ideadelproyect.md` is excluded from automatic formatting so its original text and layout are preserved. The source code, maintained guides and configuration remain subject to formatting checks.

## Build deliberately

Start with the [team checklist](docs/TEAM_CHECKLIST.md): agree on the idea and user journey, approve mockups, then define the first necessary shared contracts and implement a small feature.

The [API catalog](docs/API_CATALOG.md) is a list of options to evaluate, not installed integrations or mandatory dependencies. The [architecture](docs/ARCHITECTURE.md) describes only the current baseline and identifies future choices. `Ideadelproyect.md` is user-provided local planning material and may not exist in a fresh clone.

Database, geography, simulation and AI modules should be introduced when their first agreed requirement needs them. Their names and boundaries are proposals, not existing code. This experimental project is not a scientific prediction or certified emergency-management tool.
