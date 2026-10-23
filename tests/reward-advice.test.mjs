import { test } from "node:test";
import assert from "node:assert/strict";
import { createAgent, trainEpisodes, greedyPath, makeEnv, shortestSafe } from "../src/lab/qlearning.js";
import { sliderHint, explainOutcome, PRESETS, RECOMMENDED } from "../src/lab/reward-advice.js";

const train = ({ goal, laser, step, battery = 0, episodes, options = {} }, seed) => { const env = makeEnv(options); const a = createAgent({ rewards: { goal, laser, step, battery }, episodes, seed, env }); trainEpisodes(a, episodes); const g = greedyPath(a); return { outcome: g.outcome, steps: g.path.length - 1, batteries: g.batteries, shortest: shortestSafe(env), batteriesOn: !!options.batteries }; };
const SEEDS = [1, 2, 3];

test("each ready-made setting shows the behaviour it promises (3 seeds each)", () => {
  const expected = { recommended: "goal", reckless: "laser", lazy: "loop", rushed: "laser", untrained: "loop", hunter: "goal" };
  for (const p of PRESETS) for (const seed of SEEDS) assert.equal(train(p, seed).outcome, expected[p.id], `${p.label}, seed ${seed}`);
});

test("after training, the explanation names the real cause and a fix", () => {
  const cause = { recommended: /shortest possible route/, reckless: /rewarded lasers/, lazy: /costs nothing/, rushed: /Each step costs −1\.0/, untrained: /only 300 practice runs/, hunter: /grabs 2 batteries/ };
  for (const p of PRESETS) {
    const r = train(p, 1), x = explainOutcome(r.outcome, p, p.episodes, r.steps, r);
    assert.match(`${x.headline} ${x.why}`, cause[p.id], p.label);
    assert.equal(!!x.fix, !["recommended", "hunter"].includes(p.id), `${p.label}: a fix only when something went wrong`);
  }
});

test("slider hints agree with real training at the measured thresholds", () => {
  const check = (key, value, override) => {
    const s = { ...RECOMMENDED, ...override };
    const ok = SEEDS.every((seed) => train(s, seed).outcome === "goal");
    const h = sliderHint(key, value);
    assert.equal(h.kind === "bad", !ok, `${key} = ${value}: hint "${h.kind}", training ${ok ? "reaches the drive" : "fails"}`);
  };
  for (const v of [-20, -10, -2]) check("laser", v, { laser: v });
  for (const v of [-1, 0, 5, 10]) check("laser", v, { laser: v });
  for (const v of [-0.1, -0.4, -0.7]) check("step", v, { step: v });
  for (const v of [0, -0.8, -1, -2]) check("step", v, { step: v });
  for (const v of [300, 500, 700, 1500]) check("episodes", v, { episodes: v });
});
