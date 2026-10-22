// Mission 3 Lab: chunk the leaked emails, build the TF-IDF index, and test two-hop retrieval.
import { buildIndex, multiHop, VAULT_QUESTION } from "../lab/rag.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function renderHits(hits, label) {
  if (!hits.length) return `<p class="fine">${label}: nothing matched.</p>`;
  const max = Math.max(...hits.map((h) => h.score), 1e-9);
  return `<p class="hop-label">${label}</p>` + hits.map((h) => `
    <div class="hit"><div class="hit-head"><span>${esc(h.chunk.subject)}</span><b>${h.score.toFixed(3)}</b></div>
    <div class="hit-bar"><i style="width:${Math.round((h.score / max) * 100)}%"></i></div>
    <p>${esc(h.chunk.text)}</p></div>`).join("");
}

export function mountRagLab(root, { emails, onDone, onBack, prev = null }) {
  let chunkSize = prev?.chunkSize ?? 2, k = prev?.k ?? 3, index = prev?.index ?? null;
  root.innerHTML = `
    <div class="lab">
      <header class="lab-head">
        <div><p class="eyebrow">Mission 3 Lab · Retrieval-augmented generation</p><h2>Build your assistant's search index</h2>
        <p class="lab-sub">An LLM only knows what you put in its prompt. Your assistant first <b>retrieves</b> the most relevant leaked emails, then asks the model. Choose how to cut the emails into chunks and how many to retrieve, then test it. The password is spread over several emails.</p></div>
        <div class="lab-counts"><b>${emails.length}</b> leaked emails</div>
      </header>
      <div class="lab-body">
        <div class="rag-main">
          <div class="rag-query"><input id="rag-q" value="${VAULT_QUESTION}" aria-label="Test question"><button class="btn-primary" id="rag-search" disabled>Search</button></div>
          <div id="rag-results" class="rag-results"><p class="fine">Build the index, then search. Results show cosine similarity between the question and each chunk.</p></div>
          <details class="rag-emails"><summary>Browse the 40 leaked emails</summary>${emails.map((e) => `<p><b>${esc(e.subject)}</b> <span class="fine">(${esc(e.from)})</span><br>${esc(e.body)}</p>`).join("")}</details>
        </div>
        <aside class="lab-side">
          <label class="slider">Chunk size (sentences per chunk) <b id="v-chunk"></b><input type="range" id="r-chunk" min="1" max="4" step="1"></label>
          <label class="slider">Results to retrieve per hop (k) <b id="v-k"></b><input type="range" id="r-k" min="1" max="6" step="1"></label>
          <button class="btn-primary" id="rag-build">Build index</button>
          <dl class="metric-row"><div><dt>Chunks</dt><dd id="rag-chunks">–</dd></div><div><dt>Vocabulary</dt><dd id="rag-vocab">–</dd></div></dl>
          <p class="fine">Embedding: TF-IDF vectors (word frequency × rarity), L2-normalised. Two hops: the question finds the first chunks; hop 2 follows the best lead with the words it added.</p>
          <button class="btn-primary btn-go" id="rag-go" disabled>Start mission</button>
          <button class="btn-link" id="rag-back">Back to briefing</button>
        </aside>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const bind = (id, get, set) => { const el = $(`#r-${id}`); el.value = get(); const show = () => ($(`#v-${id}`).textContent = el.value); el.addEventListener("input", () => { set(Number(el.value)); show(); index = null; $("#rag-go").disabled = true; $("#rag-search").disabled = true; $("#rag-chunks").textContent = "–"; $("#rag-vocab").textContent = "–"; }); show(); };
  bind("chunk", () => chunkSize, (v) => (chunkSize = v));
  bind("k", () => k, (v) => (k = v));

  function build() {
    index = buildIndex(emails, { chunkSize });
    $("#rag-chunks").textContent = index.chunks.length; $("#rag-vocab").textContent = index.vocabulary;
    $("#rag-go").disabled = false; $("#rag-search").disabled = false;
    return index;
  }
  function search() {
    if (!index) return null;
    const r = multiHop(index, $("#rag-q").value, k);
    $("#rag-results").innerHTML = renderHits(r.hop1, "Hop 1 · question") + renderHits(r.hop2, "Hop 2 · following the lead");
    return r;
  }
  $("#rag-build").addEventListener("click", build);
  $("#rag-search").addEventListener("click", search);
  $("#rag-q").addEventListener("keydown", (e) => { if (e.key === "Enter") search(); });
  $("#rag-go").addEventListener("click", () => onDone({ rag: { index, chunkSize, k }, report: { chunkSize, k, chunks: index.chunks.length, vocabulary: index.vocabulary } }));
  $("#rag-back").addEventListener("click", onBack);
  if (index) { $("#rag-chunks").textContent = index.chunks.length; $("#rag-vocab").textContent = index.vocabulary; $("#rag-go").disabled = false; $("#rag-search").disabled = false; }
  const setParams = (c, kk) => { $("#r-chunk").value = c; $("#r-chunk").dispatchEvent(new Event("input")); $("#r-k").value = kk; $("#r-k").dispatchEvent(new Event("input")); };
  return { build, search, setParams };
}
