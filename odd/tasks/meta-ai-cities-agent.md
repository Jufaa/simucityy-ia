# Meta AI: city creation + intervention agent

Objective: connect the Meta Model API (api.meta.ai/v1, Muse Spark) to (1) AI city creation from text and (2) an intervention agent loop measured by the existing simulator. Citizen AI (roadmap section 4) is explicitly deferred by the user.
Branch: main working tree (no commits without integrator authorization). Delivery: local changes, tests + typecheck + lint. Test runner: Vitest.
Engram mirror: pending (Engram tools unavailable in this session).

## Specs

S1. User: "listo hacelo a uno y 2, el 3 lo hacemos dsp y conectalo con la api de meta, seria lo correcto ono?" — implement (1) AI city creation and (2) the intervention agent loop; defer (3) citizen AI; connect to the Meta API.
S2. AI proposes structured, validated parameters only; the procedural generator builds the city. Model output outside the existing RandomCityProfile bounds is rejected, never executed.
S3. Agent loop: the model proposes bounded interventions (extra drains 0-12, early warning, reinforcement) from measured simulator metrics; the app applies them, reruns with the same seed, and feeds measured results back. At most 3 iterations; explanations cite only measured deltas.
S4. No key / API failure must not break the demo: deterministic fallback (random profile from seed; existing deterministic recommendations) with an explicit "sin IA" notice.
S5. Secrets stay server-side; the frontend never receives an API key. The server META_API_KEY fallback must actually be reachable when no BYOK key is stored.

## Tasks

- T1 [S2,S5] inline: DONE — backend AI plan schemas + Meta structured calls + /ai/city-plan and /ai/interventions routes + key-resolution fix + tests.
- T2 [S2,S4] inline: DONE — frontend AI client, AI city panel wired to organic generation profile, deterministic fallback + tests.
- T3 [S3,S4] inline: DONE — auto drain placement on lowest terrain cells, agent panel (propose -> apply -> rerun -> compare, max 3), Scene wiring + tests.
- T4 [S1] inline: DONE — focused tests, full test/typecheck/lint, docs note.

## Log

L1. User (verbatim): "listo hacelo a uno y 2, el 3 lo hacemos dsp y conectalo con la api de meta, seria lo correcto ono?"
L2. Verified against official Meta docs (ai.meta.com/api, developers.meta.com): api.meta.ai/v1 is the current OpenAI-compatible base URL; Muse Spark 1.3 is the current default model (1.1 also exists); LLM_-prefixed keys, structured outputs and tool calling are supported. The existing backend client already targets this API.

L3. User: "usa la que esta entonces, segui con todo lo que dijimos" — authorized using the already-configured LLM_ key. It existed only as the coding client's MODEL_API_KEY env var; copied (value never printed) into apps/backend/.env as META_API_KEY (git-ignored). Restart the backend dev server to pick it up.
L4. Live smoke on a throwaway PORT=4001 backend (user's dev server untouched): POST /ai/city-plan returned a valid plan ("Ribera Baja", riverWidthScale 1.15, heightScale 0.7) in ~15 s; POST /ai/interventions returned drains=8 with rationale citing only measured numbers in ~30 s. Live calls found a real bug: frontend sent the context bare while the route expects { context } — fixed and pinned by a fetch-shape test.
L5. Verification: full Vitest suite 477/477 passed before formatting pass; focused AI tests green after; frontend and backend tsc clean; ESLint clean on touched files; git diff --check clean. Browser visual inspection of the new panels NOT run — pending.
L6. Still pending to win: public deployment, rehearsed 3-minute demo (preloaded Eixample), pitch. Citizen AI (point 3) deferred by user.
L7. User: make city creation the main screen with three options (AI, random, specific). Added CityStartScreen as the entry overlay (city renders behind it): AI description, random, and specific (original city or exact seed). 'Crear otra ciudad' button returns to it. Suite 479/479, frontend tsc clean. Visual browser inspection still pending.
L8. User: pressing 'Crear ciudad con IA' must open a chat to describe the city. CityStartScreen now switches to AiChatPanel: conversation, each message re-asks Meta with the accumulated requests, plan shown in chat, nothing built until 'Construir esta ciudad'. Scene split planAiCity/applyAiPlan; in-simulator AiCityPanel unchanged.
L9. User correction: 'ciudad en especifico' means a real zone from the existing Importar zona real o plano menu (map crop / GeoJSON upload), not the original synthetic city. Start screen card 3 now opens that importer (onImportZone: enters simulator with the import card open); card 2 merges random + seed. Suite 480/480.
L10. User: do not generate/render the city before the click. Scene now gates everything on `started`: no backend fetch, no organic generation, no Three.js mount until a creation path is chosen; the start screen renders standalone. Page test updated to the new contract. Suite 480/480, tsc+eslint clean.
L11. User: remove icons, make it much prettier. Start screen + AI chat redesigned (dark blueprint grid, glass cards numbered 01-03, teal accent, no emojis; build/return buttons de-iconed). Suite 480/480. Browser visual check by user pending.
