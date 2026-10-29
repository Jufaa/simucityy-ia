# Explore the procedural world and city

Run `pnpm dev` from the repository root and open http://localhost:3000.

## Free local model preview

The default organic view uses six original CC0 Kenney models served from this app, not a paid map/API or remote model host. The top bar reports **Modelos locales CC0** only after successful loading. If a model cannot load, the corrected procedural buildings remain visible and the UI reports the fallback. Models, textures, original licenses and SHA-256 provenance live in `public/models/kenney-city/`.

**Otra ciudad** regenerates the city; **Ciudad / Entorno** change framing; **Ajustes** opens the compact settings panel. Pause and Reset remain on the bottom toolbar. Automation is retained: the scene starts at a readable 30× and evacuation switches to 3× at the alarm. Sparse rain and lighter storm lighting keep the city readable instead of covering the viewport with white lines.

Organic buildings now face nearby street segments using a shared local pose and conservative axis-aligned hazard envelopes. Bodies, fallback doors/balconies, rooftop details, models and foundations use those coordinates. Shore/road grading is continuous; organic level pads clear interior sampled terrain rather than leaving floating buildings. A park fountain is added only within an existing clear park.

Flood surfaces reconstruct shared-vertex absolute levels from neighboring wet cells and clip against the displayed terrain/building masks. Shallow film is more transparent than deeper water. This repairs disconnected visual cell terraces but remains a **display reconstruction**, not a volume-conserving hydraulic solver change. Dry cells never emit a neighbor's water. Solver readings, balance, bridge exposure and routing remain the source of simulation truth.

Sources/licenses: [Kenney City Kit Suburban](https://kenney.nl/assets/city-kit-suburban), [Kenney City Kit Commercial](https://kenney.nl/assets/city-kit-commercial), both CC0; [Three.js](https://github.com/mrdoob/three.js/blob/dev/LICENSE), MIT. No additional dependencies or paid services were introduced. This is a coherent stylized city mock, not photorealistic mapping or real flood forecasting.

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

- **Civic identities:** health center, school, police, fire station, municipal office and market, assigned to suitable existing flat-roof buildings. Roof symbols/signs and solar panels, AC units or water tanks make services and rooftops readable without adding new building footprints.
- **Street life:** parked cars, taxis, delivery vans and occasional buses; bus-stop signs; traffic lights at actual graph junctions; street trees, bins, hydrants, bollards and utility cabinets where clearance permits.
- **Placement:** derived from actual road/sidewalk geometry and city seed, avoiding building footprints, crossings, building access and existing park features. Narrow sidewalks retain a pedestrian corridor; props are omitted when they do not fit. Standard 2 m sidewalks get signs rather than bus shelters.

Open **Servicios y equipamiento urbano del mock** for the actual service/vehicle/stop/signal inventory. The city camera is the initial view; the world toggle remains available. These services are visual identities and vehicles are static decorations: there is no traffic AI, public-service operation, utility network or real coverage/safety model. Procedural city data, saved JSON, flood inputs and automatic walking/evacuation remain unchanged.

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
