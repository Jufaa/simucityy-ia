# Living city roadmap

Build a varied city with everyday activity, synthetic citizens who make decisions,
disasters that interrupt those activities, and AI that proposes cities and tests interventions.

The accepted target is **large fictional cities**, not copies of real neighborhoods:
multiple connected neighborhoods, a center and outskirts, varied streets, services
and active inhabitants. Procedural seeds or AI instructions describe an imagined
city. Increasing extent alone must not merely stretch the existing small layout.
No numerical city-size or population target has been agreed yet; scalability must
be demonstrated before claiming large-city support. Real geographic import is out
of scope.

Runtime AI must not require a paid API. Project-maintainer IDs are administrative,
not a requirement for every visitor or simulated citizen to provide a model key.
The provider choice is still pending: local inference uses the host's hardware;
a hosted free-quota API depends on its availability and limits. Neither an ID nor
free pricing replaces access controls or bounded resource use. No paid fallback
or automatic billing is authorized.
AI implementation and provider selection are currently deferred by the user;
non-AI city structures and simulation work can continue independently.

This is a product checklist, not a claim that these capabilities already work.
Unchecked items include new capabilities and existing foundations that still need
end-to-end verification. The user authorized continuing across all ten sections;
implementation and acceptance remain incremental. See
[the active task](../odd/tasks/organic-city-variety.md).

## 1. Less rigid, less repetitive urban form

- [ ] Generate large fictional cities with multiple connected neighborhoods rather than only enlarging the current small layout.
- [ ] Generate neighborhoods with different shapes and sizes rather than one fixed distribution.
- [ ] Combine avenues, secondary streets, alleys, curves and dead ends.
- [x] Provide alternative routes and more connections between neighborhoods (automated evacuation-detour verification).
- [ ] Adapt roads and buildings to terrain, rivers and the coast.
- [ ] Vary parcels, setbacks, orientation and spacing between buildings.
- [ ] Include different building footprints, heights and facades.
- [ ] Distinguish residential, commercial, industrial and mixed-use areas.
- [ ] Prevent overlapping buildings, inaccessible entrances and disconnected streets.

Implemented foundations:

- [x] Seed-dependent centers and dimensions for the three existing neighborhoods.
- [x] Local street circuits on both riverbanks, preserving the original bridge.
- [x] Per-road avenue, secondary-street and pedestrian-alley profiles propagated through rendering, placement and motor access (automated verification).
- [x] Six district-specific rectangular building archetypes with different proportions/heights, road setbacks and mutual spacing (automated generation and real-local-asset verification).
- [x] Optional 1200 × 1200 m fictional-city preset with eight neighborhoods, expanded streets and 600–800 buildings at fixed metric object size (automated generation/runtime verification; visual acceptance pending).

Polygonal parcels, new land uses, and more varied neighborhood counts and shapes
remain future work.

Implementation status: neighborhood variation, local circuits, road hierarchy
and six rectangular building archetypes plus the bounded larger-city preset are implemented and automated checks
pass, including independent evacuation, legacy-compatibility, scaled-parking,
setback/spacing and real-local-asset probes. Browser appearance and
default/storm/pause/reset acceptance remain pending; section 1 is not complete.

## 2. Structures with a purpose

- [x] Parks and plazas with paths, benches and meeting places (generated geometry/offline checks; browser acceptance and citizen visits remain separate).
- [ ] Shops that citizens can visit to buy things.
- [ ] Schools and workplaces that generate trips.
- [ ] Hospitals with care and limited capacity.
- [ ] Fire stations and emergency services that respond to incidents.
- [ ] Stops and basic public transport.
- [ ] Bridges, pedestrian crossings and entrances that actually connect the city.
- [ ] Identifiable shelters with visible capacity and occupancy.
- [ ] Drainage and other interventions with measurable simulation effects.

Important structures should affect activity or outcomes, not only appearance.
Current public-space foundations include a reserved main plaza/fountain and
greener park layouts, with original generation targets retained. The bridge has
bounded side arches and emissive fixtures while preserving crossing/deck/flood
semantics. Neither addition is a new daily-activity or structural-safety model.

## 3. Everyday citizen activity

- [ ] Give citizens a home, primary activity and usual destinations.
- [ ] Introduce a city clock and schedules.
- [ ] Leave home, work or study, and return.
- [ ] Visit shops, walk and rest in parks.
- [ ] Enter and remain inside buildings instead of walking indefinitely.
- [ ] Wait, queue and occupy space without overlapping crowds.
- [ ] Vary schedules, speeds and preferences.
- [ ] Support small groups and households trying to reunite.
- [ ] Interrupt activities for rain, closures or alerts.
- [ ] Recover from unreachable destinations without getting stuck.

