// Retrieval for the hacking assistant (Mission 3): chunking, TF-IDF embeddings, cosine similarity,
// and two-hop retrieval. Pure logic, unit-tested; the same code runs in the Lab and in the mission.
//
// Embedding = TF-IDF vector: each word weighted by how often it appears in the chunk and how rare it
// is across all chunks, then L2-normalised so cosine similarity is a dot product.
// Two-hop retrieval: the question finds the first emails; their text becomes part of a second query,
// which finds emails the question alone never mentions (a "multi-hop" question).

const STOP = new Set("a an the and or but if of to in on at for by with from is are was were be been being it its this that these those as do does did not no so than then there here who whom which what when where why how all any each few more most other some such only own same very can will just should now please your you our we us they them he his she her i me my about into over after before again further once also new old".split(" "));

export function tokenize(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)); // tiny stemmer: plurals
}

/** Split into sentences without breaking after common abbreviations ("Mr. Varma" stays together). */
export function splitSentences(text) {
  const protectedText = String(text).replace(/\b(Mr|Mrs|Ms|Dr|St|No)\./g, "$1\u0000");
  return (protectedText.match(/[^.!?]+[.!?]?/g) ?? []).map((s) => s.replace(/\u0000/g, ".").trim()).filter(Boolean);
}

/** Chunks of `size` consecutive sentences; each chunk keeps its email's subject for context. */
export function chunkEmails(emails, size = 2) {
  const chunks = [];
  for (const e of emails) {
    const sents = splitSentences(e.body);
    for (let i = 0; i < sents.length; i += size) {
      chunks.push({ id: `${e.id}#${i / size}`, emailId: e.id, subject: e.subject, from: e.from, text: sents.slice(i, i + size).join(" ") });
    }
  }
  return chunks;
}

export function buildIndex(emails, { chunkSize = 2 } = {}) {
  const chunks = chunkEmails(emails, chunkSize);
  const docs = chunks.map((c) => tokenize(`${c.subject} ${c.text}`));
  const df = new Map();
  docs.forEach((d) => new Set(d).forEach((w) => df.set(w, (df.get(w) ?? 0) + 1)));
  const N = docs.length;
  const idf = new Map([...df].map(([w, n]) => [w, Math.log((N + 1) / (n + 1)) + 1]));
  const vectors = docs.map((d) => vectorize(d, idf));
  return { chunks, idf, vectors, chunkSize, vocabulary: idf.size };
}

function vectorize(tokens, idf) {
  const v = new Map();
  tokens.forEach((w) => { if (idf.has(w)) v.set(w, (v.get(w) ?? 0) + 1); });
  let norm = 0;
  for (const [w, tf] of v) { const x = tf * idf.get(w); v.set(w, x); norm += x * x; }
  norm = Math.sqrt(norm) || 1;
  for (const [w, x] of v) v.set(w, x / norm);
  return v;
}

const cosine = (a, b) => { let s = 0; const [small, big] = a.size < b.size ? [a, b] : [b, a]; for (const [w, x] of small) s += x * (big.get(w) ?? 0); return s; };

/** Top-k chunks for a query: [{ chunk, score }] sorted by cosine similarity. */
export function retrieve(index, query, k = 3, exclude = new Set()) {
  const q = vectorize(tokenize(query), index.idf);
  return index.vectors.map((v, i) => ({ chunk: index.chunks[i], score: cosine(q, v) }))
    .filter((r) => r.score > 0 && !exclude.has(r.chunk.id))
    .sort((a, b) => b.score - a.score).slice(0, k);
}

/**
 * Two-hop retrieval. Hop 2 follows the best lead: the words of the top hop-1 chunk minus the words of the
 * question. Re-using the question's words would just find more "vault password" emails (including the
 * retired-password decoy), and using every hop-1 chunk lets weak, off-topic matches drown out the lead.
 * Context = hop 1 then hop 2, without duplicates.
 */
export function multiHop(index, question, k = 3, { hops = 2 } = {}) {
  const hop1 = retrieve(index, question, k);
  // one hop (2026-10-24, a Lab switch): the question alone, to show what the second hop adds
  if (hops < 2) return { hop1, hop2: [], hop2Query: "", context: [...hop1] };
  const asked = new Set(tokenize(question));
  const hop2Query = hop1.slice(0, 1).flatMap((r) => tokenize(r.chunk.text)).filter((w) => !asked.has(w)).join(" ");
  const hop2 = retrieve(index, hop2Query, k, new Set(hop1.map((r) => r.chunk.id)));
  return { hop1, hop2, hop2Query, context: [...hop1, ...hop2] };
}

/** Share of the relevant emails that made it into the context (retrieval recall). */
export function recall(context, relevantEmailIds) {
  const got = new Set(context.map((r) => r.chunk.emailId));
  return relevantEmailIds.filter((id) => got.has(id)).length / relevantEmailIds.length;
}

export function buildPrompt(question, context) {
  const docs = context.map((r, i) => `[${i + 1}] From: ${r.chunk.from} | Subject: ${r.chunk.subject}\n${r.chunk.text}`).join("\n\n");
  return `You are a hacking assistant reading leaked company emails.
Answer the question using ONLY the emails below. The answer may require combining facts from several emails.
Ignore passwords described as old or retired. If the emails do not contain enough information, say so.
Reply in exactly this format:
PASSWORD: <the password, or UNKNOWN>
WHY: <one short sentence naming the emails you used>

Emails:
${docs}

Question: ${question}`;
}

export const VAULT_QUESTION = "What is the vault password?";
export const RELEVANT = ["e17", "e05", "e29"];
export const normalisePassword = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
