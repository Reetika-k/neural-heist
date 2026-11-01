// Runtime configuration. The LLM endpoint is the Cloudflare Worker in production
// (set VITE_LLM_URL at build time) or the local dev proxy (tools/llm-dev-proxy.mjs).
// Empty → the assistant reasons offline over the retrieved emails (src/teammates/reasoner.js).
export const CONFIG = {
  llmUrl: (import.meta.env?.VITE_LLM_URL ?? "").trim(),
  llmTimeoutMs: 45000,
  // 2026-10-26: online leaderboard on the same Worker (/scores); VITE_SCORES_URL overrides it (local test server)
  scoresUrl: (import.meta.env?.VITE_SCORES_URL ?? "").trim() || ((import.meta.env?.VITE_LLM_URL ?? "").trim() ? `${(import.meta.env?.VITE_LLM_URL ?? "").trim().replace(/\/(ask)?\/?$/, "")}/scores` : ""),
};
