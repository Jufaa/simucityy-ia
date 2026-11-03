# Explore the procedural world and city

Run `pnpm dev` from the repository root and open http://localhost:3000.

## Living-city roadmap: urban variety

The [living-city roadmap](../../docs/living-city-roadmap.md) tracks the complete
product direction. Its first delivery varies the centers and dimensions of the
three existing neighborhoods by seed, using a separate layout random stream.
Two bent outer-street links on each riverbank create local circuits and alternative
routes while retaining dead ends. Repeating a seed reproduces the same layout.

The existing bridge remains the only cross-river connection. New streets participate
in the same road graph, building clearance and terrain grading as existing roads;
they are not decorative lines. Source API data, saved formats and the legacy grid
remain unchanged. Polygonal parcels, additional land uses and AI city planning
remain roadmap work. Existing
seeds intentionally produce different organic buildings because the streets and
neighborhood envelopes now change placement constraints.

### First larger fictional-city preset

Open **Ajustes → Escala urbana → Ciudad grande · 1,2 km**. The original
**Distrito** remains the default and can be selected again. Seed replay includes
the selected size, so switching size with the same seed actually rebuilds the
geometry. Random generation retains the selected size.

The optional local preset covers 1200 × 1200 m with eight fictional neighborhoods,
ten street rows per riverbank, local pedestrian circuits and the existing single
bridge. It targets 800 buildings, or 600–800 with random profiles, and 12 parks
(8–16 with random profiles). It does not scale houses, road widths, sidewalks,
setbacks or park furniture up with the territory. It reuses the existing six
archetypes and local assets; the backend response and saved format are unchanged.

The city preset deliberately uses a 20 m terrain grid: 3600 flood cells per
experiment arm, versus 2500 cells at 10 m in the original 500 m district. This
coarser synthetic demonstration is not a higher-resolution flood forecast.
Placement attempts are bounded at 96000 buildings/15000 parks; targets are not
unlimited density settings. Source population is retained (normally 200 people),
with at most 40 moving vehicles and 600 decorative street items. This first
larger map does not implement massive population, worker simulation, multiple
bridges, an infinite city or AI planning. Actual visual/FPS acceptance is pending
a connected browser; automated grid/scale tests alone do not prove usability.

Offline Node probes in this development session measured generation at 208–759 ms
(median 437 ms across mixed seed/profile/relief cases). Five hazard setups took
92–248 ms; advancing 0.4 real seconds took 10–148 ms depending on the event.
These are observed development-machine costs, not browser FPS or performance
guarantees. The simulation still runs on the main thread.

Hazard outcomes may differ with the new geography/grid. In the river-overflow
preset, existing quantile-based initialization can put approach water at 3.05 m,
above the unchanged 2.2 m bridge deck, so the bridge can begin blocked. This is
modeled overtopping, not proof of real flood risk or a missing bridge elevation.

### Road hierarchy

Organic roads now carry optional local profiles shared by asphalt/shoulder
rendering, setbacks, idle-person placement, street dressing and vehicle access:

| Road class             | Carriageway at 500 m city scale | Sidewalk on each side | Motor traffic |
| ---------------------- | ------------------------------- | --------------------- | ------------- |
| Trunk avenue           | 12 m                            | 3 m                   | Yes           |
| Secondary street       | 8 m                             | 2 m                   | Yes           |
| Outer pedestrian alley | 4 m                             | 1 m                   | No            |
| Existing bridge        | Original 10 m deck              | Kept inside the deck  | Yes           |

Dimensions scale with the organic city. Cars retain the existing simple two-way
kinematic model; wider avenues do not add multiple traffic lanes. Segments too
narrow for the existing vehicle envelopes do not spawn traffic. Pedestrian alleys
remain available to evacuation routing. Idle citizens use the actual sidewalk
offset; walking evacuation still follows graph centerlines, not a new sidewalk
network. Furniture avoids other profiled carriageways and pedestrian alleys do
not receive parked cars or bus stops. Profiled carriageways narrower than 8 m
omit parking so parked bodies do not overlap the existing fixed moving lanes;
small scaled cities therefore have fewer parked vehicles, not narrower cars.

