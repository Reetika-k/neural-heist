// Offline reasoning for the hacking assistant (Mission 3), used when no language model is connected
// (the public site) or the model fails. It reads ONLY the emails the player's search index retrieved,
// the same context a language model would get, and answers in the same "PASSWORD / WHY" format.
// So the game still teaches the RAG lesson without a model: good retrieval → the right password;
// a missing clue → "UNKNOWN" plus which fact was missing. It never looks at emails outside the context.
//
// Steps: 1) find the rule that says how the new password is built (ignoring old or retired passwords);
//        2) find Mr. Varma's first robot (not the robotics club's robot);
//        3) find the floor of the NEW server room (not the old one, not other floors);
//        4) combine: NAME IN CAPITALS + floor number.

const sentencesOf = (text) => String(text).match(/[^.!?]+[.!?]?/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
const quote = (r) => `"${r.chunk.subject}"`;

/**
 * @param {{chunk: {emailId, subject, text}}[]} context  retrieved chunks (hop 1 then hop 2)
 * @returns {{ answer: string, password: string|null, steps: string[], missing: string[] }}
 */
export function reasonOffline(context) {
  const steps = [], missing = [];
  const retired = context.find((r) => /\b(old|retired)\b/i.test(r.chunk.text) && /password/i.test(r.chunk.text));
  const rule = context.find((r) => /new password is/i.test(r.chunk.text) && !/\bretired\b/i.test(r.chunk.text));

  if (!rule) {
    steps.push("No retrieved email says how the new vault password is made.");
    if (retired) steps.push(`${quote(retired)} mentions a password, but it is described as old or retired, so I ignore it.`);
    return finish(null, steps, ["the rule for the new password"], []);
  }
  steps.push(`${quote(rule)}: the new password is Mr. Varma's first robot's name in capitals, followed by the floor of the new server room.`);
  if (retired) steps.push(`${quote(retired)} mentions an old, retired password; ignored.`);
  const used = [rule];

  // Mr. Varma's first robot: the name must come from an email about Mr. Varma (not the robotics club's robot).
  let robot = null;
  for (const r of context) {
    const m = r.chunk.text.match(/first robot[^.]*?\b(?:named|called)\s+([A-Z][a-z]+)/);
    if (!m) continue;
    if (/Varma/.test(r.chunk.text)) { robot = { name: m[1], r }; break; }
    steps.push(`${quote(r)} names a first robot, ${m[1]}, but not Mr. Varma's; ignored.`);
  }
  if (robot) { steps.push(`${quote(robot.r)}: Mr. Varma's first robot was named ${robot.name}.`); used.push(robot.r); }
  else missing.push("the name of Mr. Varma's first robot");

  // Floor of the NEW server room (sentence-level, so "the old server room on floor 12" is never taken).
  let floor = null;
  for (const r of context) {
    for (const s of sentencesOf(r.chunk.text)) {
      const m = s.match(/new server room[^.]*?\bfloor\s+(\d+)/i);
      if (m && !/\bold\b/i.test(s)) { floor = { n: m[1], r }; break; }
    }
    if (floor) break;
  }
  if (floor) { steps.push(`${quote(floor.r)}: the new server room is on floor ${floor.n}.`); used.push(floor.r); }
  else missing.push("the floor of the new server room");

  const password = robot && floor ? robot.name.toUpperCase() + floor.n : null;
  return finish(password, steps, missing, used);
}

function finish(password, steps, missing, used) {
  const why = password
    ? `I combined ${used.map(quote).join(", ")}.`
    : `I could not find ${missing.join(" or ")} in the emails I retrieved. Try a better index (chunk size, k) in the Lab.`;
  return { answer: `PASSWORD: ${password ?? "UNKNOWN"}\nWHY: ${why}`, password, steps, missing };
}
