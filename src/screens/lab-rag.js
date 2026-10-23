// Mission 3 Lab: chunk the leaked emails, build the TF-IDF index, and test what the assistant would find.
// 2026-10-23: rewritten to explain itself. Players thought the search box was where to type the password; it is the
// assistant's question. The Lab now says so, marks the three clue emails, shows the hop-2 search words, and previews
// the assistant's answer from exactly the emails it found. (Previous version: git history, commit 90e9e9e.)
import { buildIndex, multiHop, recall, VAULT_QUESTION, RELEVANT } from "../lab/rag.js";
import { reasonOffline } from "../teammates/reasoner.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/** The three emails the password is built from, and what each one gives. */
export const CLUES = { e17: "the rule", e05: "the robot's name", e29: "the floor" };

/** Search results; with markClues, the clue emails get a badge (used in the Lab and the mission terminal). */
export function renderHits(hits, label, { markClues = false } = {}) {
  if (!hits.length) return `<p class="fine">${label}: nothing matched.</p>`;
  const max = Math.max(...hits.map((h) => h.score), 1e-9);
  return `<p class="hop-label">${label}</p>` + hits.map((h) => {
    const clue = markClues && CLUES[h.chunk.emailId];
    return `
    <div class="hit${clue ? " hit-clue" : ""}"><div class="hit-head"><span>${esc(h.chunk.subject)}</span>${clue ? `<em class="clue-badge">clue: ${clue}</em>` : ""}<b>${h.score.toFixed(3)}</b></div>
    <div class="hit-bar"><i style="width:${Math.round((h.score / max) * 100)}%"></i></div>
    <p>${esc(h.chunk.text)}</p></div>`;
  }).join("");
}

/** Slider hints, from measurements over every setting (chunk 1: 1 of 3 clues; k 1–2: 2 of 3; chunk ≥ 2 and k ≥ 3: 3 of 3). */
export function ragHint(key, v) {
  // measured 2026-10-24: one hop finds only the rule email (1 of 3) at every chunk size and k; two hops are needed
  if (key === "hops") return v < 2
    ? { kind: "bad", text: "One hop searches with the question only. The question never mentions Mr. Varma's robot or the server room, so those clues are never found (1 of 3)." }
    : { kind: "good", text: "Hop 2 searches again with the new words from the best email and follows the lead to the other clues." };
  if (key === "chunk") return v === 1
    ? { kind: "bad", text: "One sentence per chunk: the rule is cut away from \"Mr. Varma\" and the server room, so the search loses the trail (1 of 3 clues)." }
    : { kind: "good", text: "Sentences stay together with their context, so each clue can be found." };
  if (key === "k") return v <= 2
    ? { kind: "bad", text: "Too few results per hop: one clue email is left out (2 of 3 clues)." }
    : { kind: "good", text: "Enough results per hop to bring in all the clue emails." };
  return { kind: "good", text: "" };
}

