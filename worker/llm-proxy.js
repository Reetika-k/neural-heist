// Cloudflare Worker: the only place the Gemini API key lives. The browser never sees it.
//
// POST /ask   { question: string, context: [{subject, from, text}], prompt?: string }
//          → { answer, model, tokens, latencyMs }
// Limits: 20 requests per visitor (IP) per hour; only the game's origin may call it.
//
// Secrets / vars (wrangler):  GEMINI_API_KEY (secret), ALLOWED_ORIGIN, GEMINI_MODEL (optional),
//                             GROQ_API_KEY (optional backup, secret)
// Note: the rate-limit map lives in the isolate's memory. That is enough for a capstone demo; use
// Durable Objects or KV for strict global limits.

const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 20;
const hits = new Map();

function cors(origin, allowed) {
  return { "access-control-allow-origin": origin === allowed ? origin : allowed, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", vary: "origin" };
}
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

export function rateLimited(ip, now = Date.now()) {
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT) { hits.set(ip, list); return true; }
  list.push(now); hits.set(ip, list); return false;
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
  if (!res.ok) throw new Error(`gemini ${res.status}`);
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
