#!/bin/sh
# For API keys that are NOT scoped to a workspace: store the workspace ID in .env and restart the backend.
# Find it at console.anthropic.com -> Settings -> Workspaces (looks like wrkspc_...).
# Usage (from the brick-buddy folder): sh tools/set_workspace_id.sh
set -e
cd "$(dirname "$0")/.."
[ -f .env ] || cp .env.example .env

printf "Paste your Anthropic workspace ID (starts with wrkspc_), then press Enter: "
read -r WS
case "$WS" in
  wrkspc_*) ;;
  *) echo "That doesn't look like a workspace ID (should start with wrkspc_). Nothing changed."; exit 1 ;;
esac

tmp=$(mktemp)
grep -v '^ANTHROPIC_WORKSPACE_ID=' .env > "$tmp" || true
printf 'ANTHROPIC_WORKSPACE_ID=%s\n' "$WS" >> "$tmp"
mv "$tmp" .env
chmod 600 .env
echo "Saved to .env. Restarting the backend..."
docker compose up -d --force-recreate backend
echo "Done."
