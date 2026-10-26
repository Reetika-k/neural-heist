// Mission 4: k-means clustering, the server-farm dataset, the network scanner and the map.
import { test } from "node:test";
import assert from "node:assert/strict";
import { kmeans, standardize, silhouette, elbow, matchScore, inertia } from "../src/lab/kmeans.js";
import { serverFarm, featureRows, SERVER_FEATURES, SERVER_KINDS } from "../src/lab/servers.js";
import { createScanner, checkRack, scannerScore, rackInReach, nextFlaggedRack, SCANNER } from "../src/teammates/scanner.js";
import { kmHint } from "../src/screens/lab-kmeans.js";
import { MISSION_4, MISSION_4_GUARDS, parseMap } from "../src/world/map.js";
import { MISSIONS } from "../src/world/missions.js";
import { astar } from "../src/guards/astar.js";

const ALL = SERVER_FEATURES.map((f) => f.key);
const farm = serverFarm(4);
/** The group a careful player would call "archive": the one with the fewest requests per minute. */
function quietest(servers, labels, k) {
  let best = 0, bv = Infinity;
  for (let j = 0; j < k; j++) { const m = servers.filter((_, i) => labels[i] === j); const v = m.reduce((a, s) => a + s.requests, 0) / (m.length || 1); if (m.length && v < bv) { bv = v; best = j; } }
  return servers.filter((_, i) => labels[i] === best).map((s) => s.id);
}
const run = (keys, k, scaled) => { const raw = featureRows(farm.servers, keys); const rows = scaled ? standardize(raw).rows : raw; const r = kmeans(rows, k, { seed: 1 }); return { ...r, rows, chosen: quietest(farm.servers, r.labels, k) }; };

test("k-means: separates obvious blobs, never increases inertia, is reproducible with a seed", () => {
  const pts = [[0, 0], [0.2, 0.1], [0.1, 0.3], [10, 10], [10.2, 9.9], [9.8, 10.1], [0, 10], [0.2, 9.8]];
  const r = kmeans(pts, 3, { seed: 7 });
  assert.equal(new Set(r.labels.slice(0, 3)).size, 1); assert.equal(new Set(r.labels.slice(3, 6)).size, 1); assert.equal(new Set(r.labels.slice(6)).size, 1);
  assert.equal(new Set(r.labels).size, 3);
  for (let i = 2; i < r.history.length; i++) assert.ok(inertia(pts, r.history[i].labels, r.history[i].centres) <= inertia(pts, r.history[i - 1].labels, r.history[i - 1].centres) + 1e-9, "each step tightens the groups");
  assert.deepEqual(kmeans(pts, 3, { seed: 7 }).labels, r.labels);
});

test("standardize: mean 0 and spread 1 per reading", () => {
  const { rows } = standardize(featureRows(farm.servers, ALL));
  for (let j = 0; j < 4; j++) {
    const col = rows.map((r) => r[j]), m = col.reduce((a, b) => a + b, 0) / col.length;
    assert.ok(Math.abs(m) < 1e-9); assert.ok(Math.abs(Math.sqrt(col.reduce((a, b) => a + (b - m) ** 2, 0) / col.length) - 1) < 1e-9);
  }
});

test("server farm: 24 servers, 4 kinds, the drive is on an archive server, reproducible", () => {
  assert.equal(farm.servers.length, 24);
  assert.equal(farm.archiveIds.length, SERVER_KINDS.archive.n);
  assert.ok(farm.archiveIds.includes(farm.target));
  assert.deepEqual(serverFarm(4), farm);
});

test("Lab lesson (measured): scaled readings and k = 4 find exactly the archive; the elbow and silhouette point to 4", () => {
  const good = run(ALL, 4, true);
  assert.equal(matchScore(good.chosen, farm.archiveIds).f1, 1);
  const sil = [2, 3, 4, 5, 6].map((k) => ({ k, s: silhouette(run(ALL, k, true).rows, run(ALL, k, true).labels) }));
  assert.equal(sil.reduce((a, b) => (b.s > a.s ? b : a)).k, 4, JSON.stringify(sil));
  const e = elbow(good.rows, 6, { seed: 1 }).map((x) => x.inertia);
  assert.ok(e[2] - e[3] > 3 * (e[3] - e[4]), `the curve flattens after k = 4: ${e.map((x) => x.toFixed(1)).join(" ")}`);
});

