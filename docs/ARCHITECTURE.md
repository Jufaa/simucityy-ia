# Minimal architecture

The current repository is infrastructure only: an empty frontend, a health-only backend and a shared health contract. The team will introduce product architecture when requirements are agreed, rather than inherit speculative implementations.

## Current boundaries

```text
Browser → Next.js page (apps/frontend)
Browser → Next.js /api/health → Fastify /health (apps/backend)

Both server-side handlers import the health contract from packages/shared.
```

| Area              | Responsibility                                                                        |
| ----------------- | ------------------------------------------------------------------------------------- |
| `apps/frontend`   | Next.js App Router, neutral page, Tailwind setup and server-side health proxy         |
| `apps/backend`    | Fastify factory/server, environment validation, CORS, basic errors, logs and liveness |
| `packages/shared` | Zod health response schema and inferred TypeScript type only                          |

The page has no map, simulator controls or health polling widget. The health proxy validates the API response, uses a three-second timeout, disables caching and returns a generic 502 on failure. No browser request needs a database or external key.

### Frontend

The homepage renders only the project title and implementation-pending text. `src/app/api/health/route.ts` delegates to `src/lib/health.ts`, which calls the backend from the Next.js server. No domain state store, component system or renderer is implemented. `.gitkeep` files retain empty organizational directories; they are not runtime code.

### Backend

`src/app.ts` creates the Fastify application and registers only `GET /health`, plus infrastructure handling for CORS and errors. `src/server.ts` reads configuration, starts listening and handles shutdown. Keeping construction separate from listening allows request tests with Fastify injection without opening a network port.

Fastify is the current Node.js HTTP framework, not Python's FastAPI. It is an initial infrastructure choice, not a requirement of a future simulation engine. Product logic should not depend on the HTTP framework.

### Shared contract

`packages/shared/src/index.ts` exports only `healthSchema` and `Health`. Zod validates response data at runtime; the inferred TypeScript type checks code during development. The backend validates its health output and the frontend's server-side proxy validates the response it receives. The shared library does not start a process, connect to storage or send requests.

Domain contracts belong here only when actual consumers need to share an agreed definition. No scenario, citizen, building or AI-tool model is currently defined.

## Tooling kept

- pnpm workspaces and Turbo coordinate development, build and type checks.
- Shared TypeScript is source-exported; Next.js transpiles it and the API build bundles it.
- ESLint, Prettier and Vitest provide quality checks; CI also verifies the build.
- Configuration defaults work without `.env`; local overrides remain server-side unless explicitly introduced otherwise.
- The development API binds to loopback by default. CORS is not authentication; public deployment requires a separate security decision.

### Workspace paths and package names

The directories are `apps/frontend` and `apps/backend`, but their manifest names remain `@simulicity/web` and `@simulicity/api`. Package-filter commands use those manifest names, not the folder names. `@simulicity/shared` is the only internal library consumed by either application.

The lockfile importer paths match the current application directories. Its resolved dependency versions are unchanged by the directory alignment; frozen installation checks that manifests and lockfile agree.

## Deliberately absent

Product models, demo catalogs and `/api/v1/*` placeholders were removed. There is no geographic package, simulation engine, AI provider, database package, Prisma schema or Docker database configuration. Unused visual dependencies and map settings were removed as well.

No existing database, volume or local `.env` was modified. Historical files in `odd/tasks` record earlier work; they are not the current implementation specification.

## Future decisions

The [team checklist](TEAM_CHECKLIST.md) preserves the work to discuss and divide: product scope, mockups, domain contracts, data, simulation, presentation, optional persistence and optional AI. Paths such as `packages/geo` and `packages/simulation-core` in planning documents are proposed locations, not existing modules.

Keep domain computation independent from rendering if a simulation engine is introduced. Choose persistence and external providers only when a concrete requirement needs them. These are directions for discussion, not implemented capabilities.
