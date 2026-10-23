# Requirement → Implementation mapping (Project 2, Neural Heist)

Requirements come from the PDF's Project 2 section (objective, steps 1–12, expected outcomes) and from the Neural Heist build guide. Test ids: `U` = unit test in `tests/*.test.mjs`, `B#` = scenario number in [test-report.md](test-report.md) (headless Chrome, `tests/e2e-browser.mjs`), `P` = phone check (`tests/phone-check.mjs`), `D` = measured in [reports/dashboard.html](../reports/dashboard.html), `M` = manual (demo script).

## PDF requirements

| Requirement from PDF | Implementation | File / feature | Tested? |
|---|---|---|---|
| Clear objective | Take the data drive to the exit; objective line in the HUD and in each briefing | `src/world/missions.js` objectives, `index.html` HUD | B1, B14 |
| Player controls | Arrow keys (WASD fallback), Shift to sneak, E to use, Tab, M, Esc/Enter | `src/player/movement.js`, `src/main.js` | U (movement, collision), B13 |
| Scoring | Finish 1000 + stealth 500 + 20 per second under par + up to 500 for your AI; 3 stars; best score per mission saved | `src/world/mission.js` `scoreMission()`, `src/main.js` | U (scoring, stars), B24, D |
| Challenges | Guards with vision cones and a 4-state AI, a 25 s alarm that never resets, lasers, a password terminal | `src/guards/`, `src/world/mission.js`, `vault.js`, `terminal.js` | U (vision, FSM, alarm), B2, B3, B20 |
| At least three levels / increasing difficulty | Three missions, each with a new AI skill, more guards and longer routes; Easy / Normal / Hard settings | `src/world/missions.js`, `src/settings.js` | B24, B23, D |
| Win or loss conditions | Win at the exit with the drive. Lose when caught, when the alarm runs out, or when the dog trips a laser or gets lost | `src/world/mission.js`, `src/teammates/dog.js` | U (win, alarm loss), B2, B6, B16 |
| Restart capability | Retry on the caught and debrief screens, Enter shortcut, back to the Lab to retrain | `src/main.js` `restart()` | B9 |
| Attractive visuals | Three.js low-poly neon city with bloom, angled camera, signs, colour-blind palette | `src/engine/`, `src/world/decor.js`, `props.js` | Screenshots 16–18, B26 |
| Start screen: title, instructions, Start button | Start screen, How to play, Settings | `index.html` `#screen-start`, `#screen-howto` | B1, P |
| Game-over screen: final score, best score, restart | Caught screen (best score, retry) and debrief (score breakdown, stars, best, next/retry) | `#screen-caught`, `#screen-debrief`, `#screen-complete` | B9, B24 |
| Timer or challenge mechanism (Step 8) | Mission timer with par time; alarm countdown | `src/world/mission.js` | U, B2 |
| Lives / health (Step 6) | One life per attempt; the suspicion meter is the warning bar before capture | `src/guards/guard.js` | U, B2 |
| Obstacles / enemies (Step 5) | Patrolling guards with A* chase, lasers, locked doors, civilians as look-alikes | `src/guards/`, `src/world/civilians.js` | U, B2, B5, D |
| Sound with mute option (Step 10) | Web Audio synthesised sound, volume setting, M key and 🔊 button, remembered after reload | `src/audio/sound.js`, `src/settings.js` | B10 |
| Test the game (Step 11) | 61 unit tests, 66 browser checks on dev and production builds (64 with the LLM enabled), phone check | `tests/` | All, see [test-report.md](test-report.md) |
| Online hosting / public URL (Step 12) | Live on GitHub Pages: https://reetika-k.github.io/neural-heist/, published by GitHub Actions; LLM proxy prepared as a Cloudflare Worker | `.github/workflows/deploy-pages.yml`, `docs/DEPLOYMENT.md`, `worker/` | B (full browser test against the live site) |
| Game instructions | How to play screen, Lab hints, README | `#screen-howto`, `README.md` | B1, P |
| Project explanation | Report with 15 sections, concept, architecture | `docs/CAPSTONE_DOCUMENTATION.md`, `concept.md`, `architecture.md` | – |
| Live gameplay demonstration | Script with timings | `docs/DEMO_SCRIPT.md` | M |
| Use of AI tools during development | Prompts log and challenges with how AI helped | `docs/prompts-log.md`, `docs/challenges.md` | – |

## AI features (Neural Heist build guide)

| Requirement | Implementation | File / feature | Tested? |
|---|---|---|---|
| Guard AI: pathfinding | A* with Manhattan heuristic, BFS baseline | `src/guards/astar.js` | U (A* = BFS length), D (cells expanded) |
| Guard AI: vision and states | 8-unit 60° cone blocked by walls; Patrol → Suspicious → Search → Chase | `src/guards/vision.js`, `guard.js` | U, B2, B3 |
| Mission 1: image classification | Player labels 30 snapshots; k-NN (k = 3); drone reveals guards it classifies as guards | `src/lab/classifier.js`, `snapshots.js`, `src/teammates/drone.js` | U, B4, B5, B15, D |
| Mission 2: reinforcement learning | Q-learning with player-set rewards; dog follows the greedy policy | `src/lab/qlearning.js`, `src/teammates/dog.js` | U, B6, B7, B16, D |
| Mission 3: RAG + LLM | TF-IDF index, two-hop retrieval, LLM through a Worker; offline reasoning over the same retrieved emails when no model is connected | `src/lab/rag.js`, `src/teammates/assistant.js`, `worker/llm-proxy.js` | U, B8, B17–B22, D |
| AI Brain panel with export | Live numbers for every agent; JSON and CSV export | `src/brain-panel/` | U (export), B12 |
| Phone support | Menus, Labs and gameplay at 390 px: drag anywhere on the screen to move (short drag = sneak), SNEAK button, and the E key as a context button that appears only next to the console (SEND DOG) or terminal (HACK TERMINAL); wider camera on upright screens | `src/style.css`, `src/main.js`, `src/engine/scene.js` | P (12 checks incl. drag movement and the context button) |
| Clear instructions (from playtesting) | Three-step How to play; first-play guide per mission (game paused); objective arrow in every mission; ? replays the guide | `index.html`, `src/main.js` | B (guide, pause, replay, arrow) |

Optional features included: difficulty levels, colour-blind palette, graphics quality setting, best score per mission, AI Brain export. Also included after playtesting: touch controls and a first-play guide. Not included: leaderboard, multiplayer.