test("Lab lesson (measured): without scaling, storage dominates and the archive is mixed up", () => {
  const raw = run(ALL, 4, false);
  assert.ok(matchScore(raw.chosen, farm.archiveIds).f1 < 0.8, `F1 ${matchScore(raw.chosen, farm.archiveIds).f1}`);
  assert.equal(kmHint("scale", false).kind, "bad"); assert.equal(kmHint("scale", true).kind, "good");
});

test("Lab lesson (measured): too few groups (k = 3) merge the archive with another kind: many racks to search", () => {
  const r = run(ALL, 3, true), m = matchScore(r.chosen, farm.archiveIds);
  assert.equal(m.recall, 1, "the archive is inside the chosen group…");
  assert.ok(r.chosen.length >= 10 && m.precision < 0.5, `…but so are ${r.chosen.length - 5} other servers`);
});

test("match score: precision, recall and F1", () => {
  assert.deepEqual(matchScore(["a", "b"], ["a", "b"]), { precision: 1, recall: 1, f1: 1 });
  const m = matchScore(["a", "b", "c", "d"], ["a", "b"]);
  assert.equal(m.precision, 0.5); assert.equal(m.recall, 1); assert.ok(Math.abs(m.f1 - 2 / 3) < 1e-9);
  assert.equal(matchScore([], ["a"]).f1, 0);
});

test("Mission 4 map: 24 racks that block movement and sight, an exit reachable from the start, guards on open floor", () => {
  const map = parseMap(MISSION_4);
  assert.equal(map.racks.length, 24);
  const r = map.racks[0];
  assert.ok(map.isBlocked(r.x, r.z) && map.isWall(r.x, r.z), "racks block movement and sight");
  assert.ok(!map.walls.has(`${r.x},${r.z}`), "but are drawn as racks, not walls");
  assert.ok(astar(map, map.start, map.exit), "start → exit");
  // every rack can be reached: some free neighbour cell is reachable from the start
  for (const rk of map.racks) assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => !map.isBlocked(rk.x + dx, rk.z + dz) && astar(map, map.start, { x: rk.x + dx, z: rk.z + dz })), `rack at ${rk.x},${rk.z}`);
  for (const g of MISSION_4_GUARDS) for (const p of g.patrol) assert.ok(!map.isBlocked(p.x, p.z), `${g.id} patrol point ${p.x},${p.z}`);
  assert.equal(MISSIONS.find((m) => m.id === 4).lab, "kmeans");
});

test("scanner: flags the chosen group; a wrong rack counts, the right rack finds the drive; score = F1", () => {
  const map = parseMap(MISSION_4);
  const sc = createScanner(farm, { chosenIds: farm.archiveIds });
  assert.equal(scannerScore(sc), 1);
  const ti = farm.servers.findIndex((s) => s.id === farm.target), wi = farm.servers.findIndex((s) => s.kind !== "archive");
  assert.equal(checkRack(sc, wi), "wrong"); assert.equal(sc.wrong, 1);
  assert.equal(checkRack(sc, wi), "already"); assert.equal(sc.wrong, 1, "checking the same rack twice is not a new mistake");
  assert.equal(checkRack(sc, ti), "found"); assert.ok(sc.found);
  const r = map.racks[ti];
  assert.equal(rackInReach(map, { x: r.x + 0.5, z: r.z - 0.5 }), ti, "a rack is in reach from the aisle next to it");
  assert.equal(rackInReach(map, { x: 1.5, z: 1.5 }), null);
  assert.equal(createScanner(farm, null).flagged.size, 0, "no model: nothing flagged");
  assert.equal(SCANNER.maxWrong, 5);
  const sc2 = createScanner(farm, { chosenIds: farm.archiveIds });
  assert.ok(nextFlaggedRack(sc2, map, { x: 1.5, z: 1.5 }), "the arrow has a flagged rack to point to");
});
