# Bridge landmark without changing transport or flood behavior

The existing organic bridge gains two blue-steel side arches, vertical hangers,
four anchor details and warm emissive fixtures. These are presentation-only
additions: the deck, crossing graph, citizen road heights and hydraulic inputs
remain unchanged. No new piers or foundations are introduced.

## Bounded geometry

- Both arches stay in the outer 0.55 m side bands, inside the existing deck width.
  No crossbar spans the walking or driving corridor.
- Arch rise follows the span and deck width, capped at 14 m. Each arch uses the
  same 48-segment, six-sided tube geometry; its endpoints remain above the deck.
- Hangers use one instanced batch, capped at 24 per side. Light fixtures use a
  second batch, capped at 12 per side. Emission does not add point lights or
  additional light shadow maps.
- The layer owns shared geometry, materials, textures and instance resources.
  Calling `dispose()` twice releases each owned resource only once.

## Preserved boundaries

The existing two abutments remain below the deck, and the two embankments retain
their original terrain alignment. Existing under-deck decorative piers are not
added to or changed. Neither those existing visuals nor the new arches become
hydraulic barriers or certified structural components.

`bridgeAtPoint`, `sampleRoadSurfaceHeight` and `organicFloodEnvironment` still
consume the original bridge metadata. A flooded bridge can still close when an
active hazard overtops its unchanged deck.

## Verification and limitations

`organic-bridge-layer.test.ts` checks district/city, flat/relief and scaled
fixtures: bounded side geometry, clear corridor, unchanged deck/support heights,
source immutability, flood metadata and double-disposal. The existing organic
integration tests cover visible citizen height and actual bridge crossing.

Automated geometry checks do not establish appearance, FPS, structural safety or
nighttime illumination quality. Default/storm appearance and pause/reset still
require browser acceptance. AI, new assets and service changes are out of scope.
