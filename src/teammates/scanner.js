// The network scanner (Mission 4). It flags the racks of the group the player called "archive" in the Lab; the player
// checks racks with E. Pure logic: no Three.js, unit-tested. Rack i in the map holds server i of the farm.
import { matchScore } from "../lab/kmeans.js";

// maxWrong 5 (not 3): even a perfect grouping flags 5 look-alike archive racks, so up to 4 empty ones can come before
// the drive. Good clustering never sets off the alarm; a poor one (11 flagged, or the drive's rack not flagged) usually does.
export const SCANNER = { reach: 1.3, maxWrong: 5 };

/** @param farm serverFarm(seed); @param clusters the Lab's choice { chosenIds } or null (no model: nothing flagged) */
export function createScanner(farm, clusters) {
  return { farm, flagged: new Set(clusters?.chosenIds ?? []), checked: new Map(), wrong: 0, found: false };
}

/** Index of the nearest rack within reach of the player, or null. */
export function rackInReach(map, pos, reach = SCANNER.reach) {
  let best = null, bd = Infinity;
  map.racks.forEach((r, i) => { const d = Math.hypot(pos.x - (r.x + 0.5), pos.z - (r.z + 0.5)); if (d <= reach && d < bd) { bd = d; best = i; } });
  return best;
}

/** Check rack i: "found" (it holds the drive), "wrong" (logged: brings a guard; 3 = alarm) or "already" (checked before). */
export function checkRack(sc, i) {
  const id = sc.farm.servers[i].id;
  if (sc.checked.has(id)) return "already";
  const found = id === sc.farm.target;
  sc.checked.set(id, found ? "found" : "wrong");
  if (found) { sc.found = true; return "found"; }
  sc.wrong++;
  return "wrong";
}

/** The scanner's AI score: how well the flagged racks match the real archive servers (F1 of precision and recall). */
export const scannerScore = (sc) => matchScore([...sc.flagged], sc.farm.archiveIds).f1;

/** Nearest flagged rack the player has not checked yet (for the objective arrow), as a map cell, or null. */
export function nextFlaggedRack(sc, map, pos) {
  let best = null, bd = Infinity;
  sc.farm.servers.forEach((s, i) => {
    if (!sc.flagged.has(s.id) || sc.checked.has(s.id)) return;
    const r = map.racks[i], d = Math.hypot(pos.x - (r.x + 0.5), pos.z - (r.z + 0.5));
    if (d < bd) { bd = d; best = r; }
  });
  return best;
}
