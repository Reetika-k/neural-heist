# Neural Heist

A browser stealth-action game where you train your own AI teammates, then use them in missions.
Built for the IIT Patna capstone, Project 2: *Build and Host a Video Game*, using vibe coding with an AI coding assistant.

> **Play online:** https://reetika-k.github.io/neural-heist/ · **Project dashboard:** https://reetika-k.github.io/neural-heist/dashboard.html · **Repository:** https://github.com/Reetika-k/neural-heist
>
> **Status:** complete (Stage 1: three missions). Every push to `main` is tested and published to GitHub Pages by `.github/workflows/deploy-pages.yml`. Online, Mission 3's assistant reasons offline over the emails your index retrieved until the LLM Worker is deployed ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)); good retrieval finds the password, weak retrieval answers UNKNOWN and says which clue is missing.

## Play it

```bash
cd neural-heist
npm install
npm start                        # (same as npm run dev) http://localhost:5173
```

With a local LLM for Mission 3 (optional; otherwise the assistant reasons offline over the retrieved emails):

```bash
ollama pull qwen2:7b
npm run dev:llm                                   # terminal 1: proxy on :8787
VITE_LLM_URL=http://localhost:8787/ask npm run dev  # terminal 2
```

## The game

You are a hacker in a neon Indian city run by a corrupt tech company. Each mission needs one AI skill: train it in the **Lab**, then your teammate performs in the **Mission** exactly as well as you trained it. Guards are AI too. Press **Tab** for the **AI Brain panel**: every agent's real numbers, live, with export.

| Mission | Lab | Teammate in the mission | AI/ML |
|---|---|---|---|
| 1. Rooftop | Label 30 CCTV snapshots, train, check held-back accuracy | Drone scans everyone; guards it identifies show their vision cones, missed guards stay invisible | Image classification (k-NN), overfitting |
| 2. Laser Vault | Set the rewards and the episode count, watch Q-learning train; pick a new random vault or the classic one, and add bonus batteries, blinking lasers or slippery puddles; see what it learned and where it explored; beat your training-challenge record | Robot dog crosses the vault with the learned policy; a bad policy trips a laser | Reinforcement learning (Q-learning) |
| 3. Executive Floor | Chunk 40 leaked emails, build the index and test it: see which clue emails it finds (3 of 3?) and the password the assistant would work out; you never type the password in the Lab | Hacking assistant retrieves emails and asks an LLM for the vault password | Embeddings, retrieval, RAG, LLM |

**Win:** take the data drive to the exit. **Lose:** caught by a guard, the 25 s alarm runs out, the dog trips a laser or gets lost. **Score:** finish + stealth + time under par + your AI's accuracy; up to 3 stars.

## Controls

| Action | Keyboard | Phone / tablet |
|---|---|---|
| Move | Arrow keys (WASD also works) | Drag anywhere on the screen, toward where you want to go |
| Sneak | Shift | A short drag, or the SNEAK button |
| Use console / terminal | E | A button appears next to it: SEND DOG (Mission 2) or HACK TERMINAL (Mission 3) |
| Mission guide again | ? | ? button |
| AI Brain panel | Tab (or 🧠) | 🧠 |
| Mute | M (or 🔊) | 🔊 |
| Menu / restart | Esc / Enter | – |

The first time you play each mission, a short guide explains what to do (the game is paused while it is open), and a green arrow at the screen edge always points to the next objective: data drive, console, terminal or exit.

## Tests

```bash
npm test                 # 71 unit tests (Node, no browser)
# browser tests: start the dev server, then Chrome with
#   --headless=new --remote-debugging-port=9337 --remote-allow-origins=*
npm run test:e2e         # 80 checks: every screen, all three missions, Brain panel, export, settings
npm run test:phone       # 6 checks at 390 px width
```

Results: [docs/test-report.md](docs/test-report.md). All 12 README scenarios pass.

## Project structure

```
src/main.js              screens, game loop (fixed 0.05 s steps), HUD, wiring
src/engine/              renderer + bloom, camera follow, low-poly people
src/world/               maps, missions, mission rules, civilians, vault, terminal, props, decor
src/player/              movement and collision
src/guards/              A*, vision, state machine, rendering
src/lab/                 snapshots + classifier · qlearning · rag · seeded RNG
src/teammates/           drone · robot dog · hacking assistant · views
src/screens/             the three Lab screens
src/brain-panel/         AI Brain panel + export
src/audio/sound.js       Web Audio sound
src/settings.js          difficulty, volume, quality, colour-blind palette
public/data/emails.json  40 fictional leaked emails
worker/                  Cloudflare Worker LLM proxy + wrangler.toml
tools/llm-dev-proxy.mjs  same API backed by Ollama
tests/                   unit tests · e2e-browser.mjs · phone-check.mjs
reports/dashboard.html   project dashboard (scripts/build-dashboard.mjs)
docs/                    concept · architecture · report · prompts log · challenges · test report · demo · deployment · screenshots
```

## Docs

- [Capstone report (15 sections)](docs/CAPSTONE_DOCUMENTATION.md)
- [Concept](docs/concept.md) · [Architecture](docs/architecture.md) · [Deployment](docs/DEPLOYMENT.md) · [Demo script](docs/DEMO_SCRIPT.md)
- [Prompts log](docs/prompts-log.md) · [Challenges](docs/challenges.md) · [Test report](docs/test-report.md)
- [Requirement mapping](docs/REQUIREMENT_MAPPING.md) · [Project dashboard](reports/dashboard.html) (rebuild with `npm run test:tap && npm run dashboard`)
- The dashboard is also served by the game: `http://localhost:5173/dashboard.html` (or `/reports/dashboard.html`) with `npm run dev`, and at `<public URL>/dashboard.html` once deployed. `npm run build` copies it into `dist/`.

## Deviations from the original plan

TensorFlow.js MobileNet, Transformers.js MiniLM, Howler.js and the Kenney/Quaternius packs were replaced by plain-JS k-NN, TF-IDF retrieval, Web Audio synthesis and procedural models. Reasons: the game stays offline-capable for demos, every ML component is unit-testable, and nothing needs a manual download. The LLM path is real (Worker for Gemini; tested locally through Ollama). Stage 2 items (missions 4–7, adaptive company AI, leaderboard) are listed under Future Enhancements in the report.
