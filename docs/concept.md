# Neural Heist — Game Concept (PDF Project 2, Step 1)

| | |
|---|---|
| **Game name** | Neural Heist |
| **Genre** | Browser stealth-action with an AI "lab" before each mission |
| **Target player** | Students aged 15–22 and casual gamers who are curious about AI; also capstone evaluators who want to *see* AI/ML working. Sessions of 5–10 minutes per mission. |
| **Setting** | A neon Indian city at night, run by a corrupt tech company. You are a hacker. |
| **Objective** | Steal the target (a glowing data drive) from each building and reach the exit without being caught. Before each mission you train one AI teammate in the **Lab**; in the **Mission** that teammate performs exactly as well as you trained it. |
| **Controls** | Arrow keys move (WASD also works) · `Shift` sneak (slower, quieter) · mouse to aim the hacking tool · left click / `E` hack and interact · `Q`, `R` teammate abilities · `Space` pause and give orders · `Tab` AI Brain panel · `Esc` menu |
| **Scoring** | Stealth (never fully spotted) + time (under par) + your AI's accuracy. Up to 3 stars per mission: 1 for finishing, 1 for never being fully spotted, 1 for finishing under par time. Best score saved in the browser. |
| **How the player wins** | Pick up the data drive and reach the exit zone. Clearing Missions 1–3 completes the game. |
| **How the player loses** | A guard's suspicion meter fills (caught), or the alarm timer runs out after an alert. |
| **Levels** | **1. Rooftop** – Lab: label camera snapshots as guard/civilian → drone marks guards (image classification, accuracy, overfitting). **2. Laser Vault** – Lab: design rewards and train a robot dog → it crosses the lasers (reinforcement learning, Q-learning). **3. Executive Floor** – Lab: build a search index over leaked emails → the hacking assistant finds the vault password (embeddings, RAG, LLM). Difficulty rises with more guards, laser timing and tighter par times. |
| **Challenge mechanisms** | Guards with vision cones and suspicion meters; a state machine (Patrol → Suspicious → Search → Chase) with A* pathfinding to your last-seen position; alarm timer; your teammate's real model quality. |
| **AI the player can see** | The **AI Brain panel** (`Tab`) shows live, real numbers: guard states and suspicion, drone confidence and test accuracy, Q-learning reward curve and epsilon, RAG retrieved chunks and similarity scores. |
| **Visual style** | Angled top-down 3D (Three.js, orthographic camera), dark blue night, neon cyan/pink/violet lights and signs (including Devanagari), procedural low-poly characters, bloom. |
| **Sound** | Footsteps, guard alert, hack success, mission win/fail, quiet background music; mute button that is remembered. |
| **Technology** | Vite, Three.js, plain-JS k-NN classifier, plain-JS Q-learning, TF-IDF two-hop retrieval, an LLM behind a Cloudflare Worker (Ollama locally), Web Audio sound; hosted on Cloudflare Pages or GitHub Pages. (TensorFlow.js/Transformers.js/Howler.js were replaced to keep the game offline-capable and testable; see the report.) |
