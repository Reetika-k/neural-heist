import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

// The project dashboard (reports/dashboard.html, built by `npm run dashboard`) is a self-contained page.
// Serve it at both /reports/dashboard.html (same path as the other capstone projects) and /dashboard.html,
// in the dev server, in `vite preview`, and in the production build (copied into dist/).
const DASHBOARD = path.resolve("reports/dashboard.html");
function dashboard() {
  const serve = (req, res, next) => {
    const url = (req.url || "").split("?")[0];
    if ((url === "/dashboard.html" || url === "/dashboard" || url === "/reports/dashboard.html") && fs.existsSync(DASHBOARD)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(fs.readFileSync(DASHBOARD));
      return;
    }
    next();
  };
  return {
    name: "project-dashboard",
    configureServer(server) { server.middlewares.use(serve); },
    configurePreviewServer(server) { server.middlewares.use(serve); },
    writeBundle(options) {
      if (!fs.existsSync(DASHBOARD)) { this.warn("reports/dashboard.html not found: run `npm run dashboard` before building"); return; }
      const out = options.dir || "dist";
      fs.mkdirSync(path.join(out, "reports"), { recursive: true });
      fs.copyFileSync(DASHBOARD, path.join(out, "reports/dashboard.html"));
      fs.copyFileSync(DASHBOARD, path.join(out, "dashboard.html"));
    },
  };
}

// base "./" keeps asset paths relative so the built game works from a sub-folder on GitHub Pages or Cloudflare Pages.
export default defineConfig({
  base: "./",
  server: { port: 5173, strictPort: true },
  build: { target: "es2022" },
  plugins: [dashboard()],
});
