// Run export: everything the AI did this session, as JSON (full) and CSV (event log).
export function buildExport(state, missions, getBest) {
  return {
    game: "Neural Heist", exportedAt: new Date().toISOString(),
    bestScores: Object.fromEntries(missions.map((m) => [m.name, getBest(m.id)])),
    labReports: state.labReports,
    lastAssistant: state.assist ? { source: state.assist.source, recall: state.assist.recall, latencyMs: state.assist.latencyMs, tokens: state.assist.tokens ?? null, retrieved: state.assist.context.map((r) => ({ id: r.chunk.id, subject: r.chunk.subject, score: Number(r.score.toFixed(4)) })), answer: state.assist.answer } : null,
    events: state.runLog,
  };
}

const csvCell = (v) => { const s = typeof v === "object" ? JSON.stringify(v) : String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function eventsToCsv(events) {
  const rows = [["t", "mission", "type", "details"]];
  for (const e of events) { const { t, mission, type, ...rest } = e; rows.push([t, mission, type, Object.keys(rest).length ? rest : ""]); }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
