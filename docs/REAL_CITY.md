# Real district pilot: Eixample, Barcelona (OSM + DEM)

The simulator can load one **preloaded real district** alongside the synthetic
cities: roughly 1.0 × 1.0 km of Barcelona's Eixample, converted from real
geographic data into the same `CityResponse` contract used by the renderer,
the flood solver and the evacuation engine. Streets are traversable graph
edges, buildings block flood cells, citizens evacuate over the real street
network. This is option "B" (simulable), not a satellite/tile backdrop.

Select it in **Ajustes → Trazado → Barrio real · Eixample (OSM)**. The
synthetic organic city remains the default. No network calls happen at
runtime and no API key is needed.

## Choosing any zone in the app (visitor flow)

The **Zona real o plano** button in the top bar (next to the example-city
actions) opens an import card that lets a visitor pick their own zone. It
is intentionally outside **Ajustes**, which keeps only generation,
surroundings and simulation settings:

1. **Buscar ciudad/barrio**: free-text search (Nominatim) with selectable
   results, plus offered presets (Eixample and Gràcia in Barcelona, Centro
   in Madrid, Ciutat Vella in València). The map (OSM raster tiles) pans by
   dragging.
2. **Drag the square**: the teal square is the area to represent — drag it
   to move, drag its corner or use the slider to resize (250–1500 m side).
3. **Representar esta zona en la simulación**: downloads OSM geometry
   (Overpass) and Terrarium DEM tiles in the browser (all CORS-enabled,
   free, keyless), converts with the same `createRealCity()` and switches
   the scene to **Trazado → Zona importada**.

Successfully imported zones are also **saved in the browser** (IndexedDB,
`saved-zones.ts`, newest 8): the import card lists them under **Zonas
guardadas** for one-click reload without re-uploading or re-downloading.
Nothing leaves the device, no server persistence; clearing browser data
removes them. Uploads pick the file through a styled **Elegir plano
GeoJSON…** button, not the raw browser file control.

### Uploading your own plan

The same panel accepts a **GeoJSON plan** instead of a searched city. The
plan is drawn over the map and cropped with the same draggable square.

Expected format — GeoJSON in WGS84 lon/lat coordinates:

- `Polygon`/`MultiPolygon` → buildings or parks; `LineString`/
  `MultiLineString` → streets.
- Properties: `kind`: `building` | `road` | `park` (Spanish `edificio`,
  `calle`, `parque` also accepted), or native OSM tags (`building`,
  `highway`, `leisure`, `landuse`). Height via `levels`,
  `building:levels` or `height` (metres).
- Relief: by default the real DEM under the plan is downloaded; uncheck
  the option (or if tiles fail) for flat terrain at elevation 0, which the
  metadata reports as `plan-flat-elevation-0`.
- Streets connect only where lines share an endpoint (same as OSM nodes);
  a crossing without a shared point is drawn but not routed through.

DXF/DWG/PDF plans in local coordinates cannot be placed on the map: they
must be georeferenced first (e.g. in QGIS) and exported as GeoJSON. The
parser rejects coordinates outside WGS84 ranges with that explanation.

## Pipeline

```text
Overpass API (OSM ways, out geom) ─┐
                                   ├─ scripts/import-real-city.mjs
Terrarium DEM tiles (z15, PNG) ────┘        │ writes
                                            ▼
                        apps/frontend/src/data/eixample-source.json
                                            │ createRealCity() at selection time
                                            ▼
   src/components/real-city-model.ts ──► CityResponse (roads, roadGraph,
        buildings, terrainGrid, citizens, shelters, real metadata)
```

- `scripts/import-real-city.mjs` is the only network step. It queries
  Overpass for `highway`, `building`, park and grass ways inside a bounding
  box, downloads the Terrarium elevation tiles covering it, decodes the PNGs
  locally (Node `zlib`, no new dependencies), samples a regular DEM grid and
  writes one compact JSON source. Coordinates are rounded to 1e-7°.
- `real-city-model.ts` is a pure converter (no fetch, no Three.js). It
  projects lat/lon to local metres, clips street segments to the district,
  deduplicates graph nodes by position, maps OSM highway classes to the
  existing road profiles, converts building footprints to the
  minimum-area rotated rectangles that contain them, samples shelters onto
  the highest road nodes, assigns synthetic citizens to residential
  buildings and validates the DEM axes against the projected extent.
  Imports are capped at 3000 m per side so the flood grid stays bounded.

