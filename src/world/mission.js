// Mission flow: objective, win/lose, alarm, score and stars. Pure logic (unit-tested).
//
//   get the drive (pick it up, or have your AI teammate deliver it) ──▶ reach the exit ──▶ WIN
//   any guard starts chasing ──▶ alarm countdown starts (does not reset) ──reaches 0──▶ LOSE
//   a guard touches you ──▶ LOSE (caught; detected by the guard module)

export const MISSION_RULES = {
  pickupRadius: 0.6,
  exitRadius: 0.75,
  parTime: 45,
  alarmTime: 25,
  points: { finish: 1000, stealth: 500, perSecondUnderPar: 20, ai: 500 },
};

const centre = (c) => ({ x: c.x + 0.5, z: c.z + 0.5 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function createMission(map, rules = {}) {
  if (!map.exit) throw new Error("Map needs an E (exit)");
  const r = { ...MISSION_RULES, ...rules };
  return {
    time: 0, hasDrive: false, spotted: false, alarm: null, outcome: null, reason: null,
    drive: map.drive ? centre(map.drive) : null, exit: centre(map.exit),
    parTime: r.parTime, alarmTime: r.alarmTime,
  };
}

/** Start the alarm (a chase, a robot dog touching a laser, wrong passwords...). Never resets. */
export function triggerAlarm(m) {
  if (m.alarm === null && !m.outcome) { m.alarm = m.alarmTime; m.spotted = true; return true; }
  return false;
}

/**
 * Advance the mission by dt seconds.
 * @param {object} ctx { player: {x,z}, guards: [{state}], dt }
 * @returns {string[]} events: "pickup", "alarm", "win", "lose"
 */
export function updateMission(m, { player, guards, dt }) {
  const events = [];
  if (m.outcome) return events;
  m.time += dt;

  if (!m.hasDrive && m.drive && dist(player, m.drive) <= MISSION_RULES.pickupRadius) { m.hasDrive = true; events.push("pickup"); }

  if (guards.some((g) => g.state === "chase")) { m.spotted = true; if (triggerAlarm(m)) events.push("alarm"); }
  if (m.alarm !== null) m.alarm = Math.max(0, m.alarm - dt);

  if (m.hasDrive && dist(player, m.exit) <= MISSION_RULES.exitRadius) { m.outcome = "win"; events.push("win"); }
  else if (m.alarm === 0) { m.outcome = "lose"; m.reason = "alarm"; events.push("lose"); }
  return events;
}

/** Mark the mission lost (caught by a guard, robot dog destroyed...). */
export function failMission(m, reason = "caught") {
  if (!m.outcome) { m.outcome = "lose"; m.reason = reason; }
}

/**
 * Score and stars for a finished mission (a lost mission scores 0 and no stars).
 * aiScore (0..1) is how well your trained AI teammate performed in this mission.
 */
export function scoreMission(m, aiScore = 0) {
  const P = MISSION_RULES.points;
  const par = m.parTime ?? MISSION_RULES.parTime;
  if (m.outcome !== "win") return { score: 0, stars: [false, false, false], breakdown: { finish: 0, stealth: 0, time: 0, ai: 0 } };
  const breakdown = {
    finish: P.finish,
    stealth: m.spotted ? 0 : P.stealth,
    time: Math.max(0, Math.round((par - m.time) * P.perSecondUnderPar)),
    ai: Math.round(Math.max(0, Math.min(1, aiScore)) * P.ai),
  };
  return {
    score: breakdown.finish + breakdown.stealth + breakdown.time + breakdown.ai,
    stars: [true, !m.spotted, m.time <= par], // finished · never chased · under par
    breakdown,
  };
}
