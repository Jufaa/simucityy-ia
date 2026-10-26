# Simulicity API

Fastify exposes a read-only local demo catalog and an independent liveness check. No database, Meta API key, or geographic import is required to start.

## Run

From the repository root, run `pnpm dev` for both applications, or `pnpm --filter @simulicity/api dev` for this service. Production: `pnpm --filter @simulicity/api build`, then `pnpm --filter @simulicity/api start`.

The server reads the repository-root `.env` without overriding existing process environment values. Startup defaults to `http://127.0.0.1:4000`.

| Variable       | Default                                       | Constraint                                                                |
| -------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| `HOST`         | `127.0.0.1`                                   | Nonempty bind address                                                     |
| `PORT`         | `4000`                                        | Integer, 1–65535                                                          |
| `LOG_LEVEL`    | `info`                                        | Pino level or `silent`                                                    |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated exact HTTP(S) origins; no wildcards, paths or credentials |

Do not expose this unauthenticated development API publicly. CORS restricts cooperating browsers; it is not authentication and does not prevent server-to-server requests.

## HTTP contract

| Endpoint                      | Current behavior                                                              |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `GET /health`                 | 200, `{ "status": "ok", "service": "simulicity-api", "version": "0.1.0" }`    |
| `GET /api/v1/cities`          | 200, array of explicitly synthetic local demo cities                          |
| `GET /api/v1/cities/:id`      | 200 local demo city, or 404                                                   |
| `GET /api/v1/scenarios`       | 200, array containing the empty synthetic demo scenario                       |
| `POST /api/v1/scenarios`      | Validate shared scenario input, then 501; persistence not implemented         |
| `POST /api/v1/simulations`    | Validate `{ scenarioId }`, then 501; remote execution not implemented         |
| `GET /api/v1/simulations/:id` | Validate ID, then 501; run storage not implemented                            |
| `POST /api/v1/ai/analyze`     | Validate `{ scenarioId, question }`, then 501; provider calls not implemented |

Invalid inputs return 400. Request bodies are limited to 64 KiB (413). Unconfigured browser origins return 403. Every error uses `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`. Unexpected failures return a generic 500 without stack traces or internal error details. `NOT_AVAILABLE` means the operation is deliberately not implemented, not that a real simulation was attempted.

## Tests

From the repository root: `pnpm exec vitest run apps/api` and `pnpm --filter @simulicity/api typecheck`. Tests use Fastify injection; no listening socket or external service is needed.
