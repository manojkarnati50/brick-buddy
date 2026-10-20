#!/bin/sh
# Store your Anthropic API key in .env (input hidden), then restart the backend.
# Usage (from the brick-buddy folder): sh tools/set_api_key.sh
set -e
cd "$(dirname "$0")/.."
[ -f .env ] || cp .env.example .env

printf "Paste your Anthropic API key (starts with sk-ant-), then press Enter: "
stty -echo
read -r KEY
stty echo
echo

case "$KEY" in
  sk-ant-*) ;;
  *) echo "That doesn't look like an Anthropic key (should start with sk-ant-). Nothing changed."; exit 1 ;;
esac

# replace (or add) the ANTHROPIC_API_KEY line without echoing the key
tmp=$(mktemp)
grep -v '^ANTHROPIC_API_KEY=' .env > "$tmp" || true
printf 'ANTHROPIC_API_KEY=%s\n' "$KEY" >> "$tmp"
mv "$tmp" .env
chmod 600 .env
unset KEY
echo "Saved to .env. Restarting the backend..."

docker compose up -d --force-recreate backend
echo "Done."
