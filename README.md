Simulicity IA
A synthetic 3D city simulator for exploring the impact of natural hazards (floods, earthquakes, tsunamis, and strong winds), featuring deterministic before-and-after comparisons and AI-assisted interventions.

Demo video: [YouTube link — pending]

!Simulicity IA overview The Simulicity IA start screen: choose to generate a city with AI, use a random seed, or import a real-world map.

What is it?

Simulicity IA is a 3D city simulator built with Three.js, Next.js, and React. It procedurally generates synthetic cities, including terrain, water, streets, buildings, public services, and citizens, and allows users to simulate deterministic natural hazards.

Since city generation is deterministic and seed-based, users can compare the same city before and after a hazard event, using identical initial conditions to measure its impact on buildings, population, and essential services.

The project also features a real-world district importer powered by OpenStreetMap, along with two optional AI-powered features that generate urban plans and propose mitigation interventions. If no API key is configured, the application automatically falls back to a local planning system.

Disclaimer: Simulicity IA is an experimental project. It is not a scientific prediction tool or a certified emergency-management system. Its simulation models and coefficients are demonstrative and have not been calibrated against real-world data.
Features
Procedural city generation: Generates terrain, rivers, lakes, streets, urban blocks, buildings, parks, public services, and population.
Deterministic hazard simulation: Simulates heavy rain and flooding, river overflow, tsunamis, earthquakes, and strong winds.
Before-and-after comparison: Uses the same seed to reproduce identical initial city conditions and compare simulation results.
Real-world district import: Imports geographic data from OpenStreetMap to generate 3D representations of existing urban areas.
Optional AI integration: Uses the Meta Model API to propose urban plans and mitigation interventions. Without an API key, the application uses a local fallback labeled "Sin IA (local)".
Impact metrics: Measures exposed buildings, trapped people, maximum water depth, resilience scores, and other simulation indicators.
Interactive simulation panel: Provides city generation controls, hazard selection, simulation settings, and comparison tools.
Screenshots
City generation and simulation

!City generation

A procedurally generated synthetic city, ready for simulation. The top bar displays the active hazard, while the right panel shows real-time simulation metrics.

Simulation summary

!Simulation summary

After running a hazard simulation, the application displays a detailed summary, including evacuated population, trapped people, collapsed buildings, maximum water depth, and an analysis of the overall impact.

Hazards and evacuation

!Hazard and evacuation

Earthquake simulation at street level: buildings shake, debris falls, and citizens evacuate through the urban environment.

Real-world district import

!OSM import

Importing Barcelona's Eixample district using OpenStreetMap. The application automatically generates a 3D urban model from the imported geographic data.

AI-assisted interventions

[Pending screenshot: assets/ai.png]

The intervention agent proposes mitigation measures based on the simulation's measured metrics. When no API key is configured, the system uses its local fallback, labeled "Sin IA (local)".

How it works (technical overview)
Deterministic city generation: A seeded pseudo-random number generator (PRNG) generates terrain, streets, urban blocks, buildings, and population. The same seed always produces the same initial city.
Hazard simulation: Each hazard applies a deterministic simulation model to the city, calculating variables such as water depth, structural damage, and evacuation behavior.
Before-and-after comparison: Since the initial city can be reproduced using the same seed, the application can compare the original and affected states under identical conditions.
AI-assisted interventions: The backend, or its local fallback, analyzes the simulation metrics and proposes mitigation measures. Once applied, the simulation runs again using the same seed, allowing users to compare the results before and after the intervention.
Tech Stack
Layer	Technology
Frontend	Next.js, React, Tailwind CSS, Three.js
City generation	Pure TypeScript (@simulicity/cities)
Hazard simulation	Pure TypeScript (@simulicity/hazards)
Shared contracts	Zod (@simulicity/shared)
Monorepo	pnpm workspaces + Turbo
AI integration (optional)	Meta Model API
Deployment	Vercel (frontend only)
Getting Started
Requirements

Make sure you have the following installed:

Node.js 22.x
pnpm 10.x
Installation

Clone the repository and install the dependencies:

bash
pnpm install

Run the development server

Start the frontend application:

bash
pnpm --filter @simulicity/web dev


Once the development server is running, open:

text
http://localhost:3000

Environment Variables (Optional)

AI-powered features require a Meta Model API key.

Without an API key, the application remains fully functional and automatically uses the local fallback, labeled "Sin IA (local)".

If you are running the AI backend locally, create or update the following file:

apps/backend/.env

env
META_API_KEY=LLM_...

Note: The Vercel deployment only includes the frontend. Therefore, AI-powered features use the local fallback unless a separate backend is configured.
Repository Structure
text
apps/
  frontend/        Next.js + Three.js + simulator UI
  backend/         Optional AI backend

packages/
  cities/          Deterministic procedural city generator
  hazards/         Hazard and evacuation simulation models
  shared/          Shared contracts and types (Zod)

scenarios/         Example simulation scenarios (JSON)
assets/            Screenshots and visual resources

Available Scripts

Run the following commands from the repository root:

bash
pnpm build        # Build the entire monorepo
pnpm lint         # Run ESLint
pnpm typecheck    # Run TypeScript type checking
pnpm test         # Run Vitest tests
pnpm format       # Format the code with Prettier

Build only the frontend

To build only the application deployed on Vercel:

bash
pnpm turbo run build --filter=@simulicity/web

Deployment

The frontend is deployed using Vercel with the following configuration:

Setting	Value
Root Directory	apps/frontend
Build Command	cd ../.. && pnpm turbo run build --filter=@simulicity/web
Install Command	cd ../.. && pnpm install --frozen-lockfile
Environment Variables	None required

The application works without environment variables because AI-powered features automatically fall back to the local planning system.

The Vercel configuration is located at:

text
apps/frontend/vercel.json

Limitations and Disclaimer
Experimental project: Simulicity IA is not a scientific prediction tool or a certified emergency-management system.
Demonstrative simulation models: Hazard coefficients and simulation parameters have not been calibrated or validated against real-world events.
OpenStreetMap dependency: Real-world district imports depend on the availability, accuracy, and quality of OpenStreetMap data.
Optional AI integration: AI features are not required to use the simulator. The application can operate with its local fallback.
Simplified urban models: The simulated behavior of buildings, infrastructure, and citizens does not necessarily represent real-world physical or social dynamics.

Simulation results should be interpreted as experimental scenarios for exploration and educational purposes, not as reliable forecasts of actual disasters.

Demo Video

[YouTube link — pending]

Suggested Demo Script
Stage	Duration	Content
Introduction	10 s	Introduce Simulicity IA and explain its purpose.
City generation	20 s	Show the simulation panel, select a seed, and generate a city.
Hazard simulation	30 s	Select a flood scenario and demonstrate the before-and-after comparison and impact metrics.
Mitigation interventions	30 s	Show an AI-generated proposal (or the local fallback), apply the intervention, and compare the results.
Real-world district import	20 s	Import a district from OpenStreetMap and run a simulation.
Conclusion	10 s	Highlight the project's capabilities, limitations, technology stack, and repository.

Estimated duration: 2 minutes.

License

To be defined (MIT, Apache 2.0, or another open-source license).

Credits
3D assets: Kenney City Kit and Poly Haven. See apps/frontend/public/models/.
Geographic data: © OpenStreetMap contributors.
Technologies: Next.js, React, Three.js, TypeScript, Tailwind CSS, Zod, and Turbo.