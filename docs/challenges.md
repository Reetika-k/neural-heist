# Challenges and solutions

## Test runner found no tests
What broke: `npm test` reported one failing item named "tests".
Error: Node 25's `node --test tests/` treated the directory as a test file.
How AI helped: recognised the same issue from the previous project.
Fix: the script runs `node --test tests/*.test.mjs`.

## Neon trim hid the walls
What broke: the maze looked like flat cyan slabs and the player was hard to see.
Error: visual — found by taking a screenshot during the browser test, not by any assertion.
How AI helped: diagnosed that the trim box was as wide as the wall top; proposed moving it to the floor line and adding a ground ring under the player.
Fix: neon strip at the base of walls, light player body with a cyan ring, camera half-height 9 → 7.

## Browser test failed right after code edits
What broke: "Start → playing" failed twice in a row although the button worked by hand.
Error: no JavaScript error; the game simply never left the start screen during the test.
How AI helped: a focused debug script showed the click works in isolation, and Vite's log showed page reloads triggered by the file edits; the test had been racing Vite's hot reload.
Fix: run browser tests only when no file edits are in flight; the unchanged test then passed 7/7. Also tightened the wall check, which had passed even when the player never moved.

## Known issue (closed in Step 4)
The player could be hidden behind tall walls on the camera side; fixed in Step 4 (see "Objective hidden behind walls").

## Objective hidden behind walls
What broke: the data drive is in the bottom-right corner, on the camera side, so tall near walls hid the player exactly where the objective is.
Error: visual, found from the Step 4 screenshots.
How AI helped: identified the camera offset (+x, +z) as the cause and proposed the cheapest fix before trying wall-fading shaders.
Fix: walls 1.6 → 1.1 high, camera offset (10, 16, 12) → (6, 18, 8). The open "known issue" from Step 2 is closed.

## Debrief time box overflow
What broke: "0:00 (par 0:45)" overflowed its stat box on the debrief.
Fix: par time shown as a separate small line under the time.

## k-NN confidence was always 100%
What broke: every drone label showed 100%, including a civilian wrongly labelled a guard.
Error: with k = 3, three agreeing neighbours always give a 100% vote share.
How AI helped: measured accuracy and calibration for k = 3, 5, 7 on 400 unseen images.
Fix: kept k = 3 (best accuracy, 88%), documented that confidence is overconfident but still informative (0.98 average when right, 0.77 when wrong).

## Retrieval missed the clues (recall 1/3)
What broke: the assistant's context held only one of the three emails needed for the password.
Error: no error, just poor recall at the default settings.
How AI helped: three measured iterations: (1) hop 2 repeated the question's words and pulled in the retired-password decoy; (2) removing them still diluted the lead with off-topic chunks; (3) printing the chunks revealed the sentence splitter broke at "Mr.", separating the clue from "Varma's first robot".
Fix: abbreviation-aware sentence splitting; hop 2 follows only the best lead without the question's words. Recall 3/3 at the defaults; unit tests pin the behaviour.

## Bloom washed out the vision cones
What broke: after adding bloom, cones looked like solid grey slabs and the dog's light like a white blob.
Fix: pale-blue cone base colour, lower opacity, no tone mapping on cones; dimmer dog light; fainter drone ring.

## Signs over walkable floor
What broke: a neon sign floated over the Mission 3 corridor and covered the player.
Fix: every sign moved onto a wall cell; a unit test enforces it.

## Slow motion on slow machines
What broke: on the production build in a software-rendered browser, the player moved at about a quarter speed.
Error: the frame time was capped at 0.05 s to prevent tunnelling, so below 20 fps the game itself slowed down.
How AI helped: identified the cap from the movement numbers (1.50 → 2.23 in 0.7 s instead of ~4.3).
Fix: fixed-size simulation steps: each step ≤ 0.05 s, several steps per slow frame. Movement is real-time again (1.50 → 4.17 in 0.7 s).

## Test-script slips
What broke: a browser check referenced `document` in Node, and one key was held too briefly for a slow renderer.
Fix: corrected the script and the hold time; the game was not at fault.

