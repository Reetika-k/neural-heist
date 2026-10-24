#!/usr/bin/env bash
# Connects the live game to a real language model (Mission 3's hacking assistant).
# You need: a free Gemini API key (https://aistudio.google.com → Get API key) and a free Cloudflare account.
# The key is typed into a hidden prompt by wrangler and stored as a Cloudflare secret: it never touches this repo.
set -euo pipefail
cd "$(dirname "$0")/../worker"

echo "1/4  Cloudflare login…"
if npx --yes wrangler@4 whoami 2>/dev/null | grep -q "You are logged in"; then echo "     already logged in"; else npx --yes wrangler@4 login; fi

echo "2/4  Deploying the LLM proxy Worker…"
# RETIRED 2026-10-24: piping deploy through tee made wrangler non-interactive, so on a new account it silently
# answered "no" to "register a workers.dev subdomain?" and failed.
# URL=$(npx --yes wrangler@4 deploy 2>&1 | tee /dev/stderr | grep -Eo 'https://[a-z0-9.-]+\.workers\.dev' | head -1)
# `script` keeps a real terminal (wrangler can ask its questions) while recording the output to read the URL.
LOG=$(mktemp)
script -q "$LOG" npx --yes wrangler@4 deploy || true
URL=$(grep -Eo 'https://[a-z0-9.-]+\.workers\.dev' "$LOG" | head -1); rm -f "$LOG"
if [ -z "$URL" ]; then
  echo
  echo "The Worker was not deployed. On a new Cloudflare account, first pick a free workers.dev subdomain:"
  echo "  Cloudflare dashboard → Workers & Pages → (onboarding) → choose a subdomain, or use the link wrangler printed above."
  echo "Then run this script again."
  exit 1
fi

echo "3/4  Paste your Gemini API key when asked (input is hidden)…"
npx --yes wrangler@4 secret put GEMINI_API_KEY

echo "4/4  Pointing the live game at $URL and redeploying…"
gh variable set VITE_LLM_URL --body "$URL"
gh workflow run deploy-pages.yml --ref main
echo "Done. In 2–3 minutes, play Mission 3 on https://reetika-k.github.io/neural-heist/ : the terminal should say \"answered by gemini-…\"."
