import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExport, eventsToCsv } from "../src/brain-panel/export.js";

test("CSV export: header, one row per event, quoting of commas and JSON details", () => {
  const csv = eventsToCsv([{ t: 1.5, mission: 1, type: "drone_scan", id: "G1", label: "guard" }, { t: 2, mission: 1, type: "pickup" }]);
  const lines = csv.split("\n");
  assert.equal(lines[0], "t,mission,type,details");
  assert.equal(lines.length, 3);
  assert.equal(lines[1], '1.5,1,drone_scan,"{""id"":""G1"",""label"":""guard""}"');
  assert.equal(lines[2], "2,1,pickup,");
});

test("JSON export: best scores, lab reports, events, assistant summary", () => {
  const state = { labReports: { 1: { testAccuracy: 0.9 } }, runLog: [{ t: 0, mission: 1, type: "mission_start" }], assist: { source: "fallback", recall: 1, latencyMs: 3, context: [{ chunk: { id: "e17#0", subject: "Vault access rotation" }, score: 0.49123 }], answer: "x" } };
  const out = buildExport(state, [{ id: 1, name: "Rooftop" }], () => 2500);
  assert.equal(out.bestScores.Rooftop, 2500);
  assert.equal(out.labReports[1].testAccuracy, 0.9);
  assert.equal(out.events.length, 1);
  assert.deepEqual(out.lastAssistant.retrieved[0], { id: "e17#0", subject: "Vault access rotation", score: 0.4912 });
});