## Lab snapshots looked blurry
What broke: in the Mission 1 Lab the guard and civilian snapshots looked fuzzy, reported by the user from a screenshot.
Error: not scaling. Every pixel carries random camera grain to imitate a night CCTV feed, and on a 32×32 image that grain swamps the visor, badge and cap.
How AI helped: confirmed the cards already used pixelated scaling, so the grain was the cause; proposed keeping the grainy pixels for the model and showing a clean copy.
Fix: each snapshot also stores a grain-free copy used only for display, drawn at an exact 8× scale. The classifier still trains and predicts on the grainy pixels, so accuracy is unchanged (90 % held-back, all 53 unit tests pass).

## Moving a slider during Q-learning training crashed the Lab
What broke: the browser test sometimes failed with "Cannot read properties of null (reading 'done')".
Error: changing a reward slider clears the agent, but the running training animation kept calling it on the next frame. A slow machine hit it when training outlasted the test's wait; a player could hit it by dragging a slider mid-training.
How AI helped: traced the error to the slider handler and reproduced it by changing a reward 150 ms into training.
Fix: each training animation remembers its own agent and stops as soon as the agent changes; the Train button is enabled again. The reproduction now shows no error and retraining works. Other failures seen in the same session came from a system load average above 130 and passed 62/62 once the load dropped.

## Lab characters looked stiff and hard to read
What broke: a design review of the Mission 1 Lab (requested by the user) found blocky, faceless full-body sprites; the visor, cap and badge the player must spot were 1–3 pixels; the neon squares read as dead pixels; nothing said "camera".
Error: design, not code. The 32×32 frame is the classifier's input, so it could not simply be redrawn without changing the AI's data and every measured result.
How AI helped: proposed separating what the player sees from what the model sees. The generator now records each person's traits (uniform colour, visor, cap, badge, hair, sunglasses, scarf, lighting, sign) without changing its random draws, verified with a SHA-256 fingerprint of 2,040 frames before and after.
Fix: illustrated head-and-shoulders CCTV portraits drawn from those traits (glowing visor, cap with emblem, gold badge, epaulettes; civilian hairstyles and collars; neon sign, rim light, scanlines, CAM label), plus a "Drone's view" toggle that shows the real grainy frame the classifier learns from. Accuracy is unchanged (90 % held-back).

## Lab ran at 3 frames per second
What broke: after the portraits, the Mission 1 Lab ran at about 3 fps in the software renderer, and browser tests failed at random points.
Error: the 3D city kept rendering with bloom every frame behind opaque full-screen pages, forcing the browser to recomposite the Lab's 30 images each frame.
How AI helped: measured frame rates per screen (Mission 2 Lab 51 fps, Mission 1 Lab 3 fps), then found the render call ran regardless of the screen.
Fix: the game skips the 3D render while the start, settings, how-to, briefing or Lab page covers it. Mission 1 Lab: 3 → 61 fps; missions unchanged (about 34 fps); browser test 62/62 on three runs in a row.

## M did not mute on the Settings screen
What broke: reported by the user. On Settings, pressing M did nothing, although the screen says "Mute (also M or 🔊)".
Error: the key handler ignored every key while any input had focus, to keep letters out of shortcuts while typing the password. Radio buttons, the volume slider and the Mute checkbox are inputs too, so after clicking one, M was swallowed. Separately, muting with M or 🔊 never updated the Settings checkbox.
How AI helped: found the over-broad focus check, then tested with real key presses on each kind of control.
Fix: shortcuts are skipped only in text fields; the checkbox follows every mute change; holding M no longer toggles repeatedly. Verified: M works after clicking the slider, a radio button or the checkbox; the checkbox, the 🔊 icon and the saved setting agree; typing "m" in the Mission 3 search box still types it.

## Terminal kept accepting passwords after the alarm
What broke: found in a code review during the final test pass. After three wrong passwords the alarm starts and the terminal says "0 attempts left", yet it still accepted guesses: the right password still opened the door, and a fourth wrong guess made the counter read "-1 attempts left". Pressing E again while the model was still answering sent a second LLM request, and an answer arriving after a restart was stored in the new run.
How AI helped: read the terminal flow against the rule in the briefing ("Three wrong passwords set off the alarm") and listed each inconsistent state.
Fix: the terminal locks after three wrong passwords for the rest of the run (input disabled, "Terminal locked"); the counter never goes below zero; one shared assistant request per run, discarded if the mission restarts. Two browser checks added: the locked terminal shows "Terminal locked" and refuses even KESTREL37.