export function mountRagLab(root, { emails, onDone, onBack, prev = null }) {
  let chunkSize = prev?.chunkSize ?? 2, k = prev?.k ?? 3, hops = prev?.hops ?? 2, index = prev?.index ?? null;
  root.innerHTML = `
    <div class="lab">
      <header class="lab-head">
        <div><p class="eyebrow">Mission 3 Lab · Retrieval-augmented generation</p><h2>Build your assistant's search index</h2>
        <p class="lab-sub"><b>You don't type the password here.</b> In the mission, your hacking assistant searches ${emails.length} leaked emails and works the password out for you. The password is not written anywhere: it is hidden in pieces across several emails. Your job is to build the search index it uses: the better it finds the clues, the better its answer.</p></div>
        <div class="lab-counts"><b>${emails.length}</b> leaked emails</div>
      </header>
      <ol class="rag-steps">
        <li><span class="hs-num">1</span><div><b>Build the index</b><p>Cut the emails into chunks and turn each into a word fingerprint.</p></div></li>
        <li><span class="hs-num">2</span><div><b>Test it</b><p>See which emails the assistant finds for its question, and what it would answer.</p></div></li>
        <li><span class="hs-num">3</span><div><b>Start the mission</b><p>At the terminal the assistant tells you the password. You type it in.</p></div></li>
      </ol>
      <div class="lab-body">
        <div class="rag-main">
          <label class="rag-q-label" for="rag-q">The assistant's question <span class="fine">(already filled in; change it only to experiment)</span></label>
          <div class="rag-query"><input id="rag-q" value="${VAULT_QUESTION}" aria-label="The assistant's question"><button class="btn-primary" id="rag-search" disabled>Test search</button></div>
          <div id="rag-summary" class="rag-summary hidden" aria-live="polite"></div>
          <div id="rag-results" class="rag-results"><p class="fine">Press <b>Build index</b> first. Then the test runs automatically: you will see which emails the assistant finds, how closely each matches (0 to 1), and what it would answer.</p></div>
          <details class="rag-emails"><summary>Browse the ${emails.length} leaked emails</summary>${emails.map((e) => `<p><b>${esc(e.subject)}</b> <span class="fine">(${esc(e.from)})</span><br>${esc(e.body)}</p>`).join("")}</details>
        </div>
        <aside class="lab-side">
          <details class="q-how"><summary>How does the search work?</summary>
            <p><b>Index:</b> each chunk becomes a word fingerprint (TF-IDF). Rare words such as <i>vault</i>, <i>robot</i> or <i>floor</i> count a lot; common words such as <i>the</i> are ignored.</p>
            <p><b>Search:</b> the question gets a fingerprint too; the score shows how much the words overlap (cosine similarity, 0 to 1).</p>
            <p><b>Two hops:</b> hop 1 searches with the question. The best email found mentions things the question did not (Mr. Varma's robot, the new server room), so hop 2 searches again with those words to follow the lead.</p>
          </details>
          <label class="slider">Chunk size (sentences per chunk) <b id="v-chunk"></b><input type="range" id="r-chunk" min="1" max="4" step="1"><span class="q-hint" id="h-chunk"></span></label>
          <label class="slider">Results to retrieve per hop (k) <b id="v-k"></b><input type="range" id="r-k" min="1" max="6" step="1"><span class="q-hint" id="h-k"></span></label>
          <div class="slider"><span>Search hops</span><div class="view-toggle hop-toggle" role="group" aria-label="Search hops"><button type="button" data-hops="1">1 hop</button><button type="button" data-hops="2">2 hops</button></div><span class="q-hint" id="h-hops"></span></div>
          <button class="btn-primary" id="rag-build">Build index</button>
          <dl class="metric-row"><div><dt>Chunks</dt><dd id="rag-chunks">–</dd></div><div><dt>Vocabulary</dt><dd id="rag-vocab">–</dd></div></dl>
          <p class="fine">Embedding: TF-IDF vectors (word frequency × rarity), L2-normalised. Two hops: the question finds the first chunks; hop 2 follows the best lead with the words it added.</p>
          <button class="btn-primary btn-go" id="rag-go" disabled>Start mission</button>
          <button class="btn-link" id="rag-back">Back to briefing</button>
        </aside>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const hint = (id, v) => { const h = ragHint(id, v), el = $(`#h-${id}`); el.textContent = (h.kind === "good" ? "✓ " : "⚠ ") + h.text; el.dataset.kind = h.kind; };
  const bind = (id, get, set) => {
    const el = $(`#r-${id}`); el.value = get();
    const show = () => { $(`#v-${id}`).textContent = el.value; hint(id, Number(el.value)); };
    el.addEventListener("input", () => {
      set(Number(el.value)); show(); index = null; $("#rag-go").disabled = true; $("#rag-search").disabled = true; $("#rag-chunks").textContent = "–"; $("#rag-vocab").textContent = "–";
      $("#rag-summary").classList.add("hidden");
      $("#rag-results").innerHTML = `<p class="fine">Settings changed: press <b>Build index</b> again.</p>`;
    });
    show();
  };
  bind("chunk", () => chunkSize, (v) => (chunkSize = v));
  bind("k", () => k, (v) => (k = v));
  // hops: no rebuild needed (same index, different search), so the test re-runs straight away
  const showHops = () => {
    root.querySelectorAll("[data-hops]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.hops) === hops)));
    hint("hops", hops);
  };
  root.querySelectorAll("[data-hops]").forEach((b) => b.addEventListener("click", () => { hops = Number(b.dataset.hops); showHops(); if (index) search(); }));
  showHops();

  function build() {
    index = buildIndex(emails, { chunkSize });
    $("#rag-chunks").textContent = index.chunks.length; $("#rag-vocab").textContent = index.vocabulary;
    $("#rag-go").disabled = false; $("#rag-search").disabled = false;
    search(); // test straight away, so the player sees what the index finds
    return index;
  }
  function search() {
    if (!index) return null;
    const question = $("#rag-q").value;
    const r = multiHop(index, question, k, { hops });
    const isVault = question.trim().toLowerCase() === VAULT_QUESTION.toLowerCase();
    const found = new Set(r.context.map((h) => h.chunk.emailId));
    const words = r.hop2Query.split(/\s+/).filter(Boolean);
    $("#rag-results").innerHTML = renderHits(r.hop1, "Hop 1 · searching with the question", { markClues: true })
      + (words.length ? `<p class="hop-words">Hop 2 searches with the new words from the best result: ${[...new Set(words)].map((w) => `<code>${esc(w)}</code>`).join(" ")}</p>` : "")
      + (hops < 2 ? `<p class="fine">Hop 2 is switched off: the assistant only searches with the question.</p>` : renderHits(r.hop2, "Hop 2 · following the lead", { markClues: true }));
    // summary: clues found, and the answer the assistant would give from exactly these emails
    const s = $("#rag-summary");
    if (isVault) {
      const got = Object.keys(CLUES).filter((id) => found.has(id)), answer = reasonOffline(r.context);
      const ok = got.length === RELEVANT.length;
      s.innerHTML = `<p class="rag-meter"><b>Clues found: ${got.length} of ${RELEVANT.length}</b> ${Object.entries(CLUES).map(([id, what]) => `<span class="clue-chip${found.has(id) ? " on" : ""}">${found.has(id) ? "✓" : "✗"} ${what}</span>`).join(" ")}</p>
        <p class="rag-answer"><b>What your assistant would answer in the mission:</b> <code>${esc(answer.answer.split("\n")[0])}</code></p>
        <p>${ok ? "It has every piece, so it can work the password out. In the mission it shows you the answer at the terminal and you type it in." : `It is missing ${Object.entries(CLUES).filter(([id]) => !found.has(id)).map(([, w]) => w).join(" and ")}, so it cannot work the password out. ${hops < 2 ? "Switch on the second hop." : ragHint("chunk", chunkSize).kind === "bad" ? "Try a chunk size of 2 or more." : "Try 3 or more results per hop (k)."}`}</p>`;
      s.dataset.kind = ok ? "good" : "bad";
    } else {
      s.innerHTML = `<p>Testing your own question: the assistant's real question in the mission is <i>"${VAULT_QUESTION}"</i>. Found ${found.size} email${found.size === 1 ? "" : "s"}; recall of the clue emails: ${Math.round(recall(r.context, RELEVANT) * 100)} %.</p>`;
      s.dataset.kind = "info";
    }
    s.classList.remove("hidden");
    return r;
  }
  $("#rag-build").addEventListener("click", build);
  $("#rag-search").addEventListener("click", search);
  $("#rag-q").addEventListener("keydown", (e) => { if (e.key === "Enter") search(); });
  $("#rag-go").addEventListener("click", () => onDone({ rag: { index, chunkSize, k, hops }, report: { chunkSize, k, hops, chunks: index.chunks.length, vocabulary: index.vocabulary } }));
  $("#rag-back").addEventListener("click", onBack);
  if (index) { $("#rag-chunks").textContent = index.chunks.length; $("#rag-vocab").textContent = index.vocabulary; $("#rag-go").disabled = false; $("#rag-search").disabled = false; search(); }
  const setParams = (c, kk, h = 2) => { $("#r-chunk").value = c; $("#r-chunk").dispatchEvent(new Event("input")); $("#r-k").value = kk; $("#r-k").dispatchEvent(new Event("input")); root.querySelector(`[data-hops="${h}"]`).click(); };
  return { build, search, setParams };
}
