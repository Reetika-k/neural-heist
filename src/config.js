// Runtime configuration. The LLM endpoint is the Cloudflare Worker in production
// (set VITE_LLM_URL at build time) or the local dev proxy (tools/llm-dev-proxy.mjs).
// Empty → the assistant uses its offline fallback (shows the best-matching emails).
export const CONFIG = {
  llmUrl: (import.meta.env?.VITE_LLM_URL ?? "").trim(),
  llmTimeoutMs: 45000,
};
