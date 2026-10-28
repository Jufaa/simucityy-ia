# Four urban-detail layers

The homepage requests a versioned, opt-in `detailLevel: "urban"` on `layout: "district"`. It adds building identities, equipped parks, street furnishings and procedural visual materials. Existing grid 1.0.0 and basic district 1.1.0 outputs/fixtures remain supported; the urban profile records generator version **1.2.0**.

## Request or export

Add `"detailLevel": "urban"` at the top level of the existing district request to `POST /api/v1/cities/generate`. The other parameters keep their meanings. Urban details require district layout and at most 200 complete blocks; infeasible or unknown parameters are rejected.

```sh
pnpm --filter @simulicity/api exec tsx scripts/export-city.ts --urban > /tmp/urban-district.json
```

The ready-to-share example is `scenarios/urban-district.json` (500 x 500 m, spacing 50 m, seed 42, building heights 4–40 m). `--district` and the no-flag export retain their old results. Regeneration supports all three generator versions. The JSON helpers still enforce the 2 MiB limit.

## 1. Buildings with identity

`buildings[].architecture` records `style` (house/apartment/shop), floors, roof type/rise, facade palette, entrance side and balcony depth. Urban houses and shops are generally lower, apartments taller, always bounded by the requested height range. Separate seeded detailing does not change parcel footprints, streets or the original generator's output when the profile is omitted.

`heightInMeters` is **total height including the roof**. The renderer subtracts the stored roof rise from wall height before adding a pitched roof, so it does not accidentally increase the scenario's height. Apartment balconies stay within the declared footprint by recessing the front wall. Doors follow the recorded entrance side; shops add a ground-floor storefront and a local sign texture. Upper-floor windows are repeated facade textures, not thousands of meshes.

`district.urban.yards` stores a rear yard for every house inside its parcel and outside buildings. It is separate from the building footprint; this does not create an editable land-use model.

## 2. Equipped parks

`district.urban.parkPaths` stores four connecting paths, a central paved area and entrances joining the park to its surrounding sidewalk. Each item references its park. `amenities` stores deterministic tree, bench, lamp and fountain placements with IDs, park references, metric positions, orientation and bounding radius.

Tree canopies are kept inside their park and away from paths. Trees, benches, lamps and decorative fountain basins are rendered in batches with instancing. Lamps use emissive heads rather than hundreds of additional lights. Fountain water is a decorative surface, **not flood state or a water source**.

## 3. Street and sidewalk detail

`district.urban.streetDetails` includes curb strips, crosswalk stripes, dashed lane markings and one entrance path per building. `sourceId` references the relevant sidewalk, road or building, depending on `kind`. Geometry is bounded in metric local coordinates; entrance paths connect the recorded entrance side to its block's sidewalk. The original road graph is unchanged and still has no calibrated traffic lanes/capacities.

The renderer batches repeated strips using instanced geometry. Curbs and sidewalk heights are visual choices; the existing 2D flood terrain/road-centreline contract is not converted into a physical kerb or drainage model.

## 4. Materials, lighting and cleanup

The frontend generates facade/window, storefront/sign, asphalt, concrete and grass textures locally with Canvas. No external image/model assets, API requests or dependencies are added. A directional light supplies shadows, hemisphere lighting gives ambient fill, and tone mapping keeps outdoor materials consistent.

Building and furnishing meshes cast/receive shadows as appropriate. The directional shadow camera covers the whole district. On scene teardown, geometry, materials, textures, shadow render targets, controls, resize handlers and animation resources are released. Shadows are bounded to a 2048-pixel map and pixel ratio is capped at 2; this is a stylized real-time view, not a photorealistic digital twin.

## Files and tests

- Backend: `urban-details.ts`, `urban-validation.ts`, optional city types/schema/profile wiring and the existing export/HTTP boundary.
- Frontend: `urban-building-layer.ts`, `urban-detail-layer.ts`, `urban-materials.ts`, `Scene.tsx` and additive HTTP-view types.
- Tests: urban profile/version/roundtrip, legacy compatibility, invalid references/geometry, roof bounds, mesh instancing and HTTP/CLI selection.

The original `city-generator.ts`, `block-generator.ts`, `building-generator.ts` and base district subdivision remain the low-level generation foundation. Urban detailing enriches their result; it does not replace them with Three.js objects. The climate module and its numerical rules are untouched. Simulation developers may consume the new metadata later, but physical effects of trees, fountains, curbs or furniture require their own explicit models.