The bridge keeps its own renderer and surface/exposure semantics. Metadata-free
legacy roads retain each consumer's previous defaults, including 6 m asphalt,
district-based dressing and the original 4 m idle-person offset. No backend or
saved scenario format is extended with these local profiles. Browser acceptance
for the changed appearance is still pending.

### Neighborhood building variety

The organic generator now samples two rectangular archetypes per neighborhood.
Dimensions below are at the 500 m reference scale; floor counts are before the
existing height multiplier:

| Neighborhood   | Archetype       | Width × depth   | Floors |
| -------------- | --------------- | --------------- | ------ |
| Garden Quarter | Compact house   | 8–10 × 8–10 m   | 1–2    |
| Garden Quarter | Elongated house | 7–8 × 13–15 m   | 1–2    |
| Old Town       | Slim apartment  | 8–9.5 × 15–17 m | 8–12   |
| Old Town       | Wide apartment  | 14–17 × 9–11 m  | 5–8    |
| East Market    | Wide shop       | 16–19 × 8–10 m  | 1–2    |
| East Market    | Compact shop    | 10–12 × 9–11 m  | 2–3    |

Archetypes have different setbacks beyond the actual road and sidewalk edges,
and pairwise spacing satisfies the larger of both buildings' requirements.
Inspectable local `Building.layout` metadata records those rules. Orientation
still follows the nearest road frontage; foundations use the existing terrain
helpers. Seed and density/height controls remain reproducible, but organic
building placement intentionally changes from the previous generator revision.

Loaded Kenney assets and the procedural fallback both consume the actual width,
depth, height and orientation. The change does not replace GLB facade materials,
introduce L/U footprints, attach terraced houses, or create independent polygonal
parcels; current blocks remain conservative building envelopes. No new assets,
dependencies, backend fields, saved formats or hydraulic behavior are introduced.

### Plazas, green parks and bridge landmark

Organic generation now reserves one main civic rectangle before buildings, when
clear land fits: 32 × 28 m at the district reference scale, or 48 × 40 m in the
larger city. It counts toward the selected park target rather than displacing
buildings afterward. The site has a central paved plaza/fountain, two crossing
paths, an entrance, benches, lamps and trees. Other parks remain greener, with a
narrow path, seating and an entrance. If the bounded search cannot fit the civic
site safely, ordinary green-park placement continues instead of forcing it.

The original bridge gains two lateral blue-steel arches, anchor details,
instanced hangers and warm emissive fixtures. Its deck, crossing graph, citizen
surface and flood-exposure metadata are unchanged. No new hydraulic barriers or
shadow-casting point lights are added. Geometry and instance resources retain
explicit, idempotent disposal.

These are visible city structures and potential destinations, not new citizen
visits or public-service behavior. Park entrances stop at their boundary; they
do not add a navigable sidewalk network. Paving is presentation data: the
simplified flood environment still treats whole parks uniformly for infiltration.
Bridge arches are decorative, not certified engineering. Browser appearance,
storm readability and FPS remain pending actual inspection. Details and offline
checks: [public spaces](../../docs/public-spaces.md) and
[bridge landmark](../../docs/bridge-landmark.md).

## Real district pilot (Eixample, Barcelona)

**Ajustes → Trazado → Barrio real · Eixample (OSM)** loads a preloaded real
district (~1.0 × 1.0 km, 1,483 buildings, 4,561 street segments) converted
offline from OpenStreetMap geometry plus a Terrarium DEM into the same
simulation contract as the synthetic cities: flood, blocked streets and graph
evacuation run on the real street network and terrain. It is selected, not
generated — seed controls do not apply, and the organic city stays the
default. Building footprints are contained in rotated rectangles, heights
without OSM tags are counted as estimates in the panel, and population and
shelters are synthetic. Full pipeline, regeneration command, licences and
limits: [docs/REAL_CITY.md](../../docs/REAL_CITY.md). Switching to it costs
one local conversion (~0.2–0.5 s) plus ~1 s of street-dressing placement on
the 3,539-node graph; extreme time multipliers remain heavy there.

