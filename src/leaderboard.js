// Online leaderboard client (2026-10-26). The scores live on the Cloudflare Worker (/scores); the rules are in
// worker/leaderboard.js. With no leaderboard configured (local play without the test server), everything still works
// and the screens say the leaderboard is offline.
import { CONFIG } from "./config.js";
import { overall } from "../worker/leaderboard.js";

export const leaderboardEnabled = () => !!CONFIG.scoresUrl;

async function call(method, body) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(CONFIG.scoresUrl, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } finally { clearTimeout(timer); }
}

/** All boards: { lists: {1: [...], ...}, overall: [...] } */
export async function fetchBoards() {
  const { lists } = await call("GET");
  return { lists, overall: overall(lists) };
}

/** Submit a won mission. result: the game's scoreMission() output; returns { rank, improved, list }. */
export function submitScore({ mission, name, result, seconds }) {
  const b = result.breakdown;
  return call("POST", { mission, name, score: result.score, breakdown: { finish: b.finish, stealth: b.stealth, time: b.time, ai: b.ai }, stars: result.stars.filter(Boolean).length, seconds });
}
