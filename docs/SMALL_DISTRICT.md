# A recognizable small district, generated as data

For the optional architectural, park-furnishing and street-detail profile, see [Urban details](URBAN_DETAILS.md). Basic district generation described below is unchanged.

The homepage now requests an opt-in district from the existing city endpoint. It contains multiple rectangular buildings per developed block, residential/commercial uses, reserved park blocks, sidewalk strips and visible shelter markers. It remains a synthetic, simplified district, not a real place or an active flood simulation.

## Try it

Run the existing frontend and backend with `pnpm dev`, then open the frontend. The backend still needs its existing local environment/SQLite setup. The default scene requests 500 x 500 metres, 50 metre street spacing, seed 123 and building heights between 4 and 40 metres. Camera distance scales with the district; drag to orbit and scroll to zoom.

For an offline scenario, use `scenarios/small-district.json` (seed 42, ground elevation zero):

```sh
pnpm --filter @simulicity/api exec tsx scripts/export-city.ts --district > /tmp/small-district.json
```

The existing `scenarios/demo-city.json` and export command without `--district` remain unchanged.

## HTTP request

```json
{
  "layout": "district",
  "config": {
    "widthInMeters": 500,
    "heightInMeters": 500,
    "streetSpacingInMeters": 50,
    "seed": 42
  },
  "terrain": { "kind": "flat", "elevationInMeters": 0 },
  "minBuildingHeightInMeters": 4,
  "maxBuildingHeightInMeters": 40
}
```

Send this body to `POST /api/v1/cities/generate`. Without `layout`, the endpoint keeps the original one-building-per-block grid. The legacy generator version is `1.0.0`; district output records `1.1.0` and `config.layout: district`. JSON schema version remains 1 because district fields are additive and optional for existing consumers. Version-aware regeneration supports both modes.

## New data and rules

| Data                                                 | Meaning                                                                                                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `district.parcels`                                   | Four nonoverlapping lots in a developed block, or one park lot. Each has an ID, block reference, bounds and `kind` (`residential`, `commercial`, `park`).                                                           |
| `buildings[].blockId / parcelId / use`               | District building references its own lot; park lots never contain buildings. Footprints vary within parcel bounds, and heights stay inside the requested range. Legacy buildings do not gain these optional fields. |
| `district.parks`                                     | Actual reserved open-space rectangles in the scenario, not buildings hidden by the renderer. Includes a central park and seeded distributed park blocks. At least one developed block is retained.                  |
| `district.sidewalks`                                 | Four sidewalk strips per block, outside its buildable area and inside its bounds. These are geometry, not a pedestrian routing model.                                                                               |
| `district.roadWidthInMeters / sidewalkWidthInMeters` | Currently fixed at 6 and 2 metres for version 1.1.0. They describe district layout geometry; do not claim calibrated physical road capacity.                                                                        |

District mode supports 4–625 complete blocks. There must be enough interior space for road half-width, sidewalk, setbacks and parcel subdivision; small or infeasible blocks are rejected with an explanation, not silently enlarged. Park selection, lot sizes and heights use a separate deterministic stream. Residents are assigned only to residential buildings; road graph, accesses and shelter capacities are recomputed/reused consistently.

The scene reads the resulting rectangles. Beige buildings are residences; blue buildings are commercial; green areas are parks; light grey strips are sidewalks; yellow columns are shelter markers. Ground and park elevations remain flat. Street-edge render strips can extend half a road width beyond the district border, as in the prior centreline renderer; this does not expand scenario coordinates.

## Verification and scope

Tests cover old grid compatibility, district regeneration/JSON roundtrips, parcel occupancy, no building in parks, residential home references, impossible configurations, the HTTP layout flag, and scenario-derived Three.js meshes. The formerly obsolete placeholder-homepage test now checks the actual initial loading state.

For the flood developer, building `minCorner`, `maxCorner` and `heightInMeters`, terrain coordinates, graph IDs and metric units keep their meanings. Expect multiple buildings per block rather than one. Do not use a building's array index as a permanent identity. Parks and sidewalks are available as geometry, but flood-specific infiltration, walkability, evacuation and shelter reservations still need explicit simulation rules. No new dependencies, remote calls, Meta integration or climate changes are required.
