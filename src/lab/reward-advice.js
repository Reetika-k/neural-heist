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
];

const fmt = (v, digits) => { const t = digits == null ? String(v) : v.toFixed(digits); return (v > 0 ? `+${t}` : t).replace("-", "−"); };

/** Hint under a slider: { text, kind: "good" | "warn" | "bad" }. */
export function sliderHint(key, v) {
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
  if (key === "episodes") {
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
export function explainOutcome(outcome, r, episodes, steps) {
  if (outcome === "goal") {
    const extra = steps - SHORTEST_PATH;
    return {
      headline: `The dog reaches the drive in ${steps} steps without touching a laser${extra > 0 ? ` (${extra} more than the shortest route)` : " (the shortest possible route)"}.`,
      why: `A laser costs more than the walk (${fmt(r.laser)}), and every step costs a little (${fmt(r.step, 1)}), so the quickest safe route earns the most points.`,
      fix: extra > 0 ? "More episodes usually straighten the route." : "",
    };
  }
  if (outcome === "laser") {
    if (r.laser > 0) return { headline: "The dog runs into a laser.", why: `You rewarded lasers (${fmt(r.laser)}), so touching one is the best-paying move it found.`, fix: "Make the laser reward negative, for example −10." };
    if (r.step <= -0.8) return { headline: "The dog runs into a laser on purpose.", why: `Each step costs ${fmt(r.step, 1)}, so walking the ${SHORTEST_PATH}-step route would cost about ${fmt(SHORTEST_PATH * r.step, 0)}; ending the run on a laser (${fmt(r.laser)}) is cheaper.`, fix: "Use a small step cost, such as −0.1." };
    if (r.laser >= -1) return { headline: "The dog runs into a laser on purpose.", why: `A laser costs only ${fmt(r.laser)}, less than walking all the way, so crashing early is the cheapest way to end the run.`, fix: "Use a bigger laser penalty, for example −10." };
    return { headline: "The dog runs into a laser.", why: "In the runs it explored, ending on a laser paid better than the routes it found.", fix: "Try more episodes, or the Recommended settings." };
  }
  // loop: goes in circles / never reaches the drive
  if (episodes < 700) return { headline: "The dog goes in circles.", why: `With only ${episodes} practice runs it rarely reached the far-away drive, so it never learned the route.`, fix: "Train with more episodes, for example 1,500." };
  if (r.step === 0) return { headline: "The dog goes in circles.", why: "Walking costs nothing, so there is no reason to hurry: it wanders and never learns the long route.", fix: "Add a small step cost, such as −0.1." };
  if (r.goal === 0) return { headline: "The dog goes in circles.", why: "There is no bonus for the drive, so this time it did not learn the route well enough.", fix: "Add a drive reward, such as +10." };
  return { headline: "The dog goes in circles.", why: "It has not learned a route from the start to the drive yet.", fix: "Try more episodes, or the Recommended settings." };
}
