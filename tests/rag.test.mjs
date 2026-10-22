import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tokenize, splitSentences, chunkEmails, buildIndex, retrieve, multiHop, recall, buildPrompt, normalisePassword, VAULT_QUESTION, RELEVANT } from "../src/lab/rag.js";
import { askAssistant, extractPassword } from "../src/teammates/assistant.js";
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

test("README scenario 8: assistant falls back to the best-matching emails when the LLM is offline", async () => {
  const idx = buildIndex(emails, { chunkSize: 2 });
  const none = await askAssistant(idx, VAULT_QUESTION, { k: 3, llmUrl: "" });
  assert.equal(none.source, "fallback"); assert.match(none.answer, /Best-matching emails/); assert.match(none.answer, /Vault access rotation/);
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
