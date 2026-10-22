# Architecture

```
Player (keyboard)
  │
Browser game · Vite + Three.js  (src/main.js: screens, game loop with fixed 0.05 s steps, HUD)
  │
  ├── Screens: Start → Briefing → Lab → Mission → Debrief → … → Heist Complete · Settings · How to Play
  │
  ├── Lab (trains in the browser, pure JS, unit-tested)
  │     ├── Mission 1  src/lab/snapshots.js + classifier.js   k-NN image classifier on procedural CCTV snapshots
  │     ├── Mission 2  src/lab/qlearning.js                   tabular Q-learning, player-designed rewards
  │     └── Mission 3  src/lab/rag.js                         chunking, TF-IDF embeddings, cosine, two-hop retrieval
  │
  ├── Mission (pure logic modules, rendered by Three.js views)
  │     ├── src/player/movement.js     circle-vs-grid collision, axis-separated sliding
  │     ├── src/guards/                vision cones (walls block sight), suspicion, FSM Patrol→Suspicious→Search→Chase, A*
  │     ├── src/world/mission.js       objective, alarm, win/lose, score = finish + stealth + time + AI accuracy, 3 stars
  │     ├── src/teammates/drone.js     runs the player's classifier on every character it scans
  │     ├── src/teammates/dog.js       follows the greedy policy of the player's Q-table across the laser vault
  │     └── src/teammates/assistant.js retrieves with the player's index, asks the LLM, or falls back
  │
  ├── AI Brain panel (Tab)  src/brain-panel/   live values from every AI · Export JSON / CSV
  │
  └── Hacking assistant ──POST /ask──▶ Cloudflare Worker (worker/llm-proxy.js) ──▶ Gemini API (Groq backup)
                         │                (origin allow-list, 20 req/h/IP, server-side prompt, key secret)
                         ├── dev: tools/llm-dev-proxy.mjs ──▶ Ollama (qwen2:7b)
                         └── fallback: show the best-matching emails if no LLM answers
```

Design rules: game logic and ML are pure modules with no Three.js or DOM, so they run in Node tests; views only draw; every random process is seedable; every AI decision that matters (grading, door unlock, alarm) is made in code, and the LLM only proposes an answer the player must type.
