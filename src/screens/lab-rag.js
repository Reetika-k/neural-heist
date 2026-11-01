// Mission 3 Lab: chunk the leaked emails, build the TF-IDF index, and test what the assistant would find.
// 2026-10-23: rewritten to explain itself. Players thought the search box was where to type the password; it is the
// assistant's question. The Lab now says so, marks the three clue emails, shows the hop-2 search words, and previews
// the assistant's answer from exactly the emails it found. (Previous version: git history, commit 90e9e9e.)
import { buildIndex, multiHop, recall, tokenize, VAULT_QUESTION, RELEVANT } from "../lab/rag.js";
import { mulberry32 } from "../lab/rng.js";
import { reasonOffline } from "../teammates/reasoner.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/** The three emails the password is built from, and what each one gives. */
export const CLUES = { e17: "the rule", e05: "the robot's name", e29: "the floor" };

/** Wrap the words of `text` that the search matched (same tokenizer as the index) in <mark>. */
export function highlight(text, terms) {
  if (!terms || !terms.size) return esc(text);
  return String(text).split(/(\s+)/).map((w) => { const t = tokenize(w)[0]; return t && terms.has(t) ? `<mark>${esc(w)}</mark>` : esc(w); }).join("");
}
/** The matched words a chunk shares with the search terms (shown on each result so players see WHY it was found). */
export const sharedWords = (chunk, terms) => [...new Set(tokenize(`${chunk.subject} ${chunk.text}`).filter((t) => terms?.has(t)))];

/**
 * Search results; with markClues, the clue emails get a badge (used in the Lab and the mission terminal).
 * 2026-11-01: with `terms`, the words each result shares with the search are listed and highlighted, and results appear
 * one by one, so the search is visible rather than a list of scores.
 */
