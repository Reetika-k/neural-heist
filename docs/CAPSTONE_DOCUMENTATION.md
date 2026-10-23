# Capstone Project Submission Report — Neural Heist

Follows the 15-section *Project Submission Report template* of the IIT Patna B3 Capstone guidelines (Project 2: Build and Host a Video Game).

## 1. Cover page

| | |
|---|---|
| **Learner name** | Reetika Kukreja |
| **Email id** | reetikakukreja12@gmail.com |
| **Mobile number** | 9694228896 |
| **Project title** | Neural Heist – a browser stealth-action game where you train your own AI teammates |
| **Capstone track** | Project 2: Vibe Coding Challenge – Build and Host Your Own Online Video Game |

## 2. Project overview

Neural Heist is a 3D browser stealth game set in a neon Indian city. Each of its three missions needs one AI skill that the player trains in a **Lab** before playing: an image classifier for a scouting drone, a reinforcement-learning policy for a robot dog, and a retrieval index for an LLM-powered hacking assistant. In the **Mission**, the teammate performs exactly as well as it was trained, and the guards are AI too (vision cones, suspicion, a state machine, A* pathfinding). An **AI Brain panel** shows every agent's real numbers live and exports them. The objective was to build a complete, tested, hostable game with AI coding assistance, and to make AI/ML concepts tangible through play.

## 3. Problem statement

Students meet machine learning as formulas and accuracy numbers, but rarely feel what those numbers mean. That more and better labels make a classifier more reliable, that a reward function decides what an agent learns, and that a language model can only answer from what it is given are ideas usually explained, not experienced. Most AI teaching tools are notebooks or quizzes, and most games that mention AI use it as decoration.

The target players are students aged 15 to 22 and casual gamers curious about AI, plus capstone evaluators who need to see the AI working. They play in a browser on a laptop, in five-to-ten-minute missions, with no installation, account or paid service.

The challenge for the builder is to deliver a real game (objective, controls, scoring, levels, win and loss, restart, sound, hosting) built with AI assistance, while making the AI inside it genuine: models trained by the player and used without faking, with measurable quality and visible consequences.

The proposed solution is Neural Heist. Before each mission the player trains one teammate. Label camera snapshots badly and the drone misses guards, whose vision cones then stay invisible. Reward the robot dog for touching lasers and it walks straight into one, setting off the alarm. Build a poor search index and the assistant's language model invents a wrong password. Guards use vision cones blocked by walls, a four-state machine and A* search. The score adds the teammate's measured accuracy to stealth and speed, and the AI Brain panel exposes every model's live numbers.

## 4. Target users

- Students (15–22) learning AI/ML who want intuition, not just definitions.
- Casual players who like short stealth or puzzle missions.
- Evaluators and teachers who want to see classification, reinforcement learning and RAG behave live.
- Problem they face: AI concepts feel abstract; existing tools are passive; games rarely let you shape the AI.

## 5. Proposed solution

| Need | How Neural Heist addresses it |
|---|---|
| Feel what labels and data quantity do | Mission 1 Lab: label 30 snapshots, train k-NN, see training vs held-back test accuracy and an overfitting warning; the drone then uses that exact model |
| Feel what rewards do | Mission 2 Lab: three reward sliders and an episode count; Q-learning trains live with a reward curve and policy arrows; the robot dog follows that exact policy; vault extras: new random vaults (retraining needed), bonus batteries (worth a detour?), blinking lasers (learn when, not just where), slippery puddles (risk versus speed), a training challenge, and maps of what the dog learned and where it explored |
| Feel why retrieval matters for LLMs | Mission 3 Lab: chunk size and k; two-hop retrieval with similarity scores; the assistant's LLM answers from that context (without a model, an offline reasoner uses the same context) |
| Real game | Stealth missions with drive, exit, timer, alarm, lives-equivalent (caught), 3 stars, debrief, best scores, restart, sound, settings |
| Transparency | AI Brain panel with live values and JSON/CSV export |

## 6. Key features

1. Three missions, each with a Lab: image classification, reinforcement learning, retrieval-augmented generation.
2. AI guards: 60° vision cones clipped by walls, suspicion meters, Patrol → Suspicious → Search → Chase, A* on the map grid.
3. Teammates that use the player's real models: drone (k-NN), robot dog (Q-table greedy policy), hacking assistant (two-hop TF-IDF retrieval + LLM via a Cloudflare Worker, with fallback).
4. Scoring: finish + stealth + time under par + AI accuracy; up to 3 stars; best score per mission; total on the Heist Complete screen.
5. Win: drive + exit. Lose: caught, alarm runs out, dog trips a laser, dog lost; Restart and Retrain in Lab.
6. AI Brain panel (Tab): guards, drone, dog, assistant, run log; Export JSON and CSV.
7. Neon visuals: low-poly people, drone and dog, lasers, neon signs (including Devanagari), bloom; synthesised sound with a remembered mute.
8. Settings (difficulty, volume, mute, graphics quality, colour-blind cones) and How to Play.
9. Arrow keys (WASD fallback), Shift to sneak, E to interact.
10. Mission 1 Lab shows illustrated CCTV portraits for labelling, with a "Drone's view" toggle that reveals the real 32×32 grainy frames the classifier learns from, so players see the gap between human and machine vision.

## 7. Solution architecture

See `docs/architecture.md` for the full diagram. In short:

