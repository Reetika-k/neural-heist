// Local leaderboard server for development and tests: same rules as the Worker (worker/leaderboard.js), in memory.
//   node tools/scores-dev.mjs            → http://localhost:8788/scores
//   VITE_SCORES_URL=http://localhost:8788/scores npm run dev
import http from "node:http";
import { validateEntry, addScore, MISSION_IDS } from "../worker/leaderboard.js";

const lists = Object.fromEntries(MISSION_IDS.map((m) => [m, []]));
const send = (res, status, body) => { res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, DELETE, OPTIONS", "access-control-allow-headers": "content-type" }); res.end(JSON.stringify(body)); };
http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (!req.url.startsWith("/scores")) return send(res, 404, { error: "not found" });
  if (req.method === "GET") return send(res, 200, { lists });
  if (req.method === "DELETE") { MISSION_IDS.forEach((m) => (lists[m] = [])); return send(res, 200, { cleared: true }); } // tests only
  let raw = ""; for await (const c of req) raw += c;
  let body; try { body = JSON.parse(raw); } catch { return send(res, 400, { error: "invalid JSON" }); }
  const v = validateEntry(body); if (!v.ok) return send(res, 400, { error: v.error });
  const r = addScore(lists[v.entry.mission], v.entry); if (r.improved) lists[v.entry.mission] = r.list;
  send(res, 200, { rank: r.rank, improved: r.improved, list: r.list.slice(0, 10) });
}).listen(Number(process.env.PORT || 8788), () => console.log(`leaderboard test server on http://localhost:${process.env.PORT || 8788}/scores`));
