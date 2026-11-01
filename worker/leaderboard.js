// Online leaderboard rules (2026-10-26: "3–4 users played but no best score shows; we want to show how others play").
// Pure functions shared by the Cloudflare Worker and the local test server: no storage or network here.
//
// An entry is accepted only if its parts add up under the game's scoring rules (finish 1000 + stealth 0/500 +
// time 0–300 + AI 0–500), its nickname is short and clean, and its mission exists. One line per nickname per mission:
// only that player's best counts. The game runs in the browser, so a determined cheat could still fake a valid
// score; these checks stop mistakes and casual tampering, not every attack.

export const MISSION_IDS = [1, 2, 3, 4];
export const KEEP = 20;          // entries kept per mission
export const MAX_NAME = 16;
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} _.-]*$/u; // \p{M}: vowel signs in Devanagari and other scripts
const BLOCKED = /(fuck|shit|bitch|cunt|nigg|fag|rape|porn|chutiya|madarchod|bhenchod|randi)/i;

/** Clean a nickname, or return null if it is not acceptable. */
export function cleanName(raw) {
  const name = String(raw ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!name || [...name].length > MAX_NAME || !NAME_RE.test(name) || BLOCKED.test(name.replace(/[\s_.-]/g, ""))) return null;
  return name;
}

/**
 * Validate a submitted score.
 * @param body { mission, name, score, breakdown: { finish, stealth, time, ai }, stars, seconds }
 * @returns { ok: true, entry } or { ok: false, error }
 */
export function validateEntry(body, now = new Date()) {
  const mission = Number(body?.mission);
  if (!MISSION_IDS.includes(mission)) return { ok: false, error: "unknown mission" };
  const name = cleanName(body?.name);
  if (!name) return { ok: false, error: `nickname: 1–${MAX_NAME} letters or numbers, nothing offensive` };
  const b = body?.breakdown ?? {};
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  if (b.finish !== 1000 || ![0, 500].includes(b.stealth) || !int(b.time, 0, 300) || !int(b.ai, 0, 500)) return { ok: false, error: "breakdown outside the scoring rules" };
  const score = b.finish + b.stealth + b.time + b.ai;
  if (body.score !== score) return { ok: false, error: "score does not match its breakdown" };
  if (!int(body.stars, 1, 3)) return { ok: false, error: "stars must be 1–3" };
  const seconds = Number(body.seconds);
  if (!(seconds > 0 && seconds < 3600)) return { ok: false, error: "time out of range" };
  return { ok: true, entry: { name, mission, score, stars: body.stars, seconds: Math.round(seconds * 10) / 10, stealth: b.stealth === 500, ai: b.ai, at: now.toISOString().slice(0, 10) } };
}

const better = (a, b) => b.score - a.score || a.seconds - b.seconds || a.at.localeCompare(b.at);

/** Add an entry to a mission's list: one line per nickname (case-insensitive), best first, at most KEEP. Returns { list, rank, improved }. */
export function addScore(list, entry) {
  const key = entry.name.toLowerCase();
  const old = list.find((e) => e.name.toLowerCase() === key);
  let next = list, improved = true;
  if (old) {
    if (better(entry, old) < 0) next = list.filter((e) => e !== old).concat(entry);
    else improved = false;
  } else next = list.concat(entry);
  next = [...next].sort(better).slice(0, KEEP);
  const idx = next.findIndex((e) => e.name.toLowerCase() === key);
  return { list: next, rank: idx >= 0 ? idx + 1 : null, improved };
}

/** Overall ranking: each nickname's best scores summed across missions. */
export function overall(lists) {
  const by = new Map();
  for (const [m, list] of Object.entries(lists)) for (const e of list) {
    const k = e.name.toLowerCase(), cur = by.get(k) ?? { name: e.name, total: 0, missions: 0, stars: 0 };
    cur.total += e.score; cur.missions += 1; cur.stars += e.stars; by.set(k, cur); void m;
  }
  return [...by.values()].sort((a, b) => b.total - a.total || b.missions - a.missions || a.name.localeCompare(b.name));
}