Visitors can also choose their own zone with the **Zona real o plano**
button in the top bar, which opens a dedicated import card (Ajustes keeps
only generation/simulation settings): search a city/neighborhood
(Nominatim) or pick an offered preset, drag the square on the OSM tile map
to select 250–1500 m, and import it live with the card's primary
**Representar esta zona en la simulación** button (Overpass + Terrarium in
the browser, no keys). The same card accepts an uploaded GeoJSON plan —
drawn over the map and cropped with the same square, with real DEM or flat
terrain. Imported zones live as **Trazado → Zona importada** and are kept
in the browser's IndexedDB (**Zonas guardadas**, newest 8) for one-click
reload; nothing is stored server-side. Landmarks (churches, hospitals,
stadiums, civic icons) render exact and 1:1 with their OSM `building:part`
volumes — the Sagrada Familia reaches its real ~179 m — with a red-cross
marker on hospitals and floodlights on stadiums; ordinary buildings stay
instanced. An opt-in, clearly labelled synthetic-house infill can fill
street frontage where OSM has almost nothing mapped.

## Free local model preview

The default organic view uses six original CC0 Kenney models served from this app, not a paid map/API or remote model host. The top bar reports **Modelos locales CC0** only after successful loading. If a model cannot load, the corrected procedural buildings remain visible and the UI reports the fallback. Models, textures, original licenses and SHA-256 provenance live in `public/models/kenney-city/`.

**Otra ciudad** regenerates the city; **Ciudad / Entorno** change framing; **Ajustes** opens the compact settings panel. Pause and Reset remain on the bottom toolbar. Automation is retained: the scene starts at a readable 30× and evacuation switches to 3× at the alarm. Sparse rain and lighter storm lighting keep the city readable instead of covering the viewport with white lines.

Organic buildings now face nearby street segments using a shared local pose and conservative axis-aligned hazard envelopes. Bodies, fallback doors/balconies, rooftop details, models and foundations use those coordinates. Shore/road grading is continuous; organic level pads clear interior sampled terrain rather than leaving floating buildings. A park fountain is added only within an existing clear park.

Flood surfaces reconstruct shared-vertex absolute levels from neighboring wet cells and clip against the displayed terrain/building masks. Shallow film is more transparent than deeper water. This repairs disconnected visual cell terraces but remains a **display reconstruction**, not a volume-conserving hydraulic solver change. Dry cells never emit a neighbor's water. Solver readings, balance, bridge exposure and routing remain the source of simulation truth.

