# Test report

All tests below were actually run (2026-10-20, macOS, Node 25, Chrome 153 headless). Commands: `npm test` (unit), `npm run test:e2e` (browser, Chrome DevTools Protocol), `npm run test:phone` (phone-size menus).

| Suite | Result |
|---|---|
| Unit tests (`npm test`) | **70 / 70 pass** |
| Browser test, dev server | **79 / 79 pass** (2026-10-23) |
| Browser test, production build (`vite preview` of `dist/`) | **66 / 66 pass** |
| Browser test with the LLM configured (Ollama via the dev proxy) | **64 / 64 pass** (qwen2:7b answered KESTREL37 in 16 s; run before the two Mission 2 checks were added) |
| Phone check, 390 × 844 | **12 / 12 pass** (menus, Labs, drag-to-move gameplay, context action button) |
| Browser test against the live site (https://reetika-k.github.io/neural-heist/) | **66 / 66 pass** (2026-10-22, offline assistant mode) |
| Phone check against the live site | **6 / 6 pass** |

## README scenarios (section 7)

| # | User action | Expected result | Actual result | Status |
|---|---|---|---|---|
| 1 | Press Start | Briefing for Mission 1 appears | "ROOFTOP" briefing shown | Pass |
| 2 | Walk into a guard's vision cone | Suspicion meter fills, then CAUGHT | G1 Suspicious with suspicion 0.18 after 0.4 s; standing still → Chase → CAUGHT | Pass |
| 3 | Hide behind a wall | Guard cannot see the player | Unit test: guard facing a player behind a wall never sees or catches them; cone polygon clipped at walls | Pass |
| 4 | Label only 4 images and train | Overfitting warning, drone misses guards | Warning "Only 4 labelled images… may overfit"; 4-label models average ~60% on unseen images vs 88% with 30 labels (unit test) | Pass |
| 5 | Label 30 images correctly and train | Test accuracy above 85%, drone marks all guards | Test accuracy 90% on the 10 held-back images; drone marked 2/2 guards (and one civilian false positive, shown honestly) | Pass |
| 6 | Set a positive reward for touching lasers | Robot dog learns a bad path, alarm triggers | Laser +5 → learned path hits a laser (20/20 seeds); in the mission the dog trips it, the alarm starts, "LASER TRIPPED" | Pass |
| 7 | Train Q-learning with sensible rewards | Robot dog crosses safely | +10/−10/−0.1 → shortest safe path (28 steps) on 20/20 seeds; in the mission the dog delivers the drive, AI score 100% | Pass |
| 8 | Ask the assistant with the LLM offline | Assistant still helps from the retrieved emails | Since 2026-10-23: "offline reasoning over the retrieved emails" → "PASSWORD: KESTREL37" with the three emails it combined and its steps; with k = 1 it answers UNKNOWN and names the missing clue; also unit-tested for refused connection and HTTP 502. (Before: it only listed the best-matching emails.) | Pass |
| 9 | Press Restart after losing | Mission restarts cleanly | Player back at start, guards back to Patrol with 0 suspicion, fresh timer | Pass |
| 10 | Press Mute | All sound stops and stays muted after reload | Muted state and other settings survive a page reload; M toggles | Pass |
| 11 | Open the game on a phone | Game loads and menus are usable | 390 px: start, How to play, Settings, briefing and Lab fit without horizontal scrolling; buttons reachable | Pass (since 2026-10-23 also gameplay: joystick, SNEAK, USE) |
| 12 | Press Export in the AI Brain panel | JSON and CSV files download | Both files downloaded to disk and parsed; JSON includes lab reports (test accuracy 0.9) and events | Pass |

## Additional scenarios

| # | User action | Expected | Actual | Status |
|---|---|---|---|---|
| 13 | Arrow keys / WASD | Both move the player; walls stop it | → 1.50 → 4.17 in 0.7 s; stops at x = 8.70 against the wall at 9 | Pass |
| 14 | Stand on the exit without the drive | Nothing happens | Exit stays locked | Pass |
| 15 | Start a mission without training | Drone useless | No guard is ever marked; cones stay hidden | Pass |
| 16 | Train only Q-learning with no step penalty | Dog dawdles | Learned policy loops (unit test) → "DOG LOST" in the mission | Pass |
| 17 | Mission 3 Lab search | Two hops with similarity scores | Rotation email first (0.49), hop 2 finds server-room and robot emails | Pass |
| 18 | Enter the retired password ORION12 | Denied | "ACCESS DENIED · 2 attempts left" | Pass |
| 19 | Enter "kestrel 37" | Accepted (case/spaces ignored) | Door opens, drive reachable, recall 100% in debrief | Pass |
| 20 | Three wrong passwords | Alarm | Alarm starts, terminal closes | Pass |
| 21 | LLM configured (Ollama) | Model answers from retrieved emails | "PASSWORD: KESTREL37" in 9.1 s, 379 tokens | Pass |
| 22 | Same with k = 1 (unit-level run) | Missing context | "PASSWORD: ROBOTX37", a hallucination caused by recall 0.67 (documented, not a game failure) | Observed |
| 23 | Settings: Hard | Guards see 10 units | Applied immediately; unit test confirms range and faster noticing | Pass |
| 24 | Finish Mission 3 | Heist Complete with total of best scores | Shown with three mission rows | Pass |
| 25 | Slow frame rate (software renderer + bloom) | Game stays real-time | Initially failed (slow motion); fixed with fixed-size substeps | Pass after fix |
| 26 | Any run | No JavaScript errors | None in every run | Pass |
| 27 | Mission 1 Lab: switch to Drone's view | Shows the real 32×32 grainy frames the model learns from | Pixel frames shown; Camera photo returns to the portraits; labels and accuracy unchanged (90 %) | Pass |
| 28 | Mission 1 Lab frame rate | Smooth on a software renderer | 61 fps (was 3 fps before the 3D render was paused behind opaque pages) | Pass after fix |
| 29 | Settings: click a control, then press M | Sound mutes; checkbox and 🔊 icon update | Mutes after slider, radio or checkbox focus; all three indicators agree; "m" still types in text boxes | Pass after fix |
| 30 | Three wrong passwords, then open the terminal again | Terminal locked; right password refused | "Terminal locked", input disabled, KESTREL37 refused; counter never negative | Pass after fix |
| 31 | Mission 2: look for the way to the drive | Clear route to the console; told the vault is dog-only | Arrow at the screen edge points to the console; glowing CONSOLE · E beacon; tip at the vault wall; arrow and tip hide at the console | Pass after fix |
| 32 | Press M (also Shift+M, Caps Lock M) during play and on Settings | Sound toggles, clearly shown; checkbox agrees and persists | Reproduced on the live site: every form of M toggles; checkbox follows and persists after reopening and reload; audio output 0 while muted (unit test); new on-screen "Sound off / Sound on" message and red-glowing 🔊 while muted | Pass after fix (feedback) |
| 33 | Playtest with 1–3 people: "how do I play?" | Players know what to do without reading a manual | New three-step How to play; first-play guide per mission (paused game, Enter/Next, Skip, ? replays it); objective arrow points to drive / console / terminal / exit in every mission; HUD shows the right mission while the guide is open | Pass after fix |
| 34 | Playtest on a phone | The game is playable with touch | Joystick (screen-relative), SNEAK and USE buttons, wider camera when upright, compact HUD; dragging up moves the player up the screen (dx −0.69, dz −0.92); no horizontal scrolling | Pass after fix |
| 35 | Phone: drag anywhere on the screen to move | The joystick follows the finger; the player moves the way the finger slides | Joystick centres under the touch, sliding left moves the player left on screen (dx −1.21, dz +0.91), it returns to its corner on release; mouse drags on desktop are ignored | Pass |
| 36 | Phone: no joystick; drag to move; E becomes a context button | Movement by dragging only; "use" only where it applies | Joystick removed; a faint ring shows the drag; a short drag sneaks; SEND DOG appears only beside the Mission 2 console and HACK TERMINAL beside the Mission 3 terminal, each tap works and the button disappears after use or when walking away; objective text drops "E" on phones | Pass |
| 37 | Open How to play on a phone or a short laptop window | The whole card can be read and Got it tapped | Before: card clipped, Got it unreachable. After: every full-screen page scrolls when needed; its main button can be scrolled to and is not covered, at 390 × 844, 360 × 640, 1280 × 640 and 1440 × 900; phones show only the phone controls | Pass after fix |
| 38 | Mission 2 Lab: what do positive, negative and zero rewards do? | The Lab explains itself | Measured 26 settings × 20 runs (default +10/−10/−0.1: 20/20 shortest route; laser 0, −1 or positive: 20/20 crash; step 0: 20/20 lost; step ≤ −0.8: 20/20 crash; ≤ 500 runs: 20/20 lost). Added: "How do rewards work?", 5 ready-made settings, a live hint per slider, and a what/why/try explanation under the grid; unit tests tie the texts to real training | Pass after fix |
| 39 | Mission 2 Lab: "it always says 28 steps" | Results change with the player's choices | New vault (random, 22–34 steps, shortest learned 10/10); batteries (+0.2: 28 steps, skipped; +1: 38 steps, both taken); puddles 20 % (safe 32-step route, 100 % vs 78 % for a dry-floor dog); blinking (19 with timing; dogs slip through in ~22); training challenge (~1,165 runs with recommended rewards); value and exploration maps; old dog replayed on a new vault; classic results unchanged | Pass |

## Failures found during development and what changed
See `docs/challenges.md`: 27 entries, including the Node 25 test-runner quirk, the hot-reload test race, camera occlusion, overconfident k-NN confidence, the "Mr." sentence-splitting bug that broke retrieval, bloom washing out cones, and the slow-motion bug at low frame rates.
