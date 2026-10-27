# Simulicity API

A minimal Fastify service with a liveness endpoint. There are no product routes, demo catalogs, database connections or external integrations.

## Run

From the repository root, run `pnpm dev` for both applications or `pnpm --filter @simulicity/api dev` for this service. For production-mode local checks, run `pnpm --filter @simulicity/api build`, then `pnpm --filter @simulicity/api start`.

The server reads the repository-root `.env` without overriding existing process environment values. All settings have defaults; no `.env` or API key is required.

| Variable       | Default                                       | Constraint                                                                |
| -------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| `HOST`         | `127.0.0.1`                                   | Nonempty bind address                                                     |
| `PORT`         | `4000`                                        | Integer, 1–65535                                                          |
| `LOG_LEVEL`    | `info`                                        | Pino level or `silent`                                                    |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated exact HTTP(S) origins; no wildcards, paths or credentials |

Do not expose this unauthenticated development API publicly. CORS is not authentication and does not prevent server-to-server requests.

## HTTP contract

`GET /health` returns `200`:

```json
{ "status": "ok", "service": "simulicity-api", "version": "0.1.0" }
```

Other application paths, including the removed `/api/v1/*` routes, return `404 NOT_FOUND`. CORS preflight handling remains infrastructure behavior, not a product route.

Every error uses `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`. The basic handlers retain validation errors (400), malformed JSON errors (400), a 64 KiB body limit (413), rejected browser origins (403), and generic unexpected failures (500) without internal details. There is no `NOT_AVAILABLE` product placeholder.

## Tests

From the root: `pnpm exec vitest run apps/backend`. Tests use Fastify injection, including test-only handlers for error cases; no socket or external service is required.