## Browser test failed on a busy machine
What broke: during the final pass another program used 3–5 CPU cores (system load 15–76). The browser test then failed at random places, for example the player not moving during a 0.7-second key press.
Error: the checks used fixed waits (press a key for 0.7 s, sleep 300 ms, then check), so they measured the machine's speed, not the game.
How AI helped: showed the failures moved between runs and matched the load, then measured the game's frame rate with and without the latest change to rule out a regression.
Fix: 19 fixed waits became "wait until the expected result, up to several seconds"; the check still fails if the result never comes. The reload wait was raised to 30 s.

## Players could not find the way in Mission 2
What broke: reported by the user: "I am not able to find the path to the documents… I am not able to move inside" the laser vault.
Error: no movement bug: the vault is meant to be crossed only by the robot dog, and the console beside it is reachable (A* path of 16 steps from the start). But nothing showed this. The "VAULT" sign hung on a lobby wall far from the vault and pointed players the wrong way; the console was a small dark desk, off-screen from the start; the drive glowed inside the vault and invited players to walk in; pushing against the vault wall gave no feedback.
How AI helped: took screenshots from the start, at the vault wall and at the console to see what a player sees, and listed what was missing.
Fix: the VAULT sign now hangs on the vault's own wall beside the console and "NO ENTRY" became "DOG ONLY"; the console has a pulsing light column, a floor ring and a floating "CONSOLE · E" label until the dog is sent; an arrow at the screen edge points to the console while it is off-screen; at the vault wall a tip says "Only your robot dog can cross the lasers · go to the glowing console"; the objective reads "Go to the glowing console, press E: your dog fetches the drive". Two browser checks added.

## Without a language model, the assistant left the puzzle to the player
What broke: raised by the user after playing the live site: the terminal showed "I could not reach the language model", a list of emails and the raw instructions written for the model, so every player online had to solve the password puzzle by hand. "We are building the game for everyone and this is not the correct way to get the password."
Error: design. The public site has no model connected (no API key), and the offline path only dumped the best-matching emails.
How AI helped: proposed an offline reasoner that reads only the emails the player's index retrieved, the same context a model gets, so the Mission 3 lesson survives: good retrieval → the right answer, weak retrieval → no answer. Checked it against every Lab setting and every distractor.
Fix: `src/teammates/reasoner.js` finds the password rule (ignoring old or retired passwords), Mr. Varma's first robot (not the robotics club's Atlas) and the floor of the new server room (not the old floor 12), then answers "PASSWORD / WHY" with the steps it took. Default index: KESTREL37 from the three clue emails; k = 1 or 2: UNKNOWN, robot missing; one-sentence chunks: UNKNOWN, rule missing. The model prompt is folded under "Behind the scenes". Three unit tests added (56 in total); the browser check now expects the reasoned answer.

## "M does not mute, and the Mute checkbox resets"
What broke: reported by the user after trying M, Shift+M and Caps Lock M many times on the live site; the Settings checkbox also seemed to reset.
Error: no fault in the logic. Reproduced on the live site with real key presses: every form of M toggled mute, the checkbox followed it, and the setting survived reopening Settings and reloading. A fake Web Audio test confirmed the speakers get 0 while muted. The real problem was feedback: M and 🔊 switch sound off AND on, and the only sign was a small icon in the corner. After ticking "Mute" in Settings, the next M press switched sound back on, and Settings then (correctly) showed the box unticked, which looked like a reset.
How AI helped: reproduced each step the user described, then measured the actual audio output instead of trusting the flag.
Fix: every change of sound state shows a message at the top ("🔇 Sound off · press M to turn it on" / "🔊 Sound on · press M to mute"); the 🔊 button glows red while muted; the Settings label says "Mute all sound" and explains that M and 🔊 flip it. Two unit tests check that muting silences music, effects and the siren, that changing the volume does not unmute, and that a saved mute applies from the first sound (58 unit tests).

