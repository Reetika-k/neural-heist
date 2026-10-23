# Deployment

**Live:** https://reetika-k.github.io/neural-heist/ (GitHub Pages, published by `.github/workflows/deploy-pages.yml` on every push to `main`: `npm ci` → `npm test` → `npm run build` → deploy `dist/`).

Two pieces: the static game (GitHub Pages, or Cloudflare Pages as an alternative) and the LLM proxy (a Cloudflare Worker holding the Gemini key). The game works without the Worker: Mission 3's assistant then reasons offline over the retrieved emails (`src/teammates/reasoner.js`) and answers in the same format.

Verified locally: `npm run build` produces `dist/` (relative asset paths, `data/emails.json` included) and the full browser test passes 66/66 against `vite preview` of that build (2026-10-22).

## 1. Alternative: game on Cloudflare Pages

1. Use the GitHub repository https://github.com/Reetika-k/neural-heist.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**, choose the repo.
3. Build settings: **Root directory** `/` · **Build command** `npm run build` · **Output directory** `dist`.
4. Deploy. The game is live at `https://<project>.pages.dev`.

## 2. LLM proxy on Cloudflare Workers

```bash
cd neural-heist/worker
npx wrangler login
# edit wrangler.toml: ALLOWED_ORIGIN = "https://<project>.pages.dev"
npx wrangler deploy
npx wrangler secret put GEMINI_API_KEY      # from https://aistudio.google.com (free tier)
npx wrangler secret put GROQ_API_KEY        # optional backup
```

Then in Cloudflare Pages → **Settings → Environment variables** add `VITE_LLM_URL = https://neural-heist-llm.<account>.workers.dev/ask` and redeploy (Vite bakes it in at build time).

What the Worker enforces: only `ALLOWED_ORIGIN` may call it; 20 requests per IP per hour; JSON validation; the prompt is rebuilt server-side from the question and context (clients cannot inject instructions); context is truncated; the key is never returned. The rate limit is per Worker isolate, which is fine for a demo; use KV or Durable Objects for a strict global limit.

## 3. GitHub Pages (in use)

Repository **Settings → Pages → Source: GitHub Actions**. The workflow builds with Node 22, runs the unit tests and publishes `dist/`. Asset paths are relative, so the `/neural-heist/` sub-folder works. To connect the LLM: deploy the Worker (section 2) with `ALLOWED_ORIGIN = "https://reetika-k.github.io"`, then add a repository variable `VITE_LLM_URL` (Settings → Secrets and variables → Actions → Variables) and re-run the workflow.

## 4. Local LLM for development (no key)

```bash
ollama pull qwen2:7b
npm run dev:llm                                  # LLM dev proxy on http://localhost:8787/ask
VITE_LLM_URL=http://localhost:8787/ask npm run dev
```

## 5. After deploying

- Open the public URL in Chrome, Edge and Firefox, and on a phone (menus are tested at 390 px width; gameplay needs a keyboard).
- Play Mission 3 and confirm the terminal says "answered by gemini-…" (or "offline reasoning" if the Worker is not set up).
- Put the URL in the README and in section 15 of `docs/CAPSTONE_DOCUMENTATION.md`.

## Project dashboard
Run `npm run test:tap && npm run dashboard` before `npm run build` so the dashboard matches the code. The build copies it to `dist/dashboard.html` and `dist/reports/dashboard.html`, so after deployment it opens at `<public URL>/dashboard.html`.
