# Deployment

Two pieces: the static game (Cloudflare Pages or GitHub Pages) and the LLM proxy (a Cloudflare Worker holding the Gemini key). The game works without the Worker: Mission 3's assistant then uses its offline fallback and shows the best-matching emails.

Verified locally: `npm run build` produces `dist/` (relative asset paths, `data/emails.json` included) and the full browser test passes 66/66 against `vite preview` of that build (2026-10-22).

## 1. Game on Cloudflare Pages (recommended)

1. Push the repository to GitHub (the game lives in the `neural-heist/` folder).
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**, choose the repo.
3. Build settings: **Root directory** `neural-heist` · **Build command** `npm run build` · **Output directory** `dist`.
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

## 3. Alternative: GitHub Pages

`npm run build` and publish `dist/` (for example with the `peaceiris/actions-gh-pages` action or by pushing `dist/` to a `gh-pages` branch). Asset paths are relative, so a sub-folder URL works. The Worker setup is the same; set `ALLOWED_ORIGIN` to the GitHub Pages origin.

## 4. Local LLM for development (no key)

```bash
ollama pull qwen2:7b
npm run dev:llm                                  # LLM dev proxy on http://localhost:8787/ask
VITE_LLM_URL=http://localhost:8787/ask npm run dev
```

## 5. After deploying

- Open the public URL in Chrome, Edge and Firefox, and on a phone (menus are tested at 390 px width; gameplay needs a keyboard).
- Play Mission 3 and confirm the terminal says "answered by gemini-…" (or "offline fallback" if the Worker is not set up).
- Put the URL in the README and in section 15 of `docs/CAPSTONE_DOCUMENTATION.md`.

## Project dashboard
Run `npm run test:tap && npm run dashboard` before `npm run build` so the dashboard matches the code. The build copies it to `dist/dashboard.html` and `dist/reports/dashboard.html`, so after deployment it opens at `<public URL>/dashboard.html`.