Sources/licenses: [Kenney City Kit Suburban](https://kenney.nl/assets/city-kit-suburban), [Kenney City Kit Commercial](https://kenney.nl/assets/city-kit-commercial), both CC0; [Three.js](https://github.com/mrdoob/three.js/blob/dev/LICENSE), MIT. No additional dependencies or paid services were introduced. This is a coherent stylized city mock, not photorealistic mapping or real flood forecasting.

## Random city, movement and performance

**Ciudad aleatoria** chooses a fresh browser-generated 32-bit seed and a bounded local profile: building target (110–190), park target (2–7), height multiplier, lake size and channel width. Targets are ceilings: dry-ground clearance may produce fewer buildings or parks. The seed and **Perfil aleatorio** mode together reproduce the city; in **Ajustes**, enter the seed and press **Reproducir ciudad**. **Otra ciudad** still advances the seed while retaining the current profile mode. The original default layout is unchanged until random generation is selected. Neither mode uses an LLM; the requested conversational generator is deferred.

Up to **40 moving vehicles** follow directional graph lanes using capped 1/30-second kinematic steps, acceleration, braking, following separation and exclusive intersection reservations. Their clock uses real frame seconds, not the hazard speed multiplier. Roads blocked by water or collapsed-building debris stop traffic; vehicles already on a blocked road freeze rather than teleport. Pause freezes traffic and hazard progression; Reset restores the initial vehicle state. Hidden tabs do not accumulate catch-up time. Segments shorter than 24 m are omitted from the traffic network, so traffic does not cover every road. Parked vehicle props are omitted when moving traffic is present because they occupy the same lanes.

A seventh civic identity, **museum**, adds a columned roof portico. **Servicios y movilidad urbana** reports baseline residential access to each facility through actual directed graph paths, including connected bridges. Building access is estimated at the nearest road node; distances exclude unmodeled entrances. These measurements describe synthetic connectivity, **not capacity, dispatch, response time or safety during a catastrophe**. They are recomputed when the city changes, not on every frame.

The visible performance monitor samples real frame cadence once per second: FPS, average milliseconds per frame, CPU render-submission time, draw calls and triangles. CPU render time is not GPU timing. Values depend on the device, viewport, browser and development/production mode; a displayed counter is not a performance guarantee. Moving vehicles use five fixed-capacity instanced render batches with explicit resource disposal. No new dependencies, paid services or additional destruction engine were added. Existing synthetic hazard damage and evacuation remain active; rigid-body impacts, pedestrian/vehicle collision avoidance and actual public-service dispatch remain out of scope for this milestone.

## Generate an organic city

The initial layout is now **Orgánico · lago y puente**. A deterministic local model builds winding connected streets on two banks, a carved lake/channel, a bridge, a denser center, lower garden housing, a commercial quarter and dry parks. Buildings remain rectangular individual structures; the developed city footprint is irregular even though the terrain/flood sampling domain stays rectangular.

- **Generar otra ciudad** advances the city seed and rebuilds streets, parcels, population access and local geography together. The displayed city seed reproduces the same result. Changing the surroundings seed still affects the surroundings only.
- **Grilla original** restores the previous backend-generated district. Switching layout, terrain or city seed resets the local experiments; automatic start/alarm/walking remain enabled. Flat land still retains the lake/channel basins.
- Bridge edges really connect the road graph. The rendered deck, citizen height and road exposure share explicit deck elevation. Normal water below the deck does not close it; overtopping at the existing threshold does. Buildings and ordinary roads are kept out of permanent water; parked props do not spawn on bridges or in the channel.
- **Lago** toggles the local lake/channel and outer lake visually without changing water levels, routing or generation. Permanent surfaces remain separate from dynamic rainfall accounting: they inform road exposure, but there is no lake/river exchange or coupled flood-wave solver.

The derived view does not overwrite the original API object or alter saved JSON/backend generator contracts. New local IDs and home/node references belong to the regenerated view. Source citizen IDs/count and mobility are retained. The legacy grid remains available; AI is not connected.

## Generate the surroundings first

The default camera focuses on the city. **Vista mundo** reveals the offline synthetic territory around it: a curved coast and sea to the west, one inland lake to the east, six rural fields and a yellow reserved expansion area. These are procedural capabilities, **not AI-generated proposals or imported geographic data**.

- **Semilla del mundo → Aplicar** reproduces the same surroundings for the same seed and city. Valid seeds are integers from 0 to 4294967295.
- **Generar otro entorno** advances the seed and rebuilds the surroundings. It retains the original city data but restarts both flood-response experiments and repositions the camera within the selected view.
- **Mar / Lago / Campos / Reservas** toggle visibility only. They do not modify geometry generation or simulation inputs.
- **Vista mundo / Vista ciudad** move the camera without resetting the experiments. Ordinary **Reiniciar** clears the city flood, not the permanent sea or lake, and does not move the camera.

The default 500 m city occupies the center of a 1850 × 1450 m world. The city uses its selected organic or legacy-grid terrain; surrounding terrain is sampled at 25 m and matches the city boundary heights. Coast and lake water surfaces are clipped to the terrain. Rural fields are visual crop/pasture areas, not agricultural simulations. The yellow reserve is empty land, not automatic city growth or a real zoning decision.

Permanent water is separate from rainfall, snapshots and the city-only flood solver: no tides, lake exchange, coastal inundation or outside-city evacuation is modeled. Ambient water highlights may continue while the city simulation is paused. The original API response and saved-scenario format remain unchanged. The local organic view adds its own channel/neighborhoods; AI composition and forests remain later capabilities.

## Recognizable city mock

The default 500 m urban district now adds a deterministic, local visual layer over its existing buildings and streets:

- **Civic identities:** health center, school, police, fire station, municipal office, market and museum, assigned to suitable existing flat-roof buildings. Roof symbols/signs and solar panels, AC units or water tanks make services and rooftops readable without adding new building footprints.
- **Street life:** parked cars, taxis, delivery vans and occasional buses; bus-stop signs; traffic lights at actual graph junctions; street trees, bins, hydrants, bollards and utility cabinets where clearance permits.
- **Placement:** derived from actual road/sidewalk geometry and city seed, avoiding building footprints, crossings, building access and existing park features. Narrow sidewalks retain a pedestrian corridor; props are omitted when they do not fit. Standard 2 m sidewalks get signs rather than bus shelters.

Open **Servicios y movilidad urbana** for the actual service/vehicle/stop/signal inventory. The city camera is the initial view; the world toggle remains available. Civic identities have synthetic baseline graph-access measurements but no public-service dispatch, utility network or real coverage/safety model. Moving traffic and its limits are described above; street furniture remains decorative. Procedural city data, saved JSON, flood inputs and automatic walking/evacuation remain unchanged.

`city-life-model.ts` owns pure placement, `city-life-layer.ts` owns its instanced rendering resources, and `civic-landmarks.ts` owns civic assignment and rooftop rendering. Both render layers use the shared terrain helpers and explicit idempotent disposal before the main scene cleanup.

## Default people: automatic evacuation, no AI

The frontend places the generated people outside buildings, along street/sidewalk segments, so they are visible without starting any simulation. IDs, home metadata and deterministic placement remain available for a future behavior controller; the source city is not mutated. Select **Vista ciudad** and zoom in to inspect them.

**The simulation starts automatically when the city loads.** People wait until either experiment arm first reports a blocked street or an exposed building; a shared automatic alarm then starts local evacuation. No Start or alarm click is required. Pause remains optional; Reset restores the initial population and immediately restarts the simulation. Both experiment arms honor reaction delays, route toward available shelters and react to blocked streets. At the first alarm, the scene automatically switches to **3× · caminar** so walking remains readable. Select **Vista ciudad** and zoom in to see the people. The UI uses `{ evacuationEnabled: true, alarmMode: 'automatic', autoStart: true }`.

`createStaticPopulation(city)` is a pure placement helper. `createCitizenLayer(...).update({ citizens: [{ id, position }] })` accepts plain rendering data for future positions; optional status is only a color hint, not a behavior rule. No AI provider, credentials or calls are connected. Movement uses the local evacuation engine. `DistrictSimulation` retains its automatic hazard-alarm library default for compatibility; manual mode suppresses that trigger and exposes `triggerAlarm()`. Repeated alarms preserve the original timestamp. Explicitly disabling evacuation still freezes the population.

### Visible walking and shelter arrivals

Citizens have instanced arms and legs, face their movement direction and use a real-frame-time gait while their simulation position changes. Pausing or hiding the tab freezes the gait; waiting, stranded and arrived people do not walk in place. Arm switching and timeline reset clear animation history. The renderer still accepts plain ID/position inputs; optional frame delta and context only control presentation.

Evacuated people remain in snapshots. They used to overlap at one exact shelter node; now the renderer assigns persistent, distinct visual slots around that node, avoiding building footprints and city boundaries. These offsets do not change routing, shelter occupancy, identifiers or simulation positions. Slot search is bounded to 64 rings at 1.8 m spacing; if no valid slot remains, it falls back to the original node. This is a visual crowd layout, not collision avoidance or a crowd simulation.

## Flood-response demo

1. Choose **Relieve con zona baja · demo** (default) or **Plano · original**, the rain starts automatically on the displayed city.
2. Use **Pausar** / **Continuar** to pause or resume, or **Reiniciar** to return to dry conditions without regenerating the city or moving the camera.
3. Rain streaks and storm lighting appear immediately when you start. Watch animated blue water, red blocked road segments and orange exposed-building outlines. The panel reports simulated time, maximum depth and affected counts.

Rain and water highlights freeze while paused. Reset removes rain and water and restores clear-sky lighting. The moving water highlights are decorative normal-map animation: they do not change measured depth or displace the water surface. Rain is a local particle effect, not a roof-collision or drainage simulation.

## Choose the catastrophe

The top bar selector **Catástrofe** switches the event without regenerating the city; changing it restarts the event, the alarm and the evacuation on the same streets and buildings:

| Event               | What drives it                                                                    | Visible effect                                                                            |
| ------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Lluvia intensa**  | The original uniform 120 mm/h rain on `FloodEngine`                               | Rain streaks, pooling water, blocked streets                                              |
| **Desborde de río** | Initial water in the carved channel/lake plus 70 mm/h rain                        | Water spilling from the riverbanks into low neighborhoods                                 |
| **Tsunami**         | A 1.6 m wave injected at the western (sea) edge, no rain                          | A translucent wave front crossing inland while the solver spreads the water               |
| **Terremoto**       | Deterministic structural damage around a central epicenter (magnitude 6.8 demo)   | Ground cracks, red/orange damaged buildings, debris-blocked streets, a brief camera shake |
| **Vientos fuertes** | Deterministic structural damage weighted by building height (110 km/h gusts demo) | Animated wind streaks, damaged tall buildings, debris                                     |

Water events keep using the flood solver, its blocked-road thresholds and the graph evacuation. Earthquakes and strong wind produce no flood water: their damaged buildings and debris-blocked edges feed the same alarm and evacuation, and the **Con mejora** arm models seismic reinforcement / secured roofs (lower damage severity) instead of extra drainage. A gradient sky dome with drifting clouds and per-event fog/light moods keep the scene readable in every state. All coefficients are demonstrative presets, not calibrated forecasts.

### Building collapse and citizen reaction

Every building now has a physical state over time — **intact → damaged → collapsed** — shown in the panel and in 3D (the real building sinks, tilts and compresses while a rubble pile grows on its plot):

- **Earthquake:** damage is instant, collapses (severity ≥ 0.75) fall staggered 4–114 s after the shock. The alarm sounds at second 0; residents of damaged buildings react fastest.
- **Strong wind:** severity grows with a 600 s gust ramp, so nothing is damaged at first; collapses (≥ 0.88) happen minutes in. People shelter indoors during the gusts and leave afterwards (damaged homes first).
- **Tsunami / river / rain:** a building collapses when the flood load next to it — depth × current factor (tsunami 2.2, river 1.3, rain 1.0, since the solver has no velocity) — exceeds its per-building resistance (0.7–1.4 m equivalent). The tsunami wave surface is a curved, foamy crest whose position follows the solver's actual water front, not a timer.
- **Debris:** only collapsed buildings block streets (in addition to water-blocked edges), from the moment they fall; evacuation reroutes around them.
- **Trapped citizens:** anyone still at home when their building collapses becomes **trapped** (purple): they cannot move or be evacuated and are reported separately from stranded. Reaction delays are adjusted per event (earthquake fastest, wind sheltering, tsunami pre-warning ×0.5, river ×0.8); IDs, homes and mobility never change.

In the default organic city after ~10 simulated minutes this yields, deterministically: earthquake 22 collapsed / 16 trapped, strong wind 27 collapsed / 29 trapped, tsunami 4 collapsed shoreline buildings — the improved arm collapses and traps fewer in every case.

## Model and limits

In flat mode, the frontend feeds the same generation response to `@simulicity/hazards` and the 3D renderer. Terrain, road-edge IDs and building IDs remain unchanged. Flood state is separate and is not saved or exported.

At 300×, one wall-clock second represents five simulated minutes. The scene begins at 30× and switches to 3× at the first alarm; one real second then represents three simulated seconds. The 30× and 300× options remain available. Reset or rebuilding the city restores the readable 30× storm buildup; the next alarm switches back to 3×. The 300× option remains available explicitly. Flood ticks remain 60 simulated seconds and evacuation advances between them. Rain is 120 mm/h and drainage is 15 mm/h. Road segments are blocked at 15 cm; buildings are exposed at 20 cm. Without an optional environment, uniform rain on flat terrain produces uniform water depth. The integrated demo enables barriers and local drainage in both terrain modes. Synthetic basin relief is disabled so simulated and displayed elevations agree.

The animation loop pauses progress in hidden tabs and caps slow-frame catch-up. There is no separate simulation timer. Reset clears dynamic flood state and restarts automatically; permanent geography remains visible. Missing simulation fields disable the controls without replacing the city with invented data.

This is a simplified demonstration, not an emergency forecast or a hydrodynamic safety model. Earthquake and wind damage are deterministic severity scores per building (seeded by building ID), not structural engineering; fires are not simulated. Evacuation is a simplified graph model, not real-world safety guidance.

## Verify

```bash
pnpm exec vitest run apps/frontend/src/components/flood-simulation.test.ts apps/frontend/src/components/flood-layer.test.ts apps/frontend/src/components/flood-weather.test.ts
pnpm --filter @simulicity/web typecheck
```

## Local relief demonstration

The default relief view derives a separate 10 m grid with a gentle tilted basin from the loaded city. It is a view-only demo, not an imported elevation dataset or a new saved-scenario format. The original API object, IDs, flat scenario serialization and backend generator are unchanged. Switching terrain rebuilds the scene and resets the simulation and camera; ordinary Reset does not move the camera.

Ground triangles, draped streets/parks/sidewalks/details and the flood solver use the same derived grid. Buildings remain upright on level foundations at their highest footprint corner, with balconies shifted together. The solver still represents each cell by its average corner elevation; water surfaces are clipped against the rendered terrain triangles to avoid rendering water through higher ground. This is a coarse-cell visual approximation, not a new hydraulic solver. Boundaries remain closed; local capacity-based drains, coarse building barriers and graph evacuation are enabled by the integrated response demo described below.

Compare both modes under the same rain: lower relief cells should accumulate more water while the flat mode retains its original ground geometry. Local drainage can make either mode nonuniform. Decorative highlights do not affect volume. The original response is never overwritten or exported as the relief demo.

## Buildings, drainage and evacuation

The integrated demo runs two independent copies of the same city, rain, terrain and building barriers. **Escenario visible** switches the displayed arm without resetting either clock. Both arms appear in the comparison table:

| Arm            | Background drainage | Additional park infiltration       | Local drains                                     |
| -------------- | ------------------- | ---------------------------------- | ------------------------------------------------ |
| **Sin mejora** | 15 mm/h             | 15 mm/h, weighted by park coverage | None                                             |
| **Con mejora** | 15 mm/h             | 60 mm/h, weighted by park coverage | Up to six lowest open road nodes, each 0.15 m³/s |

These are deterministic local presets, not measured or calibrated infrastructure. The source city and saved scenario stay unchanged; park geometry is not enlarged by this preset. Drains remove only available water and preserve the modeled water balance; they do not represent a pipe network.

Building barriers use cell centers rather than any footprint intersection, preserving coarse street corridors. Fully blocked cells have no water, source or transfer. **Roof rain and roof runoff are excluded** from the modeled open-area balance. Exposure samples adjacent open cells. The visible water surface is also clipped around partial building footprints in both flat and relief modes. Ten-metre cells cannot resolve exact six-metre street hydraulics.

In the library default mode, a common hazard alarm is recorded when either arm first blocks a road or exposes a building. The scene uses this automatic alarm. When evacuation is enabled, generated citizens then honor their reaction delays and walk at `1.2 × mobilityFactor` m/s, including the initial straight home-to-access connector. Routes use road lengths, directions, active shelters and reserved capacity. At a node, closures trigger rerouting; a newly blocked current edge stops the person in place until it reopens. No teleporting or off-road rescue is modeled. Home connectors have no separate flood/collision check, and shelter flooding or crowd congestion is not simulated.

The default view shows people waiting for the automatic hazard alarm. Cyan squares mark local drains in the improved arm. Use **3× · caminar** to inspect movement after the automatic alarm. Pausing freezes both experiments; Reset returns both to dry conditions and waiting citizens, clears cumulative metrics and alarm, and preserves the current camera. Changing terrain rebuilds the scene and resets both experiments and the camera.

The table reports **cumulative unique** exposed buildings, peak blocked segments, peak depth, actual removed water, current evacuated/stranded counts, and, only when evacuation behavior is enabled, completion time measured **from the common alarm**. The scene shows evacuation rows, with completion measured from the automatic alarm. An unfinished evacuation reads **No completada**, never zero. There is no guarantee that every local metric improves, and this comparison does not establish emergency safety.

### Response checks

```bash
pnpm exec vitest run packages/hazards/test/flood-environment.test.ts packages/hazards/test/evacuation-engine.test.ts apps/frontend/src/components/district-simulation.test.ts apps/frontend/src/components/citizen-layer.test.ts apps/frontend/src/components/relief-water-obstacles.test.ts apps/frontend/src/components/comparison-panel.test.ts
pnpm test
pnpm typecheck
```

### World checks

```bash
pnpm exec vitest run apps/frontend/src/components/world-model.test.ts apps/frontend/src/components/world-layer.test.ts apps/frontend/src/components/world-controls.test.ts
```

`world-model.ts` owns typed generation data, `world-layer.ts` owns its Three.js resources, and `world-controls.tsx` is the manual interface. Shared water normals are a visual helper only; permanent-water state never enters `DistrictSimulation`.