Regenerate or import another district (offline afterwards):

```bash
cd apps/frontend
node scripts/import-real-city.mjs --bbox 41.391,2.158,41.400,2.170 \
  --name "Eixample, Barcelona" --out src/data/eixample-source.json --cell 20
```

Then point the import in `Scene.tsx` at the new file (and adjust the label).

## Sources and licences

- Streets, buildings, parks: © OpenStreetMap contributors, licence **ODbL**.
  The panel shows this attribution whenever the real district is active.
  OSM data quality varies; some heights are missing (see below).
- Elevation: Terrarium tiles (Mapzen / AWS Terrain Tiles), built from SRTM,
  GMTED and other public DEMs. The underlying DEM is ~30 m class data
  resampled onto a 20 m grid; it is not street-level surveyed terrain.

## Honest limits

- **Building footprints:** ways and multipolygon relations are imported
  (churches, stations, perimeter blocks included). Hazard/routing keep the
  conservative rotated rectangle, but rendering draws the **exact extruded
  footprint** — with courtyard holes — for the 200 largest complex
  footprints (concave, holed, or filling much less than their rectangle);
  the rest keep the instanced rectangle. Building coverage depends on
  OSM: central Barcelona has thousands of footprints per km², while e.g.
  Río Cuarto has only a few dozen mapped — the importer warns when a zone
  brings fewer than 150 buildings instead of inventing the missing ones.
- **Heights:** 1,131 of 1,483 buildings carry OSM
  `height`/`building:levels`; the other 352 heights are deterministic
  estimates by OSM id and are counted as _estimated_ in the metadata and
  panel, never presented as measured data. Places of worship are the one
  deliberate override: OSM often tags only the base storeys (the Sagrada
  Familia reads 6 m), so churches/temples below 18 m get a representative
  estimated height scaled by footprint (the basilica becomes 35 m) plus a
  simple spire — recognizable, explicitly not a 1:1 reconstruction.
- **Sparse cities:** where OSM has almost no buildings mapped (Río Cuarto
  has ~157 footprints in 1.5 km²), the import card offers an opt-in
  _synthetic infill_: deterministic houses along streets, flagged per
  building (`real-infill-*`, `synthetic: true`), counted separately in the
  metadata and declared in the panel. Off by default; the simulation
  treats them as ordinary houses, but they are never real data.
- **Population and shelters are synthetic** (200 residents; three shelters
  on the highest road nodes). No real population or shelter capacity data
  is claimed.
- **Flood on a real DEM is still the simplified cell solver**: a 20 m
  demonstration grid over coarse DEM data. It is not calibrated flood
  forecasting and must not be used as emergency guidance.
- Selecting the district costs one local conversion (~0.2–0.5 s) plus the
  usual scene dressing; evacuation planning on the 4,561-edge real graph
  required heap-based Dijkstra in `packages/hazards` (same routes, much
  faster). Extreme time multipliers (×32–×64) remain heavy on this graph.
- Rendering this district produces ~3,100 draw calls (vs ~700 in the
  synthetic city), mostly per-building rooftop detail meshes that are not
  instanced. Browser inspection (headless Edge, software rendering) showed
  the scene, storm water and exposed-building highlights working at 2 FPS
  under SwiftShader — that figure says nothing about a real GPU, but modest
  GPUs may dip; GPU FPS acceptance is still pending.
- Building collapse animates on imported zones through
  `attachBuildingCollapse` in the procedural layer (instanced buckets and
  footprint groups share the asset layer's collapse pose). Previously only
  the empty marker groups moved, so buildings stayed standing over their
  rubble; that affected every non-Kenney view, not just real districts.

## Verification

```bash
pnpm exec vitest run apps/frontend/src/components/real-city-model.test.ts packages/hazards/test/evacuation-engine.test.ts
pnpm test && pnpm typecheck && pnpm lint
```

The converter tests run fully offline against a fixture district and assert
graph connectivity, footprint containment, DEM/citizen/shelter consistency,
determinism and that `DistrictSimulation` can advance flood + evacuation on
the converted city.