export function renderHits(hits, label, { markClues = false, terms = null } = {}) {
  if (!hits.length) return `<p class="fine">${label}: nothing matched.</p>`;
  const max = Math.max(...hits.map((h) => h.score), 1e-9);
  return `<p class="hop-label">${label}</p>` + hits.map((h, i) => {
    const clue = markClues && CLUES[h.chunk.emailId], shared = terms ? sharedWords(h.chunk, terms) : [];
    return `
    <div class="hit${clue ? " hit-clue" : ""}" style="--i:${i}"><div class="hit-head"><span>${esc(h.chunk.subject)}</span>${clue ? `<em class="clue-badge">clue: ${clue}</em>` : ""}<b>${h.score.toFixed(3)}</b></div>
    <div class="hit-bar"><i style="width:${Math.round((h.score / max) * 100)}%"></i></div>
    ${shared.length ? `<p class="hit-why">Matching words: ${shared.map((w) => `<code>${esc(w)}</code>`).join(" ")}</p>` : ""}
    <p>${highlight(h.chunk.text, terms)}</p></div>`;
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

// 2026-11-01 (after the dog Lab was rebuilt for confused playtesters): the same guided pattern for Mission 3. Steps
// (meet the assistant without an index → build the index and watch the search → send it), plain-language search choices,
// "guess, then test" experiments, visible word matching, one action bar; the exact controls moved to an Advanced Lab.
const GUIDE_KEY = "neural-heist.raglab.guided";
const seenGuide = () => { try { return localStorage.getItem(GUIDE_KEY) === "1"; } catch { return true; } };
const markGuide = () => { try { localStorage.setItem(GUIDE_KEY, "1"); } catch { /* private mode */ } };

/** Plain choices; each sets one exact parameter (the sliders in Advanced Lab show the numbers). */
export const SEARCH_CHOICES = [
  { key: "chunk", label: "How much of each email to keep together", options: [{ label: "One sentence", v: 1 }, { label: "Two sentences", v: 2 }, { label: "Whole paragraph", v: 4 }] },
  { key: "k", label: "Emails to read per search", options: [{ label: "1", v: 1 }, { label: "2", v: 2 }, { label: "3", v: 3 }, { label: "5", v: 5 }] },
  { key: "hops", label: "Follow the lead with a second search", options: [{ label: "Off", v: 1 }, { label: "On", v: 2 }] },
];
/** Measured on the game's 40 emails (unit-tested): one-sentence chunks find 1 clue, 1 email per search 2, no second search 1. */
export const RAG_EXPERIMENTS = [
  { id: "sentence", question: "What if each email is cut into single sentences?", set: { chunk: 1, k: 3, hops: 2 } },
  { id: "one", question: "What if the assistant reads only 1 email per search?", set: { chunk: 2, k: 1, hops: 2 } },
  { id: "nolead", question: "What if it doesn't follow the lead to a second search?", set: { chunk: 2, k: 3, hops: 1 } },
];
export const CLUE_GUESSES = [{ id: 3, label: "All 3 clues" }, { id: 2, label: "2 of 3" }, { id: 1, label: "Only 1" }];

export function mountRagLab(root, { emails, onDone, onBack, prev = null }) {
  let chunkSize = prev?.chunkSize ?? 2, k = prev?.k ?? 3, hops = prev?.hops ?? 2, index = prev?.index ?? null;
  let pendingExp = null, expMsg = null, met = !!prev;
  const firstVisit = !seenGuide() && !prev;
  root.innerHTML = `
    <div class="lab raglab${firstVisit ? " r-first" : ""}">
      <header class="lab-head">
        <div><p class="eyebrow">Mission 3 Lab · Retrieval-augmented generation</p><h2>Teach your assistant to search</h2>
        <p class="lab-sub"><b>You don't type the password here.</b> It is hidden in pieces across ${emails.length} leaked emails. Your hacking assistant has to <b>find the right emails</b> and put the pieces together. You decide how it searches.</p></div>
      </header>
      <ol class="q-steps" id="r-steps">
        <li data-step="1"><span class="hs-num">1</span><div><b>Meet your assistant</b><p>See what it does without a search index.</p><button type="button" class="btn-ghost q-step-btn" id="r-meet">Watch it</button></div></li>
        <li data-step="2"><span class="hs-num">2</span><div><b>Build the index</b><p>Watch it search and follow the lead.</p></div></li>
        <li data-step="3"><span class="hs-num">3</span><div><b>Send it</b><p>At the terminal it works the password out.</p></div></li>
      </ol>
      <div class="lab-body">
        <div class="rag-main">
          <div id="r-status" class="q-status r-status" aria-live="polite"></div>
          <div id="rag-summary" class="rag-summary hidden" aria-live="polite"></div>
          <div id="rag-results" class="rag-results"><p class="fine">Press <b>Build the index</b>: you will watch the assistant search the emails, see which words match, and what it would answer.</p></div>
        </div>
        <aside class="lab-side q-side">
          <section class="q-card" id="r-choices"><h3>How your assistant searches</h3>
            ${SEARCH_CHOICES.map((g) => `<div class="q-choice"><span class="q-choice-q">${g.label}</span><div class="q-seg" role="radiogroup" aria-label="${g.label}">${g.options.map((o) => `<button type="button" role="radio" data-search="${g.key}" data-value="${o.v}">${o.label}</button>`).join("")}</div><span class="q-hint q-choice-hint" data-shint="${g.key}"></span></div>`).join("")}
          </section>
          <section class="q-card q-experiments" id="r-experiments"><h3>Experiments: guess, then test</h3>
            <div class="q-exp-list" id="r-exp-list">${RAG_EXPERIMENTS.map((x) => `<button type="button" class="q-exp" data-rexp="${x.id}">${x.question}</button>`).join("")}</div>
            <div class="q-exp-ask hidden" id="r-exp-ask"><p class="q-exp-q" id="r-exp-q"></p><p class="fine">How many of the 3 clue emails will it find? Pick your guess and it searches straight away.</p>
              <div class="q-seg">${CLUE_GUESSES.map((g) => `<button type="button" data-rguess="${g.id}">${g.label}</button>`).join("")}</div>
              <button type="button" class="btn-link" id="r-exp-cancel">Cancel</button></div>
          </section>
          <details class="q-advanced" id="r-advanced"><summary>Advanced Lab: exact settings, scores, your own question</summary>
            <details class="q-how"><summary>How does the search work?</summary>
              <p><b>Index:</b> each chunk becomes a word fingerprint (TF-IDF). Rare words such as <i>vault</i>, <i>robot</i> or <i>floor</i> count a lot; common words such as <i>the</i> are ignored.</p>
              <p><b>Search:</b> the question gets a fingerprint too; the score shows how much the words overlap (cosine similarity, 0 to 1).</p>
              <p><b>Two hops:</b> hop 1 searches with the question. The best email found mentions things the question did not (Mr. Varma's robot, the new server room), so hop 2 searches again with those words to follow the lead.</p>
            </details>
            <label class="rag-q-label" for="rag-q">The assistant's question <span class="fine">(change it only to experiment)</span></label>
            <div class="rag-query"><input id="rag-q" value="${VAULT_QUESTION}" aria-label="The assistant's question"><button class="btn-ghost" id="rag-search" disabled>Test search</button></div>
            <label class="slider">Chunk size (sentences per chunk) <b id="v-chunk"></b><input type="range" id="r-chunk" min="1" max="4" step="1"><span class="q-hint" id="h-chunk"></span></label>
            <label class="slider">Results to retrieve per hop (k) <b id="v-k"></b><input type="range" id="r-k" min="1" max="6" step="1"><span class="q-hint" id="h-k"></span></label>
            <div class="slider"><span>Search hops</span><div class="view-toggle hop-toggle" role="group" aria-label="Search hops"><button type="button" data-hops="1">1 hop</button><button type="button" data-hops="2">2 hops</button></div><span class="q-hint" id="h-hops"></span></div>
            <dl class="metric-row"><div><dt>Chunks</dt><dd id="rag-chunks">–</dd></div><div><dt>Vocabulary</dt><dd id="rag-vocab">–</dd></div></dl>
            <p class="fine">Embedding: TF-IDF vectors (word frequency × rarity), L2-normalised.</p>
            <details class="rag-emails"><summary>Browse the ${emails.length} leaked emails</summary>${emails.map((e) => `<p><b>${esc(e.subject)}</b> <span class="fine">(${esc(e.from)})</span><br>${esc(e.body)}</p>`).join("")}</details>
          </details>
        </aside>
      </div>
      <div class="q-actionbar">
        <p class="q-next" id="r-next"></p>
        <div class="q-actions"><button class="btn-link" id="rag-back">Back to briefing</button><button class="btn-primary" id="rag-build">Build the index</button><button class="btn-primary btn-go" id="rag-go" disabled>Start mission</button></div>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const hint = (id, v) => { const h = ragHint(id, v), el = $(`#h-${id}`); el.textContent = (h.kind === "good" ? "✓ " : "⚠ ") + h.text; el.dataset.kind = h.kind; };
  const current = { chunk: () => chunkSize, k: () => k, hops: () => hops };
  function refreshChoices() {
    for (const g of SEARCH_CHOICES) {
      root.querySelectorAll(`[data-search="${g.key}"]`).forEach((b) => b.setAttribute("aria-checked", String(Number(b.dataset.value) === current[g.key]())));
      const h = ragHint(g.key, current[g.key]()), el = root.querySelector(`[data-shint="${g.key}"]`);
      el.textContent = h.text ? (h.kind === "good" ? "✓ " : "⚠ ") + h.text : ""; el.dataset.kind = h.kind;
    }
  }
  const stale = () => { index = null; expMsg = null; $("#rag-go").disabled = true; $("#rag-search").disabled = true; $("#rag-chunks").textContent = "–"; $("#rag-vocab").textContent = "–"; $("#rag-summary").classList.add("hidden"); $("#rag-results").innerHTML = `<p class="fine">Settings changed: press <b>Build the index</b> again.</p>`; updateBar(); };
  const bind = (id, get, set) => {
    const el = $(`#r-${id}`); el.value = get();
    const show = () => { $(`#v-${id}`).textContent = el.value; hint(id, Number(el.value)); };
    el.addEventListener("input", () => { set(Number(el.value)); show(); refreshChoices(); stale(); });
    show();
  };
  bind("chunk", () => chunkSize, (v) => (chunkSize = v));
  bind("k", () => k, (v) => (k = v));
  // hops: no rebuild needed (same index, different search), so the test re-runs straight away
  const showHops = () => { root.querySelectorAll("[data-hops]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.hops) === hops))); hint("hops", hops); refreshChoices(); };
  root.querySelectorAll("[data-hops]").forEach((b) => b.addEventListener("click", () => { hops = Number(b.dataset.hops); showHops(); expMsg = null; if (index) search(); else updateBar(); }));
  showHops();
  const setSlider = (id, v) => { $(`#r-${id}`).value = v; $(`#r-${id}`).dispatchEvent(new Event("input")); };
  root.querySelectorAll("[data-search]").forEach((b) => b.addEventListener("click", () => {
    const key = b.dataset.search, v = Number(b.dataset.value);
    if (key === "hops") root.querySelector(`[data-hops="${v}"]`).click(); else setSlider(key, v);
  }));

  function build() {
    index = buildIndex(emails, { chunkSize });
    $("#rag-chunks").textContent = index.chunks.length; $("#rag-vocab").textContent = index.vocabulary;
    $("#rag-go").disabled = false; $("#rag-search").disabled = false;
    search(); // test straight away, so the player sees what the index finds
    if (root.querySelector(".lab").classList.contains("r-first")) { root.querySelector(".lab").classList.remove("r-first"); markGuide(); }
    return index;
  }
  function search() {
    if (!index) return null;
    const question = $("#rag-q").value;
    const r = multiHop(index, question, k, { hops });
    const isVault = question.trim().toLowerCase() === VAULT_QUESTION.toLowerCase();
    const found = new Set(r.context.map((h) => h.chunk.emailId));
    const words = [...new Set(r.hop2Query.split(/\s+/).filter(Boolean))];
    const q1 = new Set(tokenize(question)), q2 = new Set(words);
    $("#rag-results").innerHTML = renderHits(r.hop1, `Search 1 · with the question: “${esc(question)}”`, { markClues: true, terms: q1 })
      + (hops < 2 ? `<p class="fine">The second search is off: the assistant only searches with the question.</p>`
        : (words.length ? `<p class="hop-words">The best email mentions things the question did not, so <b>search 2</b> follows that lead with its new words: ${words.slice(0, 14).map((w) => `<code>${esc(w)}</code>`).join(" ")}${words.length > 14 ? " …" : ""}</p>` : "")
          + renderHits(r.hop2, "Search 2 · following the lead", { markClues: true, terms: q2 }));
    // summary: clues found, and the answer the assistant would give from exactly these emails
    const s = $("#rag-summary");
    let got = null;
    if (isVault) {
      got = Object.keys(CLUES).filter((id) => found.has(id)); const answer = reasonOffline(r.context);
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
    if (pendingExp && got) {
      const right = pendingExp.guess === got.length, x = RAG_EXPERIMENTS.find((e) => e.id === pendingExp.id);
      s.insertAdjacentHTML("afterbegin", `<p class="q-exp-result" data-kind="${right ? "good" : "bad"}">🧪 <b>${x.question}</b><br>You guessed <b>${CLUE_GUESSES.find((g) => g.id === pendingExp.guess).label.toLowerCase()}</b>; it found <b>${got.length} of 3</b>. ${right ? "Well predicted!" : "Not quite: see which clue is missing below."}</p><button type="button" class="btn-link r-exp-reset">Back to the recommended search</button>`);
      s.querySelector(".r-exp-reset").addEventListener("click", () => setParams(2, 3, 2));
      expMsg = `🧪 You guessed <b>${CLUE_GUESSES.find((g) => g.id === pendingExp.guess).label.toLowerCase()}</b>; it found <b>${got.length} of 3</b>. ${right ? "Well predicted!" : "Not quite."}`;
      pendingExp = null;
    }
    $("#r-status").innerHTML = "";
    updateBar(got);
    return r;
  }
  // step 1: an assistant with no index can only skim a few emails at random
  function noIndexSkim(seed = 5) {
    const rng = mulberry32(seed), pool = emails.filter((e) => !CLUES[e.id]), picked = [];
    while (picked.length < 3) { const e = pool[Math.floor(rng() * pool.length)]; if (!picked.includes(e)) picked.push(e); }
    return picked;
  }
  $("#r-meet").addEventListener("click", () => {
    const picked = noIndexSkim();
    const ctx = picked.map((e) => ({ chunk: { id: e.id, emailId: e.id, subject: e.subject, from: e.from, text: e.body }, score: 0 }));
    const ans = reasonOffline(ctx).answer.split("\n")[0];
    $("#r-status").innerHTML = `<p>Without an index, your assistant cannot search: it can only skim a few of the ${emails.length} emails at random.</p>
      <div class="r-skim">${picked.map((e, i) => `<div class="hit" style="--i:${i}"><div class="hit-head"><span>${esc(e.subject)}</span><em class="clue-badge off">no clue</em></div><p>${esc(e.body.slice(0, 120))}${e.body.length > 120 ? "…" : ""}</p></div>`).join("")}</div>
      <p><b>Clues found: 0 of 3.</b> Its answer: <code>${esc(ans)}</code>. It needs an <b>index</b> to find the right emails.</p>`;
    met = true; $("#r-meet").textContent = "Watch again"; updateBar();
  });
  // experiments: question → guess → search → compare
  root.querySelectorAll("[data-rexp]").forEach((b) => b.addEventListener("click", () => {
    pendingExp = { id: b.dataset.rexp };
    $("#r-exp-q").textContent = RAG_EXPERIMENTS.find((x) => x.id === b.dataset.rexp).question;
    $("#r-exp-ask").classList.remove("hidden"); $("#r-exp-list").classList.add("hidden");
  }));
  const closeAsk = () => { $("#r-exp-ask").classList.add("hidden"); $("#r-exp-list").classList.remove("hidden"); };
  $("#r-exp-cancel").addEventListener("click", () => { pendingExp = null; closeAsk(); });
  root.querySelectorAll("[data-rguess]").forEach((b) => b.addEventListener("click", () => {
    const exp = { ...pendingExp, guess: Number(b.dataset.rguess) }, x = RAG_EXPERIMENTS.find((e) => e.id === exp.id);
    setParams(x.set.chunk, x.set.k, x.set.hops); pendingExp = exp; closeAsk(); build();
    requestAnimationFrame(() => $("#rag-summary").scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }));
  function updateBar(got = null) {
    const steps = root.querySelectorAll("#r-steps li"), built = !!index;
    const ok = built && (got ? got.length === 3 : true);
    const st = [met || built ? "done" : "active", built ? "done" : met ? "active" : "", built ? "active" : ""];
    steps.forEach((li, i) => { li.classList.toggle("done", st[i] === "done"); li.classList.toggle("active", st[i] === "active"); });
    $("#rag-build").textContent = built ? "Rebuild the index" : "Build the index";
    $("#rag-build").classList.toggle("btn-primary", !built || !ok); $("#rag-build").classList.toggle("btn-ghost", built && ok);
    $("#rag-go").classList.toggle("btn-primary", !built || ok); $("#rag-go").classList.toggle("btn-ghost", built && !ok);
    $("#r-next").innerHTML = expMsg && built ? expMsg
      : built && got && !ok ? `It found ${got.length} of 3 clues. Change <b>how your assistant searches</b> and build again.`
      : built ? "Next: <b>Start mission</b>. At the terminal your assistant works the password out."
      : met ? "Next: press <b>Build the index</b> and watch it search." : "Start with <b>1. Meet your assistant</b>, or go straight to <b>Build the index</b>.";
  }
  $("#rag-build").addEventListener("click", build);
  $("#rag-search").addEventListener("click", search);
  $("#rag-q").addEventListener("keydown", (e) => { if (e.key === "Enter") search(); });
  $("#rag-go").addEventListener("click", () => onDone({ rag: { index, chunkSize, k, hops }, report: { chunkSize, k, hops, chunks: index.chunks.length, vocabulary: index.vocabulary } }));
  $("#rag-back").addEventListener("click", onBack);
  refreshChoices();
  if (index) { $("#rag-chunks").textContent = index.chunks.length; $("#rag-vocab").textContent = index.vocabulary; $("#rag-go").disabled = false; $("#rag-search").disabled = false; search(); } else updateBar();
  function setParams(c, kk, h = 2) { setSlider("chunk", c); setSlider("k", kk); root.querySelector(`[data-hops="${h}"]`).click(); }
  return { build, search, setParams };
}
