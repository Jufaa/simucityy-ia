# Run a flood on the current district

Run `pnpm dev` from the repository root and open http://localhost:3000.

1. Choose **Relieve con zona baja · demo** (default) or **Plano · original**, then select **Iniciar inundación** to start rain on the displayed city.
2. Use **Pausar** / **Continuar** to pause or resume, or **Reiniciar** to return to dry conditions without regenerating the city or moving the camera.
3. Rain streaks and storm lighting appear immediately when you start. Watch animated blue water, red blocked road segments and orange exposed-building outlines. The panel reports simulated time, maximum depth and affected counts.

Rain and water highlights freeze while paused. Reset removes rain and water and restores clear-sky lighting. The moving water highlights are decorative normal-map animation: they do not change measured depth or displace the water surface. Rain is a local particle effect, not a roof-collision or drainage simulation.

## Model and limits

In flat mode, the frontend feeds the same generation response to `@simulicity/hazards` and the 3D renderer. Terrain, road-edge IDs and building IDs remain unchanged. Flood state is separate and is not saved or exported.

One wall-clock second represents five simulated minutes (300×): five 60-second ticks per second. Rain is 120 mm/h and drainage is 15 mm/h. Road segments are blocked at 15 cm; buildings are exposed at 20 cm. On flat synthetic terrain, uniform rain produces uniform water depth. Synthetic basin relief is disabled so simulated and displayed elevations agree.

The animation loop pauses progress in hidden tabs and caps slow-frame catch-up. There is no separate simulation timer. Reset leaves the simulation paused and clears all overlays. Missing simulation fields disable the controls without replacing the city with invented data.

This is a simplified demonstration, not an emergency forecast or a hydrodynamic safety model. Evacuation, building damage, fires and earthquakes are not connected by this feature.

## Verify

```bash
pnpm exec vitest run apps/frontend/src/components/flood-simulation.test.ts apps/frontend/src/components/flood-layer.test.ts apps/frontend/src/components/flood-weather.test.ts
pnpm --filter @simulicity/web typecheck
```

## Local relief demonstration

The default relief view derives a separate 10 m grid with a gentle tilted basin from the loaded city. It is a view-only demo, not an imported elevation dataset or a new saved-scenario format. The original API object, IDs, flat scenario serialization and backend generator are unchanged. Switching terrain rebuilds the scene and resets the simulation and camera; ordinary Reset does not move the camera.

Ground triangles, draped streets/parks/sidewalks/details and the flood solver use the same derived grid. Buildings remain upright on level foundations at their highest footprint corner, with balconies shifted together. The solver still represents each cell by its average corner elevation; water surfaces are clipped against the rendered terrain triangles to avoid rendering water through higher ground. This is a coarse-cell visual approximation, not a new hydraulic solver. Boundaries remain closed; there are no working drains, building barriers or evacuation routing.

Compare both modes under the same rain: lower relief cells should accumulate more water while the flat mode remains uniform. Decorative highlights do not affect volume. The original response is never overwritten or exported as the relief demo.
