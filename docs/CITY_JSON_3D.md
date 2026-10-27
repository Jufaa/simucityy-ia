# Simucity IA: ready-to-render synthetic district

Start with [`scenarios/demo-city.json`](../scenarios/demo-city.json). This self-contained fixture needs no running backend, environment keys, Meta API or database. It is a synthetic district, not verified geographic data or a physical simulation.

## Quick handoff

1. Request a generated scenario from `POST /api/v1/cities/generate` (below), or load the fixture as static data to work without a running backend. Keep the source scenario immutable.
2. Use the metric coordinate mapping below to create meshes. Roads are centerlines; any rendered road width is a visual choice, not measured data.
3. Buildings are axis-aligned boxes, citizens start at home, and shelters are markers at road nodes. There is no flooding or evacuation state yet.

The demo is 500 x 500 metres, seed 42: 22 road centerlines, 100 blocks, 100 buildings, 121 graph nodes, 220 bidirectional graph edges, two shelters and 200 citizens. The terrain has 21 x 21 samples at 25 metre spacing, all at elevation zero.

## HTTP generation endpoint

Start the existing backend using `pnpm --filter @simulicity/api dev`. Its existing environment/BYOK and SQLite startup prerequisites still apply; this change does not modify the AI module. City generation itself makes no Meta requests and does not save a city to the database.

```sh
curl -X POST http://127.0.0.1:4000/api/v1/cities/generate \
  -H 'Content-Type: application/json' \
  --data '{"config":{"widthInMeters":500,"heightInMeters":500,"streetSpacingInMeters":50,"seed":42},"terrain":{"kind":"flat","elevationInMeters":0}}'
```

Frontend example (use the configured backend URL, not an assumed Next.js route):

```ts
const response = await fetch('http://127.0.0.1:4000/api/v1/cities/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    config: {
      widthInMeters: 500,
      heightInMeters: 500,
      streetSpacingInMeters: 50,
      seed: 42,
    },
    terrain: { kind: 'flat', elevationInMeters: 0 },
  }),
});
if (!response.ok) throw new Error('City generation failed');
const scenario = await response.json();
```

The response is the scenario directly, with status `200` and `Cache-Control: no-store`; it is not wrapped in a `data` field. Request `config` contains dimensions, spacing and optional seed (default 1). `terrain` is required. Optional top-level numeric fields: `buildingMarginInMeters`, `minBuildingHeightInMeters`, `maxBuildingHeightInMeters`, `terrainCellSizeInMeters` and `populationCount`. Defaults match the fixture: 5, 5, 15, 25 and 200 respectively. Unknown fields are rejected; send these optional settings at the top level, not inside `config`.

Errors use the existing `{ error: { code, message, requestId } }` contract. Invalid shape/values return `400 VALIDATION_ERROR`; infeasible combinations or workload return `400 INVALID_CITY_CONFIGURATION`; malformed JSON returns `400 BAD_REQUEST`; payloads above 64 KiB return `413 PAYLOAD_TOO_LARGE`. Internal failures remain generic `500` errors. Existing CORS allows configured frontend origins; do not disable it to fix a mismatched host/port. This endpoint does not persist or provide a city-by-ID retrieval API.

## Coordinate mapping for Three.js / R3F

Local scenario coordinates use `x` and `y` in metres. Origin is the southwest corner, `x` increases east and `y` north. These are local synthetic coordinates, not latitude/longitude. Three.js is Y-up. Map a ground point to:

```ts
const position = [point.x, groundElevationInMeters, -point.y];
```

For a building, use `maxCorner - minCorner` for footprint size and `heightInMeters` for its vertical size. Its mesh centre is:

```ts
const centre = [
  (building.minCorner.x + building.maxCorner.x) / 2,
  scenario.terrain.elevationInMeters + building.heightInMeters / 2,
  -(building.minCorner.y + building.maxCorner.y) / 2,
];
const size = [
  building.maxCorner.x - building.minCorner.x,
  building.heightInMeters,
  building.maxCorner.y - building.minCorner.y,
];
```