## Playtesters did not know how to play, and could not play on a phone
What broke: the user playtested with 1–3 people. Two findings: "we are not saying how we are playing; it is so confusing, the game instructions are not clear", and "it is not mobile friendly".
Error: design. The instructions were one text-heavy page shown before the game, and nothing guided players once a mission started; only Mission 2 had an arrow to its objective. On phones the menus and Labs worked, but moving needed a keyboard.
How AI helped: turned the two findings into specific changes, then checked each in a desktop and an emulated phone browser with real key presses and touch drags (including the direction a joystick push moves the player on screen).
Fix: How to play is now three steps (briefing → Lab → mission) with keyboard and phone controls side by side. The first time each mission is played, a short guide explains it step by step while the game is paused (Enter/Next, Skip; ? replays it). A green arrow at the screen edge points to the current objective in every mission. Phones get a screen-relative joystick, SNEAK and USE buttons (USE lights up when usable), a wider camera when upright and a compact HUD. Found while testing: the HUD kept the previous mission's name while the guide paused the game; it now refreshes at mission start. Browser test 72/72 (5 new checks), phone check 9/9 (3 new, including joystick movement).

## On phones: no joystick, and what to do with the E key
What broke: after drag-anywhere was added, the user asked to remove the joystick entirely and to "think about how you handle the E button".
Error: design. E means "use what I am standing next to" (send the dog from the console, open the terminal). A permanent USE button is clutter most of the time, and "tap the screen to use" would clash with drag-to-move.
How AI helped: proposed a context action: a large button that appears only when something is usable, named after the action, and checked it in both missions on an emulated phone.
Fix: the joystick is gone (commented out); dragging anywhere moves, with a faint ring under the finger as feedback, and a short drag sneaks. On phones the E key is a button that appears only beside the Mission 2 console ("SEND DOG") or the Mission 3 terminal ("HACK TERMINAL") and disappears after use or when walking away; the "Press E" chip and "(E)" in the objective are hidden on phones. Phone check 12/12.

## How to play was cut off (not mobile friendly)
What broke: reported by the user with a screenshot: the How to play card ran past the bottom of the window and its "Got it" button could not be reached; on phones the same happened, and the 🔊 button covered menu text.
Error: every full-screen page centred its card with CSS grid while the page itself could not scroll (body overflow hidden), so a card taller than the window was clipped at both ends. The phone test only checked that buttons fitted the width, so it passed anyway.
How AI helped: reproduced it at 390 × 844, 360 × 640 and a 1280 × 640 laptop window, then checked every full-screen page (start, How to play, Settings, briefing, caught, debrief, complete, terminal): scroll to the main button, confirm it is fully on screen and nothing covers it. A first attempt also overrode the cards' own width limits (How to play stretched to the full laptop width); the screenshot caught it.
Fix: screens scroll when the content is taller than the window and stay centred when it fits; cards have less padding on narrow screens; on phones How to play shows only the phone controls; on menu pages the 🔊 button moves to the top-right corner. The phone test now checks that buttons can be scrolled to and tapped; run against the old layout it fails, as it should. Phone 12/12, browser 72/72.

## The Mission 2 Lab did not explain rewards
What broke: the user found the Q-learning Lab "so confusing": what do the rewards do, and what happens with positive, negative or zero values?
Error: design. The Lab showed three sliders and a one-line verdict ("Check the laser reward: is touching one actually punished?") without saying what each value means or why the dog behaved as it did.
How AI helped: first measured the behaviour: 20 training runs for each of 26 settings. Lasers must cost −2 or less (0 or −1 teaches the dog to crash, a positive value makes lasers a prize); a step cost between −0.1 and −0.7 finds the shortest 28-step route, 0 makes the dog wander and get lost, −0.8 or lower makes crashing cheaper than walking; 700+ training runs are enough, 500 or fewer are not; a drive reward of 0 still works in 17 of 20 runs. Then turned those findings into plain-English help and tested the help against real training.
Fix: a "How do rewards work?" panel (positive = do more of this, negative = avoid this, zero = I don't care); five ready-made settings (Recommended, Reckless dog, Lazy dog, Rushed dog, Too little practice), each showing one lesson; a live hint under every slider that changes with its value; and after training, an explanation under the grid: what happened, why (with the player's own numbers), and what to try. `src/lab/reward-advice.js` holds the texts; three unit tests check that each preset really behaves as promised, that the explanation names the real cause, and that the slider hints agree with training at the measured thresholds. Browser test 74/74 (2 new checks).

