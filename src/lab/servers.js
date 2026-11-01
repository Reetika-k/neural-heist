// Mission 4 dataset: readings from the 24 server racks in VeloraTech's server farm. Nobody labelled them: the player
// groups them with k-means and decides which group looks like the archive that holds the stolen records.
// Four kinds of server (ground truth, used only for scoring and tests): web, database, monitoring, archive.
import { mulberry32, gauss } from "./rng.js";

export const SERVER_FEATURES = [
  { key: "requests", label: "Requests per minute", short: "requests/min" },
  { key: "storage", label: "Data stored (GB)", short: "stored GB" },
  { key: "outbound", label: "Outgoing traffic (MB/s)", short: "out MB/s" },
  { key: "cpu", label: "CPU load (%)", short: "CPU %" },
];

// mean and spread per measurement; storage is deliberately large and noisy, and archive and database storage overlap,
// so clustering the raw numbers is dominated by storage and mixes them up; scaled, the other measurements separate them
export const SERVER_KINDS = {
  web:        { n: 7, requests: [1150, 160], storage: [600, 450],  outbound: [42, 7],  cpu: [58, 9] },
  database:   { n: 6, requests: [420, 90],   storage: [3600, 900], outbound: [11, 3],  cpu: [76, 7] },
  monitoring: { n: 6, requests: [160, 45],   storage: [1200, 500], outbound: [5, 1.6], cpu: [22, 6] },
  archive:    { n: 5, requests: [25, 12],    storage: [4300, 700], outbound: [1.2, 0.6], cpu: [7, 3] },
};

/** 24 servers in a fixed, seeded order (the order also decides which rack in the hall each one sits in). */
export function serverFarm(seed = 4) {
  const rng = mulberry32(seed * 7717);
  const servers = [];
  for (const [kind, spec] of Object.entries(SERVER_KINDS)) {
    for (let i = 0; i < spec.n; i++) {
      const s = { kind };
      for (const f of SERVER_FEATURES) { const [m, sd] = spec[f.key]; s[f.key] = Math.max(0, Math.round((m + gauss(rng) * sd) * 10) / 10); }
      servers.push(s);
    }
  }
  // shuffle so the archive racks are scattered around the hall, then name them
  for (let i = servers.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [servers[i], servers[j]] = [servers[j], servers[i]]; }
  servers.forEach((s, i) => (s.id = `S${String(i + 1).padStart(2, "0")}`));
  const archive = servers.filter((s) => s.kind === "archive");
  const target = archive[Math.floor(rng() * archive.length)].id; // the rack that really holds the drive
  return { servers, target, archiveIds: archive.map((s) => s.id) };
}

/** Feature rows for the chosen measurements (keys from SERVER_FEATURES). */
export const featureRows = (servers, keys) => servers.map((s) => keys.map((k) => s[k]));