```
Player → Browser game (Vite + Three.js)
           ├── Lab: classifier.js · qlearning.js · rag.js (train in the browser)
           ├── Mission: movement · guards (FSM + A* + vision) · mission rules · teammates use the trained models
           ├── AI Brain panel: live values + export
           └── Assistant → Cloudflare Worker → Gemini (Groq backup)   [dev: Ollama proxy; no model: offline reasoning over the retrieved emails]
```

## 8. Tools and technologies

| Part | Used | Note |
|---|---|---|
| Build tool | Vite 8 | `npm run dev`, `npm run build` |
| 3D | Three.js 0.186 (orthographic camera, instanced walls, bloom) | |
| Image classifier | k-NN in plain JavaScript on procedural 32×32 snapshots | README suggested TensorFlow.js MobileNet; replaced to avoid a 16 MB model download, keep it offline and unit-testable |
| Reinforcement learning | Tabular Q-learning in plain JavaScript | as planned |
| Embeddings / retrieval | TF-IDF vectors + cosine + two-hop retrieval | README suggested Transformers.js MiniLM; replaced for the same reasons |
| LLM | Gemini via a Cloudflare Worker (Groq backup); Ollama qwen2:7b locally | no Gemini key on the dev machine; the local proxy uses the same API |
| Charts | Canvas (reward curve) | Chart.js not needed |
| Sound | Web Audio API synthesis | replaces Howler.js + Kenney audio (no downloads) |
| 3D assets | Procedural low-poly models | replaces Kenney/Quaternius packs (no downloads) |
| Testing | `node:test`; Chrome DevTools Protocol scripts | no test framework dependencies |
| Hosting | GitHub Pages, built and published by GitHub Actions on every push to `main`; LLM proxy as a Cloudflare Worker | game live; Worker prepared, see `docs/DEPLOYMENT.md` |
| AI coding assistant | vibe coding: prompts, code, tests and debugging | every prompt in `docs/prompts-log.md` |

## 9. Working prototype

- Local: `npm install && npm run dev` → http://localhost:5173 (with LLM: `npm run dev:llm` and `VITE_LLM_URL=http://localhost:8787/ask npm run dev`).
- Public URL: https://reetika-k.github.io/neural-heist/ (project dashboard: https://reetika-k.github.io/neural-heist/dashboard.html).
- Online, Mission 3's assistant reasons offline over the retrieved emails until the LLM Worker and its free Gemini key are set up: with full recall it answers KESTREL37 and shows how it combined the three emails; with weak retrieval it answers UNKNOWN and names the missing clue. Locally the LLM path is tested with a real model (Ollama).
- Screenshots in `docs/screenshots/`: start (01), Lab (08), drone marks and tags (09), Q-learning Lab (10), dog crossing (11), RAG Lab (12), terminal with LLM answer (13-terminal-llm), Heist Complete (14), AI Brain panel (15), one per mission after the visual pass (16–18), phone-size Lab (19), debrief (06).

## 10. Prompts used

`docs/prompts-log.md` records every instruction given to the assistant, step by step from setup to deployment prep, with what worked, what failed and the follow-up prompt. It also records the autonomy instruction ("complete the project on your end") and the deviations the assistant declared before acting.

## 11. Testing report

`docs/test-report.md`: all 12 README scenarios plus 19 more, with expected and actual results. 72 unit tests; 84 browser checks (66 on the production build and the live site before the later additions); 37 score-scenario checks; 15 phone-size checks; earlier, 66 browser checks passing on the dev server, on the production build and on the live GitHub Pages site (64 with the LLM path enabled, before the last two were added); 6 phone-size checks. Key measured results: classifier 90% held-back accuracy with 30 correct labels (88% on 400 unseen images) vs about 60% with 4 labels; Q-learning finds the 28-step shortest safe path on 20/20 seeds with sensible rewards and walks into a laser on 20/20 seeds with a positive laser reward; retrieval recall 3/3 at the default settings vs 1/3 with one-sentence chunks or single-hop; local LLM answers KESTREL37 with full recall and hallucinates ROBOTX37 with recall 2/3.

All of these measurements are collected in `reports/dashboard.html`, which `npm run dashboard` rebuilds from the game's own code with fixed seeds. `docs/REQUIREMENT_MAPPING.md` maps every PDF requirement to its implementation and test.

## 12. Challenges and solutions

`docs/challenges.md` lists 31 problems and fixes. The most instructive: the retrieval bug where a sentence splitter broke at "Mr." and separated the key clue from its subject (found by measuring recall and then reading the chunks); bloom turning vision cones into grey slabs; the k-NN confidence always reading 100%; and the slow-motion bug where a frame-time cap meant to prevent wall tunnelling made the game crawl on slow machines, fixed with fixed-size substeps.

## 13. Final outcome

A complete three-mission game with real, player-trained AI and honest measurements, playable in the browser, tested end to end in a real browser on both development and production builds, with a Cloudflare deployment path and a working local LLM path. Key learnings: build the game logic as pure, testable modules; measure ML behaviour before building UI around it; read the data when a metric looks wrong; never let the LLM make the decision that matters (the player types the password, the code checks it); and test the production build, not only the dev server.

## 14. Future enhancements

TensorFlow.js MobileNet embeddings and Transformers.js neural embeddings as an optional "online" mode; real camera snapshots; Stage 2 missions (regression for patrol timing, clustering of servers, anomaly detection, a boss); a company AI that adapts security to the player's style between missions; leaderboard; Kenney/Quaternius models and recorded audio; a strict global rate limit with Workers KV.

## 15. Project demo

- Five-minute demo: `docs/DEMO_SCRIPT.md`.
- Public URL: https://reetika-k.github.io/neural-heist/ · Repository: https://github.com/Reetika-k/neural-heist
