// Plain-English help for the Mission 2 Lab (reward design for Q-learning). Pure functions, unit-tested.
// The thresholds were measured: 20 training runs per setting with the other sliders at the recommended values
// (see docs/test-report.md). Players found the Lab confusing; these texts say what each value will do and,
// after training, why the dog behaved as it did.

export const SHORTEST_PATH = 28;
export const RECOMMENDED = { goal: 10, laser: -10, step: -0.1, episodes: 1500 };

/** Ready-made settings that show one lesson each. */
export const PRESETS = [
  { id: "recommended", label: "Recommended", ...RECOMMENDED, note: "Finds the shortest safe path." },
  { id: "reckless", label: "Reckless dog", ...RECOMMENDED, laser: 5, note: "Lasers are rewarded: watch it run into one." },
  { id: "lazy", label: "Lazy dog", ...RECOMMENDED, step: 0, note: "Walking is free: watch it wander and get lost." },
  { id: "rushed", label: "Rushed dog", ...RECOMMENDED, step: -1, note: "Every step hurts: watch it crash on purpose." },
  { id: "untrained", label: "Too little practice", ...RECOMMENDED, episodes: 300, note: "300 runs are not enough to find the drive." },
  { id: "hunter", label: "Battery hunter", ...RECOMMENDED, battery: 2, options: { batteries: true }, note: "Batteries worth +2: watch it take the detour." },
];
/** Measured: a battery is worth its detour once the bonus beats about 3 × the step cost (classic and random vaults). */
export const batteryThreshold = (step) => +(3 * Math.abs(step)).toFixed(1);

const fmt = (v, digits) => { const t = digits == null ? String(v) : v.toFixed(digits); return (v > 0 ? `+${t}` : t).replace("-", "−"); };

/** Hint under a slider: { text, kind: "good" | "warn" | "bad" }. */
export function sliderHint(key, v, ctx = {}) {
  if (key === "goal") return v > 0
    ? { kind: "good", text: "A bonus for reaching the drive. Any positive value works; bigger just means finishing matters more." }
    : { kind: "warn", text: "No bonus: only the step cost pushes the dog to finish. It usually still works, but less reliably." };
  if (key === "laser") {
    if (v > 0) return { kind: "bad", text: "Lasers are a prize: the dog will learn to run into them." };
    if (v >= -1) return { kind: "bad", text: "Too small: touching a laser costs less than the long walk, so the dog learns to crash to end the run early." };
    return { kind: "good", text: "Lasers hurt: the dog learns to avoid them." };
  }
  if (key === "step") {
    if (v === 0) return { kind: "bad", text: "Walking is free, so there is no reason to hurry: the dog wanders and gets lost." };
    if (v <= -0.8) return { kind: "bad", text: "Walking costs so much that ending the run on a laser looks cheaper: the dog learns to crash." };
    return { kind: "good", text: "Each step costs a little, so the dog looks for the shortest safe route." };
  }
  if (key === "battery") {
    const t = batteryThreshold(ctx.step ?? RECOMMENDED.step);
    if (v === 0) return { kind: "warn", text: "No bonus: the dog ignores the batteries." };
    if (v < t) return { kind: "warn", text: `Smaller than the detour costs (about +${t} with a step cost of ${fmt(ctx.step ?? RECOMMENDED.step, 1)}): the dog skips the batteries.` };
    return { kind: "good", text: `Worth the detour (more than about +${t}): the dog grabs the batteries and its route gets longer.` };
  }
  if (key === "slip") {
    if (v === 0) return { kind: "good", text: "Dry floor: no puddles." };
    return { kind: "good", text: `Blue puddles next to the lasers make the dog slide sideways ${Math.round(v * 100)} % of the time. A well-trained dog crosses where it is dry, even if that is longer.` };
  }
  if (key === "episodes") {
    if (ctx.blinking && ctx.extras > 1 && v < 6000) return { kind: "warn", text: "Blinking lasers plus other extras: a much bigger vault to learn. Give it 6,000 practice runs." };
    if (ctx.blinking && v < 3000) return { kind: "warn", text: "Blinking lasers: the dog must also learn the timing. Give it 3,000 or more practice runs." };
    if (v <= 500) return { kind: "bad", text: "Too few practice runs: the dog rarely finds the far-away drive, so it cannot learn the route." };
    if (v < 700) return { kind: "warn", text: "Borderline: about half the time this is not enough practice. 700 or more is reliable." };
    return { kind: "good", text: "Enough practice runs to learn the route." };
  }
  return { kind: "good", text: "" };
}

/**
 * After training: what happened, why, and what to change.
 * outcome: "goal" | "laser" | "loop" (from greedyPath); r: { goal, laser, step }; episodes; steps: learned path length.
 * Returns { headline, why, fix } (fix is "" when nothing needs changing).
 */
