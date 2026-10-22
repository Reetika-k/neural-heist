// Local stand-in for the Cloudflare Worker, backed by Ollama. Same request/response contract,
// so the game's LLM path can be developed and tested without an API key.
//   node tools/llm-dev-proxy.mjs          (needs Ollama running with the model pulled)
//   VITE_LLM_URL=http://localhost:8787/ask npm run dev
import http from "node:http";
import { buildServerPrompt } from "../worker/llm-proxy.js";

const PORT = Number(process.env.PORT) || 8787;
const OLLAMA = process.env.OLLAMA_URL || "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL || "qwen2:7b";

http.createServer(async (req, res) => {
  const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, OPTIONS", "content-type": "application/json" };
  if (req.method === "OPTIONS") { res.writeHead(204, headers); return res.end(); }
  if (req.method !== "POST" || !req.url.startsWith("/ask")) { res.writeHead(404, headers); return res.end(JSON.stringify({ error: "POST /ask" })); }
  let raw = ""; for await (const c of req) raw += c;
  let body; try { body = JSON.parse(raw); } catch { res.writeHead(400, headers); return res.end(JSON.stringify({ error: "invalid JSON" })); }
  const t0 = Date.now();
  try {
    const r = await fetch(`${OLLAMA}/api/chat`, { method: "POST", body: JSON.stringify({ model: MODEL, stream: false, options: { temperature: 0.2, num_predict: 200 }, messages: [{ role: "user", content: buildServerPrompt(body.question, body.context ?? []) }] }) });
    const j = await r.json();
    res.writeHead(200, headers);
    res.end(JSON.stringify({ answer: j.message?.content ?? "", model: MODEL, tokens: (j.prompt_eval_count ?? 0) + (j.eval_count ?? 0), latencyMs: Date.now() - t0 }));
  } catch (e) {
    res.writeHead(502, headers); res.end(JSON.stringify({ error: `ollama: ${e.message}` }));
  }
}).listen(PORT, () => console.log(`LLM dev proxy on http://localhost:${PORT}/ask → ${OLLAMA} (${MODEL})`));
