import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tokenize, splitSentences, chunkEmails, buildIndex, retrieve, multiHop, recall, buildPrompt, normalisePassword, VAULT_QUESTION, RELEVANT } from "../src/lab/rag.js";
import { askAssistant, extractPassword } from "../src/teammates/assistant.js";
import { reasonOffline } from "../src/teammates/reasoner.js";
import worker, { rateLimited, buildServerPrompt } from "../worker/llm-proxy.js";
import { MISSION_3, parseMap } from "../src/world/map.js";
import { MISSIONS } from "../src/world/missions.js";

const emails = JSON.parse(fs.readFileSync(new URL("../public/data/emails.json", import.meta.url), "utf8"));

test("dataset: 40 fictional emails; the password needs three of them; a retired decoy exists", () => {
  assert.equal(emails.length, 40);
  assert.equal(new Set(emails.map((e) => e.id)).size, 40);
  const byId = Object.fromEntries(emails.map((e) => [e.id, e.body]));
  assert.match(byId.e17, /first robot/); assert.match(byId.e05, /Kestrel/); assert.match(byId.e29, /floor 37/);
  assert.match(byId.e09, /retired/);
  assert.equal(normalisePassword(MISSIONS[2].password), "KESTREL37");
  assert.ok(!emails.some((e) => /KESTREL37/i.test(e.body)), "the password is never written in one place");
});

test("text processing: stopwords removed, plurals folded, 'Mr.' does not end a sentence", () => {
  assert.deepEqual(tokenize("The Robots and the robot!"), ["robot", "robot"]);
  assert.deepEqual(splitSentences("Ask Mr. Varma. He knows."), ["Ask Mr. Varma.", "He knows."]);
  const chunks = chunkEmails([{ id: "x", subject: "S", from: "F", body: "One. Two. Three." }], 2);
  assert.deepEqual(chunks.map((c) => c.text), ["One. Two.", "Three."]);
});

test("retrieval: the question finds the rotation email first; scores are cosine in 0..1, sorted", () => {
  const idx = buildIndex(emails, { chunkSize: 2 });
  const hits = retrieve(idx, VAULT_QUESTION, 5);
  assert.equal(hits[0].chunk.emailId, "e17");
  assert.ok(hits.every((h, i) => h.score > 0 && h.score <= 1 + 1e-9 && (i === 0 || hits[i - 1].score >= h.score)));
});

test("two-hop retrieval at the default settings finds all three facts; single hop does not", () => {
  const idx = buildIndex(emails, { chunkSize: 2 });
  const mh = multiHop(idx, VAULT_QUESTION, 3);
  assert.equal(recall(mh.context, RELEVANT), 1);
  assert.ok(recall(retrieve(idx, VAULT_QUESTION, 3), RELEVANT) < 1, "one hop is not enough");
  assert.ok(!mh.hop2Query.split(" ").includes("vault"), "hop 2 does not repeat the question's words");
});

test("parameters matter: k=1 and one-sentence chunks lose facts", () => {
  assert.ok(recall(multiHop(buildIndex(emails, { chunkSize: 2 }), VAULT_QUESTION, 1).context, RELEVANT) < 1);
  assert.ok(recall(multiHop(buildIndex(emails, { chunkSize: 1 }), VAULT_QUESTION, 3).context, RELEVANT) < 1);
});

test("prompt: contains every retrieved chunk, the answer format and the decoy rule", () => {
  const idx = buildIndex(emails, { chunkSize: 2 });
  const p = buildPrompt(VAULT_QUESTION, multiHop(idx, VAULT_QUESTION, 3).context);
  assert.match(p, /PASSWORD: <the password, or UNKNOWN>/);
  assert.match(p, /retired/);
  assert.match(p, /Kestrel/); assert.match(p, /floor 37/);
});

