// Runtime configuration. The LLM endpoint is the Cloudflare Worker in production
// (set VITE_LLM_URL at build time) or the local dev proxy (tools/llm-dev-proxy.mjs).
// Empty → the assistant reasons offline over the retrieved emails (src/teammates/reasoner.js).
export const CONFIG = {
  llmUrl: (import.meta.env?.VITE_LLM_URL ?? "").trim(),
  llmTimeoutMs: 45000,
};