## "It always says 28 steps": making the robot-dog Lab more interesting
What broke: the user noticed every good training run ends with the same 28-step route, and asked for all six suggested upgrades: new vaults, a slippery floor, bonus batteries, blinking lasers, a training challenge and views of what the dog learned.
Error: design. One fixed layout and a deterministic dog give one answer.
How AI helped: rebuilt the Q-learning core around an *environment* (layout plus options) and kept the classic vault byte-for-byte identical (same learned table and reward history on 40 seed/reward combinations), then measured every new mechanic before building UI for it. Two first designs did not work and were changed on evidence: (1) a slippery floor everywhere gave 0 % success, because every corridor runs beside a laser wall, so with slipping everywhere no safe route exists and the dog either gambles or freezes; a higher discount (γ = 0.99) and a shrinking step size did not help. Slipping was limited to **puddles** in the wall gaps beside the lasers, with a dry crossing always a couple of steps away: the dog then learns the safe 32-step route with 100 % success, while a dry-floor dog on the same puddles manages 78 %. (2) Batteries placed in the far corner were never discovered (the dog rarely explores there), and batteries on a shortest route were collected for free; they now sit in corridors the dog explores, and the measured rule "worth it once the bonus beats about 3 × the step cost" drives the hint.
Fix: New vault / Classic buttons (a first visit gets a random vault; a dog trained on another vault is replayed on the new one to show why it must retrain); Bonus batteries with their own reward slider; Blinking lasers (on 3 steps, off 3; the dog can wait; shortest route 19 with timing); Slippery puddles (0–30 %); the Training challenge (first practice run after which the route reaches the drive, with a personal best per vault); "What it learned" (value map) and "Where it explored" (visit heat map). The 3D mission draws the vault the dog trained on: blinking lasers follow the dog's own steps, batteries vanish when picked up, and on puddles each mission run is a real roll-out. Hints and explanations cover every extra (e.g. "6,000 practice runs" when blinking is combined with other extras: measured 3/3 vs 1/3 at 3,000 on the hardest vault). Unit tests 70 (9 new), browser 79/79 (5 new), dashboard section "Vault extras".

## "Where do I type the password?": the Mission 3 Lab looked like a password box
What broke: the user could not see how the password is produced: the Lab's search box ("What is the vault password?") looked like the place to enter a password, and nothing said that the assistant finds it in the mission.
Error: design. The Lab showed similarity scores and two hops but never said what the player is building, what the assistant does with it, or whether the clues were found.
How AI helped: measured every setting first (chunk size 1: 1 of 3 clue emails; k of 1 or 2: 2 of 3; chunk size ≥ 2 with k ≥ 3: 3 of 3 and the answer KESTREL37), then rewrote the Lab around that and checked it on desktop and phone.
Fix: the Lab opens with "You don't type the password here": the assistant searches the emails and works the password out in the mission. Three steps (build the index → test it → start the mission); the search box is labelled "The assistant's question (already filled in)"; building the index runs the test automatically; a "Clues found: N of 3" meter and green badges mark the rule, the robot's name and the floor; the hop-2 search words are shown; and the Lab previews "What your assistant would answer in the mission" from exactly the emails it found, with what to change when a clue is missing. Slider hints come from the measurements, and a unit test checks them and the preview on all 24 settings. On phones the results no longer sit in a small scroll box that hid hop 2. The mission terminal marks the clue emails too.

## Mission 3's terminal was not marked like Mission 2's console
What broke: reported by the user: the place to go in Mission 3 (the terminal) did not show the beacon that marks the console in Mission 2.
Error: the beacon (light column, floor ring, floating label) had been built only into the Mission 2 vault; the terminal was a dark desk with a faint glow, and the drive and exit had no labels either.
How AI helped: moved the beacon into a shared piece (`src/world/beacon.js`) and checked each mission in screenshots.
Fix: every objective now has the same beacon, shown only while it is the next thing to do: the console (green, Mission 2), the terminal (purple, Mission 3), the data drive (gold, Missions 1 and 3, after the door opens in Mission 3) and the exit (green, once you hold the drive). Labels show through walls; on phones they drop "· E" (the action button appears instead).

