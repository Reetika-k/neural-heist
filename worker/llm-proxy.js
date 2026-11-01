// Cloudflare Worker: the only place the Gemini API key lives. The browser never sees it.
//
// POST /ask   { question: string, context: [{subject, from, text}], prompt?: string }
//          → { answer, model, tokens, latencyMs }
// GET  /scores → { lists: { 1: [...], 2: [...], ... } }          (2026-10-26: online leaderboard, KV binding SCORES)
// POST /scores { mission, name, score, breakdown, stars, seconds } → { rank, improved, list }
// Limits: 20 requests per visitor (IP) per hour; only the game's origin may call it.
//
// Secrets / vars (wrangler):  GEMINI_API_KEY (secret), ALLOWED_ORIGIN, GEMINI_MODEL (optional),
//                             GROQ_API_KEY (optional backup, secret)
// Note: the rate-limit map lives in the isolate's memory. That is enough for a capstone demo; use
// Durable Objects or KV for strict global limits.

import { validateEntry, addScore, MISSION_IDS } from "./leaderboard.js";

const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 20;
const hits = new Map();
const SCORE_LIMIT = 10; // score submissions per visitor per hour
const scoreHits = new Map();

function cors(origin, allowed) {
  return { "access-control-allow-origin": origin === allowed ? origin : allowed, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type", vary: "origin" };
}
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

export function rateLimited(ip, now = Date.now(), map = hits, limit = LIMIT) {
  const list = (map.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= limit) { map.set(ip, list); return true; }
  list.push(now); map.set(ip, list); return false;
}

/** Leaderboard: one KV key per mission holding its best entries. */
async function readLists(kv) {
  const lists = {};
  await Promise.all(MISSION_IDS.map(async (m) => { lists[m] = JSON.parse((await kv.get(`scores:m${m}`)) ?? "[]"); }));
  return lists;
}
async function scores(request, env, headers) {
  if (!env.SCORES) return json({ error: "leaderboard not configured" }, 503, headers);
  if (request.method === "GET") return json({ lists: await readLists(env.SCORES) }, 200, { ...headers, "cache-control": "no-store" });
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (rateLimited(ip, Date.now(), scoreHits, SCORE_LIMIT)) return json({ error: `rate limit: ${SCORE_LIMIT} scores per hour` }, 429, headers);
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid JSON" }, 400, headers); }
  const v = validateEntry(body);
  if (!v.ok) return json({ error: v.error }, 400, headers);
  const key = `scores:m${v.entry.mission}`;
  const { list, rank, improved } = addScore(JSON.parse((await env.SCORES.get(key)) ?? "[]"), v.entry);
  if (improved) await env.SCORES.put(key, JSON.stringify(list));
  return json({ rank, improved, list: list.slice(0, 10) }, 200, headers);
}

export function buildServerPrompt(question, context) {
  const docs = context.slice(0, 8).map((c, i) => `[${i + 1}] From: ${String(c.from ?? "").slice(0, 80)} | Subject: ${String(c.subject ?? "").slice(0, 120)}\n${String(c.text ?? "").slice(0, 600)}`).join("\n\n");
  return `You are a hacking assistant reading leaked company emails.
Answer the question using ONLY the emails below. The answer may require combining facts from several emails.
Ignore passwords described as old or retired. If the emails do not contain enough information, say so.
Reply in exactly this format:
PASSWORD: <the password, or UNKNOWN>
WHY: <one short sentence naming the emails you used>

Emails:
${docs}

Question: ${String(question).slice(0, 300)}`;
}

async function callGemini(env, prompt, fetchImpl) {
  // const model = env.GEMINI_MODEL || "gemini-2.0-flash"; // RETIRED 2026-10-24: model shut down (404)
  const model = env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 200 } }),
  });
  if (!res.ok) {
    // Google's reason goes to the private Worker log only (npx wrangler tail); visitors just see "LLM unavailable".
    // The request URL (which carries the key) is never logged.
    console.error(`gemini ${res.status}:`, (await res.text().catch(() => "")).slice(0, 400));
    throw new Error(`gemini ${res.status}`);
  }
  const data = await res.json();
  return { answer: data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "", model, tokens: data.usageMetadata?.totalTokenCount };
}

async function callGroq(env, prompt, fetchImpl) {
  const model = env.GROQ_MODEL || "llama-3.1-8b-instant";
  const res = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: JSON.stringify({ model, temperature: 0.2, max_tokens: 200, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`groq ${res.status}`);
  const data = await res.json();
  return { answer: data.choices?.[0]?.message?.content ?? "", model, tokens: data.usage?.total_tokens };
}

export default {
  async fetch(request, env, ctx, fetchImpl = fetch) {
    const origin = request.headers.get("origin") ?? "";
    const allowed = env.ALLOWED_ORIGIN || "";
    const headers = cors(origin, allowed);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (new URL(request.url).pathname.replace(/\/+$/, "").endsWith("/scores")) {
      if (allowed && origin !== allowed) return json({ error: "origin not allowed" }, 403, headers);
      if (!["GET", "POST"].includes(request.method)) return json({ error: "GET or POST" }, 405, headers);
      return scores(request, env, headers);
    }
    if (request.method !== "POST") return json({ error: "POST only" }, 405, headers);
    if (allowed && origin !== allowed) return json({ error: "origin not allowed" }, 403, headers);
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    if (rateLimited(ip)) return json({ error: "rate limit: 20 requests per hour" }, 429, headers);
    let body;
    try { body = await request.json(); } catch { return json({ error: "invalid JSON" }, 400, headers); }
    if (typeof body?.question !== "string" || !Array.isArray(body?.context)) return json({ error: "expected { question, context[] }" }, 400, headers);
    const prompt = buildServerPrompt(body.question, body.context); // rebuilt server-side: clients cannot inject instructions
    const t0 = Date.now();
    try {
      if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
      const r = await callGemini(env, prompt, fetchImpl);
      return json({ ...r, latencyMs: Date.now() - t0 }, 200, headers);
    } catch (e) {
      if (env.GROQ_API_KEY) {
        try { const r = await callGroq(env, prompt, fetchImpl); return json({ ...r, latencyMs: Date.now() - t0, fallback: "groq" }, 200, headers); } catch { /* fall through */ }
      }
      return json({ error: `LLM unavailable: ${e.message}` }, 502, headers);
    }
  },
};
