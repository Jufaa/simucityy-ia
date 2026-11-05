# Simulicity IA

> A synthetic 3D city simulator for exploring the impact of natural
> hazards (floods, earthquakes, tsunamis, strong wind) with same-seed
> before/after comparison and AI-assisted interventions.

**Demo video:** _\[https://www.youtube.com/watch?v=zcfY3OEeHbQ]_

![Simulicity IA overview](assets/MainMenu.png)

_The Simulicity IA start screen: choose to generate a city with AI, a
random seed, or import a real map._

---

## What is it?

Simulicity IA is a city simulator built with **Three.js**, **Next.js**,
and **React**. It procedurally generates synthetic cities (terrain,
water, streets, buildings, services, and citizens) and lets you run
**deterministic hazards** on them. Because generation is deterministic
per seed, you can compare the **before and after** of the same city
under the same hazard, and measure the impact on buildings, population,
and services.

The project also includes a **real-district importer from
OpenStreetMap**, and optional AI features for city plans, mitigation interventions,
citizen narratives, and emergency reports. Each has a deterministic local
fallback when the AI service is unavailable.

> **Disclaimer**: this is an experimental project. It is not a
> scientific prediction tool or a certified emergency-management system.
> Coefficients are demonstrative and not calibrated.

---

## Features

- **Procedural city generation**: terrain, rivers, lakes, streets,
  blocks, buildings, parks, services, and population.
- **Deterministic hazards**: rain/flood, river overflow, tsunami,
  earthquake, and strong wind.
- **Before/after comparison** with the same seed: same scenario, same
  buildings, reproducible results.
- **Real-district import** from OpenStreetMap.
- **Optional AI** (Meta Model API, default model `muse-spark-1.3`)
  for city plans, bounded mitigation proposals, citizen narratives, and
  emergency reports. Failed or unconfigured AI requests use a labeled
  local fallback; the simulator, not the model, calculates outcomes.
- **Measured metrics**: exposed buildings, trapped people, max water
  depth, resilience score, etc.
- **Simulation panel** with generation controls, hazard selection, and
  comparison.

---

## Screenshots

### City generation and simulation

![City generation](assets/simulacionEnCurso.png)

_A synthetic city generated procedurally, ready for simulation. The top
bar shows the active hazard and the right panel displays live simulation
metrics._

### Simulation summary

![Simulation summary](assets/ResumenSimulacion.png)

_After running a hazard, the app shows a detailed summary: evacuated
population, trapped people, collapsed buildings, max water depth, and an
analysis of the impact._

### Hazards and evacuation

![Hazard and evacuation](assets/TerremotoEvacuacion.png)

_Earthquake simulation at street level: buildings shake, debris falls,
and citizens evacuate across the bridge._

### Real district import

![OSM import](assets/ImportacionBarcelona.png)

_Importing a real district (Barcelona's Eixample) from OpenStreetMap.
The 3D model is generated automatically from the map data._

### AI-assisted interventions

_\[Pending capture: assets/ai.png\]_

_The intervention agent proposes bounded mitigations based on measured
metrics, labeled "Sin IA (local)" when no API key is set._

---

## How it works (technical summary)

1.  **Deterministic generation**: a seeded PRNG produces terrain,
    streets, blocks, buildings, and population. The same seed always
    produces the same city.
2.  **Hazard simulation**: each hazard applies a deterministic model on
    the city (water depth, structural damage, evacuation, etc.).
3.  **Comparison**: because the city is reproducible, the "before" and
    "after" states can be rendered side by side.
4.  **Optional AI**: the backend (or the local fallback) proposes plans
    and interventions from the measured metrics. Interventions are
    applied, the simulation is re-run with the same seed, and results
    are compared.

---

## Stack

| Layer                       | Technology / location                                           |
| --------------------------- | --------------------------------------------------------------- |
| Frontend                    | Next.js, React, Tailwind, Three.js (`apps/frontend`)            |
| Backend and city generation | Fastify and TypeScript (`apps/backend`)                         |
| Hazards                     | Pure TypeScript (`@simulicity/hazards`)                         |
| Shared contracts            | Zod (`@simulicity/shared`)                                      |
| Workspace                   | pnpm + Turbo                                                    |
| Optional AI                 | Meta Model API through the server-side OpenAI-compatible client |
| Key storage                 | Local SQLite; opt-in BYOK with AES-256-GCM encryption           |

---

## Getting started

Run commands from the repository root. Use Node.js **22.23.2** (see
`.nvmrc`) and **pnpm 10.32.1** (see `package.json`).

### 1. Install and configure the backend

```bash
pnpm install --frozen-lockfile
```

If `apps/backend/.env` does not exist, copy
`apps/backend/.env.example` to `apps/backend/.env`. **Do not overwrite an
existing configuration.** Generate a local encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the generated value into `BYOK_MASTER_KEY` in `apps/backend/.env`.
It must contain exactly **64 hexadecimal characters**. This setting is
required to start the backend even when AI and BYOK are not used.
It is an encryption key, **not** your Meta API key.

### 2. Start both applications

```bash
pnpm dev
```

- Web: <http://localhost:3000>
- Backend: <http://127.0.0.1:4000>
- Health check: <http://127.0.0.1:4000/health>

The backend is needed for synthetic city generation as well as AI.
Starting only `@simulicity/web` does not start that API. Alternatively,
run these commands in separate terminals:

```bash
pnpm --filter @simulicity/api dev
pnpm --filter @simulicity/web dev
```

### 3. Enable Meta AI (optional)

Obtain a Meta Model API key with access to the selected model. In
`apps/backend/.env`, keep your generated `BYOK_MASTER_KEY` and add:

```dotenv
META_API_KEY=LLM_REPLACE_WITH_YOUR_KEY
META_MODEL=muse-spark-1.3
BYOK_ENABLED=false
```

Replace the placeholder with your real key, then restart the backend.
`META_MODEL` is optional; the client defaults to `muse-spark-1.3`.
Access, quotas, and charges depend on your provider account: do not assume
that inference is free or unlimited.

**Never commit `.env`, put secrets in `NEXT_PUBLIC_*` variables, or paste
keys into screenshots or the city-description chat.** The browser calls
the backend; only the backend holds the model key. A coding-assistant
`MODEL_API_KEY` does not configure the application.

Leave `BYOK_ENABLED=false`: the server key works without enabling visitor
key storage. The BYOK API has no authentication and must not be enabled on
a public deployment. Advanced provider settings and API routes are in the
[backend guide](apps/backend/README.md).

### Check AI versus local fallback

Create a city from a description such as "A green city with low buildings
and a wide river", then build the returned plan. After simulating a hazard,
run an intervention iteration and inspect its source and rationale.
The intervention history distinguishes **Meta AI** from **No AI (local)**
(**Sin IA (local)** in Spanish). City-plan summaries, citizen responses,
and downloaded reports also identify local fallback results.

No key, an unreachable backend/provider, quota errors, or a failed request
can trigger fallback. A working simulation or a static Meta label alone
is **not proof of a successful model call**. If using the alternative
provider configuration, verify the actual server model too: the UI's
`Meta AI` source label does not attest which provider was configured.

## Using the simulator

1. **Choose a city.** Use AI-assisted creation, a random city, or enter a
   seed to reproduce a synthetic layout. Generation settings also offer
   the optional larger-city preset; it is not an unlimited-city mode.
2. **Explore.** Use the camera controls and settings panel. Switch the
   interface language if needed; button labels below may be localized.
3. **Run a hazard.** Choose rain, river overflow, tsunami, earthquake, or
   strong wind. Adjust the available intensity/duration controls, start
   the simulation, and use pause, speed, and reset controls as needed.
4. **Compare outcomes.** Inspect the before/after comparison and measured
   evacuation, exposure, damage, and resilience results. These are
   demonstrative simulator outputs, not AI predictions.
5. **Try interventions.** In the intervention-agent panel, run an iteration
   to propose bounded measures and compare the resulting metrics. Mayor
   mode runs the bounded sequence automatically (up to three iterations).
   Availability restrictions appear in the panel; not every scene or
   hazard supports every measure.
6. **Ask a citizen.** Use the citizen-voice panel to narrate the selected
   citizen's measured state. This narrative does not control their route.
7. **Export.** At the final summary, download the report. It includes
   measured results and an AI-written emergency report, or a labeled local
   report if the AI request fails.

### Import a real district or GeoJSON plan

Choose the real-city option on the start screen or open the real-zone
importer from the toolbar. Search for a city/neighborhood, position the
fixed **1000 × 1000 m** square, and generate that zone. A preloaded Eixample
example is also available. Live search and import need internet access to
public map/elevation services, not a Meta key.

You can instead upload a **WGS84 GeoJSON** plan and crop it with the same
square. DWG, DXF, and PDF are not direct inputs. Successfully imported
zones are stored only in that browser (IndexedDB, newest eight); clearing
browser data deletes them. See [formats, sources, and import
limitations](docs/REAL_CITY.md).

### Troubleshooting

| Symptom                                  | What to check                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Backend exits with a configuration error | `apps/backend/.env` exists and `BYOK_MASTER_KEY` has 64 hex characters. A Meta key, if set, must start with `LLM_`.                  |
| Synthetic city does not load             | Start the backend as well as the frontend; check `/health` and browser network errors.                                               |
| AI returns a local fallback              | Check the server key, model access, quota, provider connectivity, and backend logs. Restart after editing backend `.env`.            |
| Unexpected AI provider                   | `AI_API_KEY` takes precedence over `META_API_KEY`; see the backend guide.                                                            |
| `@simulicity/hazards` cannot resolve     | Run installation from the workspace root and confirm `packages/hazards/src/index.ts` exists; this package exports TypeScript source. |
| Map search/import fails                  | Check internet access and public-service availability; use the preloaded example or a previously saved zone.                         |
| Port already in use                      | Check your existing local services; do not stop another person's server.                                                             |

---

## Repository structure

```text
apps/
  frontend/        Next.js + Three.js + simulator UI
  backend/         Fastify API, city generation, AI, encrypted key storage
packages/
  hazards/         Hazard and evacuation models
  shared/          Shared contracts and types (Zod)
scenarios/         Example scenarios (JSON)
assets/            Screenshots used in this README
```

---

## Useful scripts

```bash
pnpm build        # build the whole monorepo
pnpm lint         # ESLint
pnpm typecheck    # TypeScript
pnpm test         # Vitest
pnpm format       # Prettier
```

To build only the frontend (what Vercel does):

```bash
pnpm turbo run build --filter=@simulicity/web
```

---

## Deploy

The frontend is deployed on **Vercel** with:

- **Root Directory**: `apps/frontend`
- **Build Command**:
  `cd ../.. && pnpm turbo run build --filter=@simulicity/web`
- **Install Command**: `cd ../.. && pnpm install --frozen-lockfile`
- **AI configuration**: never place a model key in the frontend deployment.
  AI requires a separately running backend; without it, AI requests fall
  back locally.

The configuration lives in `apps/frontend/vercel.json`. A frontend-only
Vercel deployment is **not the full local stack**: synthetic generation
also needs the backend. The browser clients default to
`http://127.0.0.1:4000` and use `NEXT_PUBLIC_API_URL` for an alternative
API address (set at frontend build time). For a separately hosted backend,
configure its exact frontend origin in `CORS_ORIGINS` and use HTTPS;
never expose this unauthenticated development API publicly without a
security review. These deployment settings do not provision a backend.

---

## Limitations and disclaimer

- **Experimental** project: not a scientific prediction or a certified
  emergency tool.
- Hazard coefficients are **demonstrative**, not calibrated against
  real data.
- OpenStreetMap import depends on OSM data availability and quality.
- AI features are **optional** and not required to use the simulator.

---

## Demo video

_\[https://www.youtube.com/watch?v=zcfY3OEeHbQ]_

Suggested demo script:

1.  **Intro (10 s)**: what Simulicity IA is and what problem it
    explores.
2.  **Generate a city (20 s)**: show the panel, pick a seed, generate.
3.  **Run a hazard (30 s)**: select flood, show before/after and
    metrics.
4.  **Interventions (30 s)**: show the AI proposal (or the local
    fallback), apply it, compare.
5.  **Import a real district (20 s)**: load an OSM district and
    simulate.
6.  **Outro (10 s)**: limitations, stack, and repo link.

---

## License

_\[to be defined --- MIT, Apache 2.0, etc.\]_

---

## Credits

- 3D models: Kenney City Kit and Poly Haven (see
  `apps/frontend/public/models/`).
- Real-district data: OpenStreetMap contributors.