## A perfectly trained drone could only score 60 % in Mission 1
What broke: found while testing scores against the user's real results (Rooftop 2139 = 1000 + 500 stealth + 339 time + 300 AI). A score-scenario test showed the same 300 AI points even with all 30 Lab photos labelled correctly.
Error: the drone's mission score is its accuracy on the five Rooftop characters, and the snapshots chosen for them (seeds 9100–9104) included two dark-coated civilians that even a perfectly trained model calls guards: 60 % at best, although the same model is 89 % accurate on 800 fresh snapshots.
How AI helped: listed each character's prediction, then searched seed sets for a fair one: a perfectly trained drone identifies everyone, while weak training still fails.
Fix: Rooftop characters use seeds 9130–9134: perfect labels → 100 % (full 500 AI points); 4 labels → 53 % on average; 30 % wrong labels → 73 %. A new score-scenario test (`npm run test:scores`, 32 checks) plays all three missions in the browser: good, weak and failed runs, stealthy and chased, under and over par, batteries, a laser-rewarded dog, strong and weak search indexes. It checks every debrief against the scoring rules computed independently, the stars, that a worse replay or a lost mission never lowers the best, the Heist Complete total, and that bests survive a reload.

## Rushing paid more than training, Esc lost the run, and there was no way to pick a mission
What broke: found in a review of Missions 1–3 from a game-design and ML point of view. (1) Pars were 2–3× the fastest run and every second under par was worth 20 points with no cap, so a rushed run with a weak model could outscore a careful one: the game rewarded speed more than AI. (2) The drone's AI score counted only the characters the player had scanned, so scanning fewer people could raise it. (3) Esc quit straight to the main menu and threw the run away. (4) Start always began at Mission 1, so a returning player (or an evaluator) had to replay two missions to reach Mission 3. (5) When the Mission 3 assistant could not work the password out, the terminal gave no way back to fix the index.
Error: scoring tuned before the missions were finished; menus built for a single first play.
How AI helped: computed the score parts for fast, slow, good-AI and weak-AI runs to find the cap that keeps speed a bonus (300 < 500 AI points), and added independent score checks in the browser.
Fix: pars 35/45/50 s, 10 points per second under par, capped at 300; the drone is scored on every mission character (`modelAccuracy`). Best scores restart under the new rules (new `neural-heist.v2.*` keys) because old, inflated bests could never be beaten. A mission select screen shows every mission (none locked) with its best score and stars; first-time players still go straight to the Mission 1 briefing. Esc or the ❚❚ button opens a pause menu (Resume, Restart, Retrain in the Lab, Quit) that freezes the player and the clock, and switching browser tabs pauses too. The Mission 3 terminal shows "Improve the search index (back to the Lab)" whenever the answer has no password or a clue email is missing.

## The AI lessons stopped at accuracy, and mistakes had no cost in play
What broke: from the same review of Missions 1–3. (1) Mission 1 showed one accuracy number on 10 test photos (each photo moved it by 10 points) and treated a missed guard and a wrongly flagged civilian the same, although in the mission one is dangerous and the other harmless. (2) A civilian wrongly called a guard cost nothing. (3) Mission 3 always used two search hops, so players never saw why multi-step retrieval matters. (4) Mission 2 looked passive (press E, watch the dog).
Error: design gaps, plus one wrong assumption in the review: Mission 2 already had a guard walking past the console.
How AI helped: measured each idea before building it: the threshold trade-off on 400 unseen photos and on the Rooftop characters, one vs two hops on all 24 chunk/k settings, and a guard simulation with the player at the console for 30 arrival times.
Fix: Mission 1 Lab tests on 40 held-back photos, adds a "how sure before calling someone a guard" slider (the drone uses it) and a table of spotted, missed, false alarms and cleared, with recall and precision. In the mission, a civilian the drone wrongly calls a guard gets its spotlight and the nearest patrolling guard walks over to check (`investigate()` in the guard brain). Mission 3 Lab has a 1 hop / 2 hops switch: one hop finds only 1 of 3 clues everywhere. For Mission 2 the measurement showed standing at the console gets you caught every time and the spot two cells west is always safe, so no new guard was added; the HUD, objective, guide and briefing now tell the player to hide while the dog crosses.

