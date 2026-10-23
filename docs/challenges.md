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