An alternative centred scene subtracts `widthInMeters / 2` from X and adds `heightInMeters / 2` to Z. Apply the same transform to **every** layer; do not overwrite the JSON coordinates.

## Contract map

| Field                     | Meaning                                                                                                                                                                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`           | JSON format version, currently 1. This is the first complete handoff contract.                                                                                                                                                                      |
| `generatorVersion`        | Algorithm version required for regeneration.                                                                                                                                                                                                        |
| `source`                  | `procedural`; all contents are synthetic.                                                                                                                                                                                                           |
| `config`                  | Effective dimensions, spacing, seed, building margins/heights, terrain sampling and population count.                                                                                                                                               |
| `roads`                   | Unchanged axis-aligned centreline segments, with `start` / `end`. No width, speed or calibrated traffic capacity.                                                                                                                                   |
| `blocks` / `buildings`    | Rectangles with stable deterministic IDs, `minCorner` / `maxCorner`; buildings add height. One building per generated complete block. Incomplete boundary strips remain unbuilt.                                                                    |
| `roadGraph.nodes`         | Intersections and centreline endpoints. Nodes contain metric `x`, `y`, `id`.                                                                                                                                                                        |
| `roadGraph.edges`         | Adjacent nodes on an existing road, with `roadId`, `from`, `to`, `lengthInMeters`, `bidirectional: true`. Resolve IDs with a Map.                                                                                                                   |
| `buildingAccess`          | One abstract association from each building to a nearby graph node. It is not a rendered driveway, sidewalk or a collision-free walking path.                                                                                                       |
| `terrain` / `terrainGrid` | Flat synthetic elevation plus explicit sample coordinates. `elevationsInMeters[row][column]` corresponds to `yCoordinates[row]` and `xCoordinates[column]`; triangulate adjacent samples. The final cell may be shorter than the nominal cell size. |
| `shelters`                | Two separate road-node locations, active flag and capacity in people. Resolve `nodeId` to place markers; capacity does not represent actual occupancy or reservations.                                                                              |
| `citizens`                | Initial synthetic population: home building, access node, position inside home, mobility factor, reaction delay in seconds, `status: normal`. No motion, routes or evacuation results are provided.                                                 |

IDs are stable for identical input/version. Editing dimensions, spacing or generation order can change IDs; they are not permanent real-world identities.

## Regenerate and validate

From repository root, after installing the existing workspace dependencies:

```sh
pnpm --filter @simulicity/api exec tsx scripts/export-city.ts > /tmp/simucity-demo.json
pnpm exec vitest run apps/backend/src/test/cities
```

The export command writes JSON only to stdout. `--help` prints usage; unsupported arguments fail. It never reads `.env`, starts HTTP services or calls Meta. Copy `/tmp/simucity-demo.json` to the consumer as needed. The fixture path is `scenarios/demo-city.json` (the file can be shared even before a commit).

Backend helpers in `modules/cities/city-json.ts`:

- `serializeCityScenario(value)` validates and serializes a scenario.
- `parseCityScenario(json)` validates imported JSON (maximum 2 MiB).
- `regenerateCityScenario(value)` rebuilds a procedural scenario from its stored settings, with the supported generator version. It is **not** an edit-preserving operation; manual/AI editing is outside this stage.

Schema: `modules/cities/city.schema.ts`; types: `modules/cities/city.types.ts`. TypeScript types alone do not validate JSON. The runtime schema checks geometry, bounds, unique IDs, connected graph, references, terrain dimensions, homes and shelter capacity. Rejected input is not repaired or applied.

Limits: 1000 road centerlines, 2500 blocks/buildings, 10000 terrain samples, population 0–300. A non-empty population requires buildings. Seed is an unsigned 32-bit integer. Separate random streams keep building heights unchanged when population count changes.

## Deliberate limits and next integration

This handoff finishes the bounded procedural city stage: HTTP generation, export/import, graph, terrain, shelters and initial residents. It does not implement an editor, accepted AI proposals, climate, routing algorithms, evacuation/reservations, simulation metrics, HTTP persistence or 3D rendering. The terrain is flat, not a DEM or hydrodynamic surface; a later flood model may need a richer terrain representation. Keep these simplifications visible in the UI.