## Connecting the live game to a real language model
What broke: two problems while putting the language model online. (1) On a new Cloudflare account the connect script failed with "register a workers.dev subdomain": wrangler wanted to ask whether to create one, but the script piped its output through `tee`, which made it non-interactive, so it answered "no" by itself. (2) Once the Worker was live, Gemini answered HTTP 404.
Error: (1) a pipe turns off a command's interactive questions; (2) the Worker asked for `gemini-2.0-flash`, which Google has shut down.
How AI helped: read wrangler's "Using fallback value in non-interactive context" line to find the cause of (1); for (2) called the Worker directly with curl, which returned "gemini 404" and pointed at the model name rather than the key, then checked Google's current model list.
Fix: the script runs `wrangler deploy` through `script` (a real terminal, output still recorded to read the Worker URL) and skips login when already logged in. The Worker uses `gemini-3.5-flash-lite`: it answers KESTREL37 in about 1.4 s, refuses other websites (403), and the live browser test passes 88 / 88 with "answer comes from the model". The key was typed into wrangler's hidden prompt and exists only as a Cloudflare secret.

## The music never stopped, and the sound was tiring
What broke: reported by the user: "the sound is running continuously, even when I closed the browser", and "the sound is so annoying as a game player".
Error: two causes. (1) Each automated browser test opened the game in a new tab of a hidden test browser and never closed it; 14 finished tabs kept playing the music in the background after the user's own browser was closed. (2) The game itself never silenced a hidden tab, and the sound design wore players down: a buzzing sawtooth drone with the same six-note arpeggio every 2.1 s on every screen, a footstep click every 0.32 s, and a wailing sawtooth siren during the alarm.
How AI helped: listed the test browser's open tabs (14 game tabs) to find cause (1), then reviewed each sound from a player's point of view.
Fix: tests close their own tab and the documented test browser starts with --mute-audio. The game suspends all audio when the page is hidden or closed and resumes when it is shown. New soft music: a slow four-chord pad with occasional quiet high notes and two bars of rest after every eight, at full level only while playing and quieter on briefings, Labs, menus and the pause menu, with its own Music slider (default 40 %, 0 = off). Footsteps are quieter, less frequent (0.45 s walking, 0.7 s sneaking) and can be switched off; the alarm is a soft two-tone beep every 1.4 s. Unit tests cover the music level, ducking, footsteps off and suspend/resume; the browser test checks the new Settings controls and ducking in the pause menu.

## Gemini sometimes refused with "User location is not supported"
What broke: found by the Safari test on the live site: the terminal said "language model unavailable (proxy returned 502)" and fell back to offline reasoning, although an hour earlier the same Worker had answered.
Error: the Worker only reported "gemini 400". After it was changed to write Google's reason to its private log (`npx wrangler tail`), the reason was "User location is not supported for the API use." Cloudflare runs a Worker in the data centre nearest each visitor, and from some of those locations Google does not offer the Gemini API, so the failure came and went with the route.
How AI helped: added private error logging without exposing the key to visitors, read Google's message, and checked Cloudflare's placement documentation.
Fix: `[placement] region = "gcp:us-central1"` in `worker/wrangler.toml` runs the Worker in a fixed Google Cloud region next to the API; 4 / 4 calls then answered KESTREL37 in 0.6–1.0 s. Visitors still only see "LLM unavailable" on any failure, and the game's offline fallback keeps Mission 3 playable.

## Mission 4: an alarm that punished perfect clustering
What broke: the first version of Mission 4 started the alarm after three empty racks. Measuring routes and outcomes showed the problem: even a perfect clustering flags all five archive servers, which look alike, so the drive's rack could be the fourth or fifth one opened, and a player with a perfect model would set off the alarm by bad luck. Walking distance was no real cost either: checking all 11 racks of a poor k = 3 group took only 2 more steps than the 5 of a good one, because racks stand side by side.
Error: a design rule that did not follow the AI's quality.
How AI helped: measured shortest routes with the game's A* for good and poor groupings, and the archive match (F1) for every Lab setting before choosing the rule. A unit test that checks every neon sign also caught a Mission 4 sign placed over open floor.
Fix: five empty racks start the alarm. Perfect clustering can open at most four (each still brings a guard over, which costs stealth); a merged group (k = 3) or an unscaled one usually reaches five. The briefing, guide and Brain panel say so, and the score scenarios test the fifth-rack alarm.
