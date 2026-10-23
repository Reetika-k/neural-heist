// The hacking assistant (Mission 3): retrieve with the player's index, then ask an LLM through our
// proxy. If the LLM is not configured or fails, it reasons offline over the same retrieved emails
// (src/teammates/reasoner.js) and answers in the same format.
import { multiHop, buildPrompt, recall, RELEVANT } from "../lab/rag.js";
import { reasonOffline } from "./reasoner.js";

/**
 * @returns {Promise<{ question, hop1, hop2, context, prompt, answer, source: "llm"|"fallback", error?, latencyMs, tokens?, recall }>}
 */
export async function askAssistant(index, question, { k = 3, llmUrl = "", timeoutMs = 45000, fetchImpl = globalThis.fetch } = {}) {
  const t0 = Date.now();
  const { hop1, hop2, context } = multiHop(index, question, k);
  const prompt = buildPrompt(question, context);
  const base = { question, hop1, hop2, context, prompt, recall: recall(context, RELEVANT) };
  // RETIRED 2026-10-23: without a model the assistant only listed the best-matching emails ("I could not reach
  // the language model…"), so on the public site every player had to solve the puzzle from a raw dump.
  // Replaced by offline reasoning over the same retrieved emails.
  // const fallback = (error) => ({ ...base, source: "fallback", error, latencyMs: Date.now() - t0,
  //   answer: context.length ? `I could not reach the language model… Best-matching emails: …` : "I found no emails that match the question." });
  const fallback = (error) => {
    const r = context.length ? reasonOffline(context) : { answer: "PASSWORD: UNKNOWN\nWHY: I found no emails that match the question.", steps: [], missing: [] };
    return { ...base, source: "fallback", error, latencyMs: Date.now() - t0, answer: r.answer, steps: r.steps, missing: r.missing };
  };
  if (!llmUrl) return fallback("no LLM configured");
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetchImpl(llmUrl, {
      method: "POST", headers: { "content-type": "application/json" }, signal: ctrl.signal,
      body: JSON.stringify({ question, context: context.map((r) => ({ subject: r.chunk.subject, from: r.chunk.from, text: r.chunk.text })), prompt }),
    });
    clearTimeout(timer);
    if (!res.ok) return fallback(`proxy returned ${res.status}`);
    const data = await res.json();
    if (!data.answer) return fallback("empty answer");
    return { ...base, source: "llm", answer: String(data.answer).trim(), model: data.model, tokens: data.tokens, latencyMs: Date.now() - t0 };
  } catch (e) {
    return fallback(e.name === "AbortError" ? "timed out" : e.message);
  }
}

/** Pull "PASSWORD: X" out of an LLM answer (null if absent or UNKNOWN). */
export function extractPassword(answer) {
  const m = String(answer).match(/PASSWORD:\s*([A-Za-z0-9-]+)/i);
  return m && m[1].toUpperCase() !== "UNKNOWN" ? m[1].toUpperCase() : null;
}
