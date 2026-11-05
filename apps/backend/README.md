# Simulicity API

Fastify backend for synthetic city generation and optional AI workflows.
City and hazard generation do not require model inference. AI routes use
Meta by default and keep provider credentials on the server.

## Run locally

Follow the [root setup guide](../../README.md#getting-started) first:
install dependencies from the root, copy `.env.example` to `.env` in
`apps/backend` only if absent, and generate `BYOK_MASTER_KEY`.

From the repository root:

```bash
pnpm dev                              # frontend and backend
# Or, in a separate terminal:
pnpm --filter @simulicity/api dev     # backend only
```

The backend reads **`apps/backend/.env`**, without overriding existing
process environment variables. It defaults to <http://127.0.0.1:4000>.

For production-mode local checks:

```bash
pnpm --filter @simulicity/api build
pnpm --filter @simulicity/api start
```

## Configuration

| Variable          | Default / requirement                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `HOST`            | `127.0.0.1`; keep local development on loopback.                                                                    |
| `PORT`            | `4000`; integer from 1 to 65535.                                                                                    |
| `LOG_LEVEL`       | `info`; Pino level or `silent`.                                                                                     |
| `CORS_ORIGINS`    | `http://localhost:3000,http://127.0.0.1:3000`; comma-separated exact HTTP(S) origins, no wildcard/path/credentials. |
| `BYOK_MASTER_KEY` | **Required**, even without AI: 64 hex characters for AES-256-GCM. See `.env.example` for the generation command.    |
| `META_API_KEY`    | Optional Meta Model API key, starting with `LLM_`.                                                                  |
| `META_MODEL`      | Optional; client default is `muse-spark-1.3`. Requires provider access to that model.                               |
| `BYOK_ENABLED`    | `false`; do not enable on a public deployment without authentication.                                               |
| `AI_API_KEY`      | Optional alternative server key; takes precedence over `META_API_KEY`.                                              |
| `AI_BASE_URL`     | Optional OpenAI-compatible provider URL; defaults to the Meta endpoint when omitted.                                |
| `AI_MODEL`        | Optional alternative model identifier; falls back to `META_MODEL`, then the client default.                         |

For an alternative provider, configure its key, endpoint, and supported
model together. Do not assume a different provider accepts the Meta
model identifier. BYOK user keys still use the Meta endpoint.
The application does not use a coding client's `MODEL_API_KEY`.
Restart the backend after changing `.env`. Never commit real credentials.

## Security

- API keys never reach the browser: the frontend only calls this API, and
  `META_API_KEY` / user keys stay server-side. Keys at rest are encrypted
  with AES-256-GCM (`BYOK_MASTER_KEY`).
- Abuse protection is built in (`src/plugins/security.ts`): per-IP rate
  limits on `/ai/*` (30/min), `/ai/keys` (10/min) and city generation
  (30/min), plus baseline security headers on every response. City
  generation is also bounded by domain limits (streets, blocks and
  terrain samples are rejected before heavy allocation).
- BYOK endpoints (`/ai/keys`, `/ai/chat`, userId key resolution) are
  disabled by default (`BYOK_ENABLED=false`) because the API has no
  authentication: a userId alone is an identifier, not a credential.
  Enable BYOK only on a trusted network until real authentication exists.
- The server key can run on any OpenAI-compatible inference provider
  (`AI_API_KEY` + `AI_BASE_URL` + `AI_MODEL`, taking precedence over
  `META_API_KEY`): useful to spend hackathon partner credits (Fireworks,
  Baseten, Modal) hosting Meta open-weights models once deployed, with
  Meta's API remaining the default. BYOK keys always use the Meta API.
- Provider errors are logged server-side and answered with generic
  messages; upstream error text is never returned to clients.
- Before any public deployment: terminate TLS in front of the API, set
  `CORS_ORIGINS` to the exact public origin, and review rate limits for
  the deployment's proxy setup (`request.ip` is the bucket key).

## HTTP contract

| Method | Path                      | Behavior                                                  |
| ------ | ------------------------- | --------------------------------------------------------- |
| GET    | `/health`                 | Liveness response; does not verify model access.          |
| POST   | `/api/v1/cities/generate` | Generate a validated synthetic city; no model call.       |
| POST   | `/ai/city-plan`           | Propose a bounded city plan from an optional description. |
| POST   | `/ai/interventions`       | Propose bounded interventions from measured metrics.      |
| POST   | `/ai/citizen`             | Narrate a citizen's supplied simulation state.            |
| POST   | `/ai/report`              | Write an emergency report from measured outcomes.         |
| POST   | `/ai/keys`                | Store/replace an encrypted user key; opt-in BYOK only.    |
| DELETE | `/ai/keys/:userId`        | Delete a user key; opt-in BYOK only.                      |
| POST   | `/ai/chat`                | Legacy auto/guided BYOK chat; opt-in BYOK only.           |

City request examples and schema details are in the
[city contract guide](../../docs/CITY_JSON_3D.md).
The four AI workflow routes use the configured server key unless an
available, enabled BYOK key is selected. Unconfigured AI returns
`503 AI_NOT_CONFIGURED`; provider failures return `502 AI_PROVIDER_ERROR`
or `504 AI_TIMEOUT`. The **frontend** converts failed AI requests into
labeled deterministic fallbacks; the backend does not return a successful
model response when inference fails. Disabled BYOK endpoints return 404.

`GET /health` returns:

```json
{ "status": "ok", "service": "simulicity-api", "version": "0.1.0" }
```

Unknown paths return 404. General API error handling includes validation
errors, a 64 KiB request-body limit, and rejected browser origins. Inspect
`src/modules/ai/routes.ts` and `src/modules/cities/routes.ts` for exact
request schemas; do not send secrets in query strings.

## Verification

From the root:

```bash
pnpm exec vitest run apps/backend
pnpm test
pnpm typecheck
pnpm lint
git diff --check
```

Backend tests use Fastify injection and mocked provider responses; they
do not prove live Meta access. Verify a real model call only with an
explicitly authorized key and budget. `/health` alone proves liveness,
not inference or end-to-end UI operation.
