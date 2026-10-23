#!/usr/bin/env bash
# Connects the live game to a real language model (Mission 3's hacking assistant).
# You need: a free Gemini API key (https://aistudio.google.com → Get API key) and a free Cloudflare account.
# The key is typed into a hidden prompt by wrangler and stored as a Cloudflare secret: it never touches this repo.
set -euo pipefail
cd "$(dirname "$0")/../worker"

echo "1/4  Log in to Cloudflare (a browser window opens)…"
npx --yes wrangler@4 login

echo "2/4  Deploying the LLM proxy Worker…"
URL=$(npx --yes wrangler@4 deploy 2>&1 | tee /dev/stderr | grep -Eo 'https://[a-z0-9.-]+\.workers\.dev' | head -1)
[ -n "$URL" ] || { echo "Could not read the Worker URL from the deploy output."; exit 1; }

echo "3/4  Paste your Gemini API key when asked (input is hidden)…"
npx --yes wrangler@4 secret put GEMINI_API_KEY

echo "4/4  Pointing the live game at $URL and redeploying…"
gh variable set VITE_LLM_URL --body "$URL"
gh workflow run deploy-pages.yml --ref main
echo "Done. In 2–3 minutes, play Mission 3 on https://reetika-k.github.io/neural-heist/ : the terminal should say \"answered by gemini-…\"."
