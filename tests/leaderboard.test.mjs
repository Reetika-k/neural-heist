// Online leaderboard (2026-10-26): validation rules, ranking, the Worker's /scores routes with a fake KV store.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanName, validateEntry, addScore, overall, KEEP } from "../worker/leaderboard.js";
import worker from "../worker/llm-proxy.js";
import { scoreMission, createMission } from "../src/world/mission.js";
import { parseMap, MISSION_1 } from "../src/world/map.js";

const good = (o = {}) => ({ mission: 1, name: "Asha", score: 2300, breakdown: { finish: 1000, stealth: 500, time: 300, ai: 500 }, stars: 3, seconds: 12.34, ...o });

test("nicknames: 1–16 letters or numbers (any script), spaces tidied, offensive words refused", () => {
  assert.equal(cleanName("  Asha   K "), "Asha K");
  assert.equal(cleanName("रीतिका"), "रीतिका");
  assert.equal(cleanName("agent_007"), "agent_007");
  for (const bad of ["", "   ", "<script>", "x".repeat(17), "-dash", "sh it", "F.U.C.K"]) assert.equal(cleanName(bad), null, JSON.stringify(bad));
});

test("validation: only scores that add up under the game's rules are accepted", () => {
  assert.ok(validateEntry(good()).ok);
  assert.equal(validateEntry(good({ score: 9999 })).ok, false, "score must equal its breakdown");
  assert.equal(validateEntry(good({ breakdown: { finish: 1000, stealth: 500, time: 999, ai: 500 }, score: 2999 })).ok, false, "time bonus is capped at 300");
  assert.equal(validateEntry(good({ breakdown: { finish: 1000, stealth: 250, time: 0, ai: 0 }, score: 1250 })).ok, false, "stealth is 0 or 500");
  assert.equal(validateEntry(good({ mission: 9 })).ok, false);
  assert.equal(validateEntry(good({ stars: 0 })).ok, false, "a win has at least one star");
  assert.equal(validateEntry(good({ seconds: -1 })).ok, false);
  // a real won mission, scored by the game itself, passes
  const m = createMission(parseMap(MISSION_1), { parTime: 35 }); m.outcome = "win"; m.time = 20;
  const r = scoreMission(m, 0.8);
  assert.ok(validateEntry({ mission: 1, name: "Real", score: r.score, breakdown: r.breakdown, stars: r.stars.filter(Boolean).length, seconds: m.time }).ok);
});

test("ranking: best first (then faster), one line per nickname, only a better score replaces it, at most KEEP", () => {
  let list = [];
  const add = (o) => { const r = addScore(list, validateEntry(good(o)).entry); list = r.list; return r; };
  add({ name: "A", score: 1800, breakdown: { finish: 1000, stealth: 500, time: 0, ai: 300 } });
  add({ name: "B", score: 2000, breakdown: { finish: 1000, stealth: 500, time: 0, ai: 500 } });
  const r = add({ name: "a", score: 1500, breakdown: { finish: 1000, stealth: 500, time: 0, ai: 0 } });
  assert.equal(r.improved, false, "a worse score does not replace the player's best"); assert.equal(r.rank, 2);
  assert.deepEqual(list.map((e) => e.name), ["B", "A"]);
  assert.equal(add({ name: "a", score: 2300 }).rank, 1, "a better score moves the player up");
  assert.equal(list.length, 2);
  for (let i = 0; i < KEEP + 5; i++) add({ name: `P${i}`, score: 1000, breakdown: { finish: 1000, stealth: 0, time: 0, ai: 0 }, stars: 1 });
  assert.equal(list.length, KEEP);
});

test("overall: each player's best scores summed across missions", () => {
  const o = overall({ 1: [{ name: "A", score: 2000, stars: 3 }, { name: "B", score: 1500, stars: 2 }], 2: [{ name: "b", score: 1800, stars: 2 }], 3: [], 4: [] });
  assert.deepEqual(o.map((p) => [p.name, p.total, p.missions]), [["B", 3300, 2], ["A", 2000, 1]]);
});

test("Worker /scores: GET lists, POST validates and stores, origin and rate limits apply, Gemini route unchanged", async () => {
  const kv = new Map();
  const env = { ALLOWED_ORIGIN: "https://game.example", SCORES: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } } };
  const req = (method, body, origin = "https://game.example", ip = "5.5.5.5") => new Request("https://w.example/scores", { method, headers: { origin, "content-type": "application/json", "cf-connecting-ip": ip }, body: body ? JSON.stringify(body) : undefined });
  let res = await worker.fetch(req("POST", good()), env, {});
  assert.equal(res.status, 200); const out = await res.json(); assert.equal(out.rank, 1); assert.equal(out.list[0].name, "Asha");
  res = await worker.fetch(req("GET"), env, {});
  assert.equal(res.status, 200); assert.equal((await res.json()).lists[1][0].score, 2300);
  assert.equal((await worker.fetch(req("POST", good({ score: 1 })), env, {})).status, 400, "invalid score refused");
  assert.equal((await worker.fetch(req("GET", null, "https://evil.example"), env, {})).status, 403, "other websites refused");
  assert.equal((await worker.fetch(req("GET"), { ALLOWED_ORIGIN: "https://game.example" }, {})).status, 503, "no storage bound → 503, no crash");
  let last;
  for (let i = 0; i < 11; i++) last = await worker.fetch(req("POST", good({ name: `R${i}` }), "https://game.example", "6.6.6.6"), env, {});
  assert.equal(last.status, 429, "11th score in an hour from one visitor is refused");
  const ask = await worker.fetch(new Request("https://w.example/", { method: "GET", headers: { origin: "https://game.example" } }), env, {});
  assert.equal(ask.status, 405, "the language-model route still accepts POST only");
});
