#!/usr/bin/env node
// `npm start`: start the Vite dev server on port 5173, unless Neural Heist is already running there,
// in which case print the address instead of failing with "Port 5173 is already in use".
import { spawn } from "node:child_process";

const URL = "http://localhost:5173/";
let page = "";
try { page = await (await fetch(URL, { signal: AbortSignal.timeout(1500) })).text(); } catch { /* nothing on the port */ }

if (page.includes("<title>Neural Heist")) {
  console.log(`Neural Heist is already running: ${URL}\nDashboard: ${URL}dashboard.html\n(To restart it, stop the other terminal with Ctrl+C, then run npm start again.)`);
  process.exit(0);
}
const vite = spawn("npx", ["vite", ...process.argv.slice(2)], { stdio: "inherit", shell: process.platform === "win32" });
vite.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => vite.kill(sig));
