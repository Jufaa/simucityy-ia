# Hackathon extras (deploy and guided demo explicitly on hold by the user)

- Citizen AI: POST /ai/citizen narrates one citizen's measured status in first person (Meta, JSON-validated); deterministic local fallback. Panel: pick a person, ask what they are doing and why.
- Autonomous mayor: the intervention agent loops alone (propose -> apply -> fast-forward 20 s -> measure again), max 3 rounds, narrated in the agent history.
- Simulated municipal WhatsApp alerts from measured alarm/evacuation state.
- Resilience score 0-100 from measured outcomes; shown before/after, saved with scenarios, saved list ranked by score.
- AI emergency report appended to the downloadable report (measured numbers + recommendations only); local fallback text when Meta is unavailable.
- Share result button (Web Share API, clipboard fallback).
- Voice dictation in the AI city chat (Web Speech API, es-AR, only when supported).
- News ticker ("Ultimo momento") fed by the measured event timeline.
- Deferred by user: public deployment, guided demo rehearsal.