## 4. AI-assisted citizen decisions

Local rules own movement and immediate reactions. A language model may choose
higher-level activities; it must not control physics or be called every frame.

- [ ] Define which decisions belong to AI and which belong to the engine.
- [ ] Provide bounded context: situation, needs, available destinations and constraints.
- [ ] Choose activities such as shopping, resting, visiting or returning home.
- [ ] Model simple preferences for proximity, quiet places, social activity or transport.
- [ ] Retain a short memory of relevant decisions and experiences.
- [ ] Let users ask selected citizens what they are doing and why.
- [ ] Generate plans for a period rather than requesting every movement.
- [ ] Validate proposed actions before execution.
- [ ] Reject invented paths, resources or capabilities.
- [ ] Fall back to local behavior when AI is unavailable.
- [ ] Record decisions for inspection and reproducibility.

## 5. AI-assisted city generation

AI proposes a structured urban plan. The generator ensures that its result is
geometrically valid and simulatable. Current generation is procedural, not AI.

- [ ] Accept a description such as a coastal city with a dense center and low-rise outskirts.
- [ ] Convert the description to a validated structured plan.
- [ ] Configure scale, population, relief, density and land uses.
- [ ] Propose neighborhoods, services and connections.
- [ ] Generate geometry from the accepted plan.
- [ ] Validate connectivity, available space and service access.
- [ ] Preview before replacing a city.
- [ ] Request changes such as more parks, another bridge or lower density.
- [ ] Distinguish whole-city regeneration from local edits.
- [ ] Store the plan, seed and generator version to reproduce the result.

## 6. Disasters interrupt city life

- [ ] Observe ordinary activity before the disaster.
- [ ] Configure rain, duration and initial conditions.
- [ ] Clearly show blocked streets and exposed buildings.
- [ ] Interrupt routines when an alert occurs.
- [ ] Reroute around closures and full shelters.
- [ ] Show isolated people and explain the cause.
- [ ] Include assistance and service response.
- [ ] Distinguish exposure, heuristic damage and visual destruction.
- [ ] Consolidate the flood experience before expanding other hazards.

## 7. AI evaluates interventions

- [ ] Read real simulation state and metrics.
- [ ] Accept an objective: reduce isolation, exposure or evacuation time.
- [ ] Propose interventions within constraints and a budget.
- [ ] Run alternatives through controlled tools.
- [ ] Compare with the same population, seed and event.
- [ ] Show improvements and regressions.
- [ ] Reject ineffective proposals.
- [ ] Explain conclusions using engine results only.
- [ ] Bound calls, execution time and experiment count.

## 8. Inspectable interface and results

- [ ] Select a person to inspect activity, destination, status and route.
- [ ] Inspect building function, occupancy and exposure.
- [ ] Inspect streets, closures and alternative routes.
- [ ] Show shelter occupancy and demand for services.
- [ ] Provide layers, legends and explicit units.
- [ ] Display a timeline of important events.
- [ ] Compare scenarios with metrics and charts.
- [ ] Save and export scenarios and results.
- [ ] Replay recorded runs rather than only resetting a seed.

## 9. Atmosphere and performance

- [ ] Match lighting and activity to the time of day.
- [ ] Change windows and street lights with urban state.
- [ ] Animate walking, waiting and resting.
- [ ] Offer optional ambient sound.
- [ ] Separate computation and rendering to avoid interface stalls.
- [ ] Adjust visual detail by distance and device capacity.
- [ ] Measure performance with representative population and city sizes.
- [ ] Establish and measure explicit large-city budgets for buildings, population, visible detail and simulation work; do not activate unlimited work just because the map is larger.
- [ ] Preserve pause, reset and resource cleanup during regeneration.

## 10. Fictional-city scope and trustworthy delivery

- [x] Confirm large fictional cities as the product target; real-neighborhood import is excluded by the user's scope decision.
- [ ] Clearly identify synthetic terrain, buildings, population and assumptions in the interface and exported scenarios.
- [ ] Preserve asset sources/licenses, scenario seeds, coordinate units and synthetic terrain provenance.
- [ ] Verify water conservation, closures, shelter capacity and determinism.
- [ ] Protect credentials and bound AI consumption.
- [ ] Prepare a complete demo with fallback for external failures.
- [ ] Clearly label the simulator experimental, not certified emergency guidance.

## Delivery order

1. Connected, varied urban form; everyday routines; transition to evacuation.
2. AI intervention experiments with inspectable results.
3. Prompt-driven urban planning and richer citizen decision-making.

Prove a complete loop in a small area, then scale to coherent large fictional
cities with measured budgets. The small area is a development step, not the final
product scope. Geographic import from the historical idea is explicitly excluded.
