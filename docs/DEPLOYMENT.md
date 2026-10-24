# Deployment

**Live:** https://reetika-k.github.io/neural-heist/ (GitHub Pages, published by `.github/workflows/deploy-pages.yml` on every push to `main`: `npm ci` → `npm test` → `npm run build` → deploy `dist/`).

Two pieces: the static game (GitHub Pages, or Cloudflare Pages as an alternative) and the LLM proxy (a Cloudflare Worker holding the Gemini key). **Status (2026-10-24): both are live.** Worker: `https://neural-heist-llm.reetikakukreja12.workers.dev` with `GEMINI_MODEL = "gemini-3.5-flash-lite"`; the repository variable `VITE_LLM_URL` points the Pages build at it. The game also works without the Worker: Mission 3's assistant then reasons offline over the retrieved emails (`src/teammates/reasoner.js`) and answers in the same format.

Model names change: Google shut down `gemini-2.0-flash` (the Worker then got HTTP 404 from Gemini). To change the model, edit `GEMINI_MODEL` in `worker/wrangler.toml` and run `npx wrangler deploy` in `worker/` (the key secret is kept). Check the current names at https://ai.google.dev/gemini-api/docs/models.

The Worker is pinned to `[placement] region = "gcp:us-central1"`: without it, Cloudflare sometimes ran it in a region where Gemini answers 400 "User location is not supported". To see Google's reason for any failure, run `npx wrangler tail` in `worker/` (the key is never logged).

Verified locally: `npm run build` produces `dist/` (relative asset paths, `data/emails.json` included) and the full browser test passes 66/66 against `vite preview` of that build (2026-10-22).

## 1. Alternative: game on Cloudflare Pages

1. Use the GitHub repository https://github.com/Reetika-k/neural-heist.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**, choose the repo.
3. Build settings: **Root directory** `/` · **Build command** `npm run build` · **Output directory** `dist`.
4. Deploy. The game is live at `https://<project>.pages.dev`.

## 2. LLM proxy on Cloudflare Workers

Quickest way (GitHub Pages): `bash scripts/connect-llm.sh`. It logs in to Cloudflare, deploys the Worker (allowed origin `https://reetika-k.github.io`, already set in `wrangler.toml`), asks for the Gemini key in a hidden prompt (stored as a Cloudflare secret, never in the repo), sets the `VITE_LLM_URL` repository variable and re-runs the Pages deploy. Needs a free Gemini key from https://aistudio.google.com and a free Cloudflare account. The manual steps:

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

- Open the public URL in Chrome, Edge and Firefox, and on a phone (390 px is tested: menus, Labs, drag-to-move gameplay, the context action button, pause and mission select).
- Play Mission 3 and confirm the terminal says "answered by gemini-…" (or "offline reasoning" if the Worker is not set up). Quick check without the game: `curl -X POST <worker>/ask -H "content-type: application/json" -H "origin: https://reetika-k.github.io" -d '{"question":"What is the vault password?","context":[…]}'`; any other origin gets 403 "origin not allowed".
- Put the URL in the README and in section 15 of `docs/CAPSTONE_DOCUMENTATION.md`.

## Project dashboard
Run `npm run test:tap && npm run dashboard` before `npm run build` so the dashboard matches the code. The build copies it to `dist/dashboard.html` and `dist/reports/dashboard.html`, so after deployment it opens at `<public URL>/dashboard.html`.