test("README scenario 8: with the LLM offline the assistant reasons over the retrieved emails", async () => {
  const idx = buildIndex(emails, { chunkSize: 2 });
  const none = await askAssistant(idx, VAULT_QUESTION, { k: 3, llmUrl: "" });
  assert.equal(none.source, "fallback"); assert.equal(extractPassword(none.answer), "KESTREL37"); assert.match(none.answer, /Vault access rotation/);
  assert.ok(none.steps.length >= 3, "explains how it worked the password out");
  const down = await askAssistant(idx, VAULT_QUESTION, { k: 3, llmUrl: "http://x/ask", fetchImpl: async () => { throw new Error("connection refused"); } });
  assert.equal(down.source, "fallback"); assert.match(down.error, /connection refused/);
  const bad = await askAssistant(idx, VAULT_QUESTION, { k: 3, llmUrl: "http://x/ask", fetchImpl: async () => ({ ok: false, status: 502 }) });
  assert.match(bad.error, /502/);
});

test("assistant uses the LLM answer when the proxy responds; password extraction", async () => {
  const idx = buildIndex(emails, { chunkSize: 2 });
  let sent = null;
  const r = await askAssistant(idx, VAULT_QUESTION, { k: 3, llmUrl: "http://x/ask", fetchImpl: async (url, opts) => { sent = JSON.parse(opts.body); return { ok: true, json: async () => ({ answer: "PASSWORD: KESTREL37\nWHY: e17, e05, e29", model: "test", tokens: 321 }) }; } });
  assert.equal(r.source, "llm"); assert.equal(extractPassword(r.answer), "KESTREL37"); assert.equal(r.tokens, 321);
  assert.equal(sent.context.length, r.context.length, "context sent to the proxy");
  assert.equal(extractPassword("PASSWORD: UNKNOWN"), null);
});

test("worker: CORS origin check, input validation, rate limit 20/hour, key stays server-side", async () => {
  const env = { ALLOWED_ORIGIN: "https://game.example", GEMINI_API_KEY: "secret-key" };
  const req = (body, origin = "https://game.example", ip = "1.1.1.1") => new Request("https://w/ask", { method: "POST", headers: { origin, "cf-connecting-ip": ip, "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
  let calledUrl = null;
  const fakeGemini = async (url) => { calledUrl = url; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "PASSWORD: KESTREL37" }] } }], usageMetadata: { totalTokenCount: 99 } }) }; };
  assert.equal((await worker.fetch(req({ question: "q", context: [] }, "https://evil.example"), env, {}, fakeGemini)).status, 403);
  assert.equal((await worker.fetch(req("{bad"), env, {}, fakeGemini)).status, 400);
  assert.equal((await worker.fetch(req({ question: 5 }), env, {}, fakeGemini)).status, 400);
  const ok = await worker.fetch(req({ question: "q", context: [{ subject: "s", from: "f", text: "t" }] }, "https://game.example", "2.2.2.2"), env, {}, fakeGemini);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.answer, "PASSWORD: KESTREL37"); assert.equal(body.tokens, 99);
  assert.ok(calledUrl.includes("key=secret-key") && !JSON.stringify(body).includes("secret-key"), "key used upstream, never returned");
  for (let i = 0; i < 20; i++) rateLimited("9.9.9.9");
  assert.equal(rateLimited("9.9.9.9"), true, "21st request in an hour is refused");
  assert.equal((await worker.fetch(req({ question: "q", context: [] }, "https://game.example", "3.3.3.3"), { ALLOWED_ORIGIN: "https://game.example" }, {}, fakeGemini)).status, 502, "missing key → 502, no crash");
  assert.match(buildServerPrompt("q", [{ text: "x".repeat(5000) }]), /x{600}\n/, "context is truncated server-side");
});

test("Mission 3 map: terminal next to a locked door that opens", () => {
  const map = parseMap(MISSION_3);
  assert.deepEqual(map.terminal, { x: 8, z: 7 }); assert.deepEqual(map.drive, { x: 19, z: 8 });
  assert.equal(map.isBlocked(13, 8), true, "door locked");
  map.unlockAll();
  assert.equal(map.isBlocked(13, 8), false, "door open");
});