export function explainOutcome(outcome, r, episodes, steps, ctx = {}) {
  const shortest = ctx.shortest ?? SHORTEST_PATH;
  if (outcome === "goal") {
    const extra = steps - shortest;
    // what made the route longer than the shortest one: batteries, puddles or (rarely) imperfect learning
    if (ctx.batteries > 0) return {
      headline: `The dog grabs ${ctx.batteries === 1 ? "a battery" : `${ctx.batteries} batteries`} and reaches the drive in ${steps} steps (the shortest route is ${shortest}).`,
      why: `Each battery pays ${fmt(r.battery)}, more than the extra steps cost (${fmt(r.step, 1)} each), so the detour earns more points than the direct route.`,
      fix: "",
    };
    if (ctx.batteriesOn && !ctx.batteries) return {
      headline: `The dog skips the batteries and takes the ${steps}-step route${extra > 0 ? "" : " (the shortest)"}.`,
      why: `A battery pays only ${fmt(r.battery)}: less than the extra steps of the detour would cost, so it is not worth it.`,
      fix: `For a detour, raise the battery reward above about +${batteryThreshold(r.step)}.`,
    };
    if (ctx.slip > 0 && ctx.success != null) return {
      headline: `On the slippery floor the dog reaches the drive in ${Math.round(ctx.success * 100)} % of 200 tries, in about ${Math.round(ctx.avgSteps ?? steps)} steps.`,
      why: extra > 0 ? `Its route is ${extra} steps longer than the shortest one because it avoids the puddles beside the lasers: sliding into a laser costs ${fmt(r.laser)}, more than the extra steps.` : `It risks the puddles: with a laser costing only ${fmt(r.laser)}, the gamble looks cheaper than the longer dry route.`,
      fix: ctx.success < 0.95 ? "A bigger laser penalty teaches it to cross where it is dry." : "",
    };
    if (ctx.blinking && ctx.blinkCrossed) return {
      headline: `The dog reaches the drive in ${steps} steps by slipping through a blinking laser while it is off${ctx.waits > 0 ? `, after waiting ${ctx.waits} time${ctx.waits === 1 ? "" : "s"}` : ""} (shortest possible: ${shortest}).`,
      why: "It learned when as well as where: the blinking gap is a shortcut, but only at the right moment.",
      fix: extra > 2 ? "More episodes usually sharpen the timing." : "",
    };
    if (ctx.blinking) return {
      headline: `The dog reaches the drive in ${steps} steps, walking around the blinking lasers (with perfect timing it could take ${shortest}).`,
      why: "It has not learned the timing of the blinking gap yet, so it plays safe and walks around.",
      fix: "Train with more episodes (3,000 or more) to learn the timing.",
    };
    return {
      headline: `The dog reaches the drive in ${steps} steps without touching a laser${extra > 0 ? ` (${extra} more than the shortest route)` : " (the shortest possible route)"}.`,
      why: `A laser costs more than the walk (${fmt(r.laser)}), and every step costs a little (${fmt(r.step, 1)}), so the quickest safe route earns the most points.`,
      fix: extra > 0 ? "More episodes usually straighten the route." : "",
    };
  }
  if (outcome === "laser") {
    if (r.laser > 0) return { headline: "The dog runs into a laser.", why: `You rewarded lasers (${fmt(r.laser)}), so touching one is the best-paying move it found.`, fix: "Make the laser reward negative, for example −10." };
    if (r.step <= -0.8) return { headline: "The dog runs into a laser on purpose.", why: `Each step costs ${fmt(r.step, 1)}, so walking the ${shortest}-step route would cost about ${fmt(shortest * r.step, 0)}; ending the run on a laser (${fmt(r.laser)}) is cheaper.`, fix: "Use a small step cost, such as −0.1." };
    if (r.laser >= -1) return { headline: "The dog runs into a laser on purpose.", why: `A laser costs only ${fmt(r.laser)}, less than walking all the way, so crashing early is the cheapest way to end the run.`, fix: "Use a bigger laser penalty, for example −10." };
    return { headline: "The dog runs into a laser.", why: "In the runs it explored, ending on a laser paid better than the routes it found.", fix: "Try more episodes, or the Recommended settings." };
  }
  // loop: goes in circles / never reaches the drive
  if (ctx.blinking && episodes < 6000) return { headline: "The dog goes in circles.", why: `Blinking lasers make the vault much bigger to learn (where AND when)${ctx.extras > 1 ? ", and the other extras multiply it again" : ""}; ${episodes.toLocaleString()} practice runs were not enough.`, fix: `Train with ${ctx.extras > 1 || episodes >= 3000 ? "6,000" : "3,000 or more"} episodes.` };
  if (episodes < 700) return { headline: "The dog goes in circles.", why: `With only ${episodes} practice runs it rarely reached the far-away drive, so it never learned the route.`, fix: "Train with more episodes, for example 1,500." };
  if (r.step === 0) return { headline: "The dog goes in circles.", why: "Walking costs nothing, so there is no reason to hurry: it wanders and never learns the long route.", fix: "Add a small step cost, such as −0.1." };
  if (r.goal === 0) return { headline: "The dog goes in circles.", why: "There is no bonus for the drive, so this time it did not learn the route well enough.", fix: "Add a drive reward, such as +10." };
  return { headline: "The dog goes in circles.", why: "It has not learned a route from the start to the drive yet.", fix: "Try more episodes, or the Recommended settings." };
}

/** A dog trained on another vault, shown on the current one: why it must be retrained. */
export function explainStale(trainedOn, nowOn, outcome, steps) {
  const what = outcome === "goal" ? `still happens to reach the drive (${steps} steps)` : outcome === "laser" ? `runs into a laser after ${steps} steps` : "goes in circles";
  return {
    headline: `This dog learned ${trainedOn}. On ${nowOn} its old route ${what}.`,
    why: "Its table of values belongs to the vault it practised in: every square's best move was learned for those lasers. A new vault means new practice.",
    fix: "Press Train to teach it this vault.",
  };
}
