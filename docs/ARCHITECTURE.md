# Architecture decisions

Simulicity IA separates display, orchestration and deterministic domain logic. The initial executable system is deliberately honest about unavailable simulation and AI capabilities.

## Boundaries and ownership

```text
Browser → Next.js dashboard → server health proxy → Fastify
                      ↓                             ↓
                    shared ← simulation-core / geo / ai-planner
                                                    ↓ future, opt-in
                                               database / PostGIS
```

| Decision                                  | Rationale and tradeoff                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm workspaces + Turbo                   | Independent packages and parallel app startup; one shared lockfile requires coordination                                              |
| Next.js App Router + client-only MapLibre | Server-side secret boundary with interactive WebGL map; map requires browser/network support                                          |
| Fastify app factory separate from server  | `inject` tests need no sockets, database or AI key                                                                                    |
| Source-exported private TS packages       | No fragile dist ordering for dev/tests; apps must transpile/bundle them; publishing requires a separate packaging decision            |
| Prisma 6 + optional PostGIS 17 image      | Stable application metadata path with conventional PostgreSQL URL; geospatial SQL is not falsely represented as Prisma native support |
| Synchronous pure-TS simulation            | Identical contract in Node/browser workers; worker transport and job management remain future work                                    |
| Seeded Mulberry32 generator               | Reproducible uint32 seed, [0,1) outputs; not cryptographically secure                                                                 |
| Meta adapter unavailable by design        | No unverified endpoint/model/SDK assumptions; no synthetic provider responses                                                         |

## Coordinates, units and data quality

- `GeographicCoordinate`: `crs: EPSG:4326`, longitude then latitude, decimal degrees. GeoJSON coordinates follow `[longitude, latitude]`.
- `LocalCoordinate`: `crs: local-meters`, x east, y north, z up relative to the scenario origin. Do not feed degrees into physical calculations.
- The initial equirectangular conversion is limited to 50 km around an origin within ±85° latitude. It approximates a local plane, not a survey-grade CRS; adopt a reviewed projected CRS when the real import/simulation requires it. No DEM or vertical datum is guessed. Geographic conversion discards relative z because WGS84 contract is 2D.
- Time is seconds; height/elevation/distance metres; drainage capacity cubic metres/second; population/capacity integer persons. Timestep is finite, greater than zero and at most 60 seconds.
- Each entity carries source/license and `observed`, `derived`, or `synthetic` provenance. Height and occupancy have separate nullable provenance; null means unknown, not zero. Derived values need their own provenance rather than inheriting observation status.
- The Miami record/empty scenario and two geo footprints are explicitly hand-authored synthetic demo records. They are not a real city import. External basemap building geometry and inferred height coverage depend on source data and are not simulation entities or authoritative observations.

## Simulation lifecycle

An empty scenario starts `ready` with no entities. A positive step invokes registered systems then updates elapsed time/step count. Pause prevents advancement; resume permits it. Reset reconstructs the empty world, PRNG and hazard instances. Snapshots are detached clones; callers cannot mutate engine state by editing returned data. Metrics count actual arrays; affected buildings and evacuations remain unknown because no physical/population model exists.

A hazard factory receives seeded randomness; systems must not read clocks, network state or `Math.random`. Reproducibility requires the same scenario, seed, ordered systems, timestep sequence and implementation version. No promise of rollback on an arbitrary future plugin throwing mid-step exists; plugin failure/transaction semantics must be designed when real systems are introduced.

## API and security

- Bind to loopback by default. CORS validates exact origins and does not grant identity or authorization. No authentication is added at this stage.
- Zod validates shared bodies/params and environment. Centralized errors avoid stacks, secrets and raw environment input in responses.
- Fastify limits bodies to 64 KiB and logs requests with redaction. The Next health proxy uses a timeout and validates the upstream response.
- Server-only `API_URL`, database credentials and reserved Meta key never use `NEXT_PUBLIC_`. Public map settings are intentionally bundled into browser code.
- Unimplemented routes return unavailable; no persistence, simulation run or AI output is synthesized. HTTP lifecycle/readiness contracts can grow when actual background work exists.
- `ai-planner` defines an allowlisted discriminated tool union, strict arguments, numeric bounds, cancellation and executor budget contracts. No executor is provided: future backend integration must enforce cumulative budgets, authorization/approval for writes, cancellation and result validation. Schemas alone are not an authorization boundary.

## Geo and AI integration seams

OSM import, road graph generation and elevation sampling are interfaces only. Imports must be explicit, bounded and cancellable, with attribution and service policy compliance. GeoJSON normalization currently accepts 2D Point, LineString, Polygon and MultiPolygon, validates coordinate ranges/closed rings and limits collection size; it is not a general geometry repair or topology library.

Meta provider integration is server-side only. Before adding any real network call, verify official Meta Model API / Muse Spark documentation, availability, authentication, endpoint, model identifier, quotas and tool-call format. Store credentials only in the backend. Never execute model-produced source code, shell commands or arbitrary scripts.

## Environment and delivery

The apps boot without PostgreSQL or Meta access. Database setup is explicit, and schema changes must acquire a proper migration workflow before production use. CI checks code without those services. Lockfile, pnpm version and Node version make local/CI environments reproducible. Docker's major/minor image tag is convenient for local updates rather than immutable supply-chain pinning; production needs reviewed digests and deployment hardening.

All initialization belongs to one PR by explicit user choice. Local work-unit commits may separate concerns; no remote publication is implicit.