// ---------- offline reasoning (no language model) ----------
const ctxFor = (chunkSize, k) => multiHop(buildIndex(emails, { chunkSize }), VAULT_QUESTION, k).context;
const only = (...ids) => buildIndex(emails.filter((e) => ids.includes(e.id)), { chunkSize: 4 }).chunks.map((chunk) => ({ chunk, score: 1 }));

test("offline reasoning: full recall gives KESTREL37 and names the three clue emails", () => {
  const r = reasonOffline(ctxFor(2, 3));
  assert.equal(r.password, "KESTREL37");
  for (const subject of ["Vault access rotation", "Friday story time", "Server room relocation complete"]) assert.match(r.answer, new RegExp(subject));
});

test("offline reasoning: weak retrieval answers UNKNOWN and says which fact is missing", () => {
  const k1 = reasonOffline(ctxFor(2, 1));
  assert.equal(k1.password, null); assert.match(k1.answer, /PASSWORD: UNKNOWN/); assert.ok(k1.missing.length > 0);
  assert.equal(reasonOffline(ctxFor(1, 3)).password, null, "one-sentence chunks lose the clues (recall 1/3)");
});

test("offline reasoning ignores every distractor: robotics-club robot, old floor, other floors, retired password", () => {
  // the rule + the robotics club's robot (Atlas) + the cafeteria floor: no valid robot or server-room floor
  const r1 = reasonOffline(only("e17", "e21", "e14"));
  assert.equal(r1.password, null); assert.ok(!/ATLAS/.test(r1.answer));
  // the retired ORION12 on its own is never offered
  const r2 = reasonOffline(only("e09"));
  assert.equal(r2.password, null); assert.ok(!/ORION12/.test(r2.answer.split("\n")[0]));
  // all clues plus all distractors: still KESTREL37, never floor 12
  assert.equal(reasonOffline(only("e17", "e05", "e29", "e21", "e14", "e09")).password, "KESTREL37");
});

// ---------- Mission 3 Lab explanations (2026-10-23): hints and the answer preview agree with real retrieval ----------
import { ragHint, CLUES } from "../src/screens/lab-rag.js";
test("Lab hints agree with retrieval on every setting; the preview answer matches the clues found", () => {
  for (const chunkSize of [1, 2, 3, 4]) for (const k of [1, 2, 3, 4, 5, 6]) {
    const ctx = multiHop(buildIndex(emails, { chunkSize }), VAULT_QUESTION, k).context;
    const full = recall(ctx, RELEVANT) === 1;
    const warned = ragHint("chunk", chunkSize).kind === "bad" || ragHint("k", k).kind === "bad";
    assert.equal(warned, !full, `chunk ${chunkSize}, k ${k}`);
    assert.equal(reasonOffline(ctx).password, full ? "KESTREL37" : null, `chunk ${chunkSize}, k ${k}`);
  }
  assert.deepEqual(Object.keys(CLUES).sort(), [...RELEVANT].sort());
});

test("one hop vs two hops (Lab switch): one hop finds only 1 of 3 clues at every setting; two hops reach KESTREL37", () => {
  for (const c of [1, 2, 3, 4]) for (const k of [1, 2, 3, 4, 5, 6]) {
    const idx = buildIndex(emails, { chunkSize: c });
    const one = multiHop(idx, VAULT_QUESTION, k, { hops: 1 });
    assert.equal(one.hop2.length, 0);
    assert.equal(recall(one.context, RELEVANT), 1 / 3, `chunk ${c}, k ${k}`);
    assert.doesNotMatch(reasonOffline(one.context).answer, /KESTREL37/);
  }
  const two = multiHop(buildIndex(emails, { chunkSize: 2 }), VAULT_QUESTION, 3);
  assert.equal(recall(two.context, RELEVANT), 1);
  assert.equal(ragHint("hops", 1).kind, "bad"); assert.equal(ragHint("hops", 2).kind, "good");
});
