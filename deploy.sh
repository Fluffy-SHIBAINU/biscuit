#!/usr/bin/env bash
# Deploy Biscuit: push the non-Neon keys from .env.local to Vercel production env (once each), then build and deploy.
set -euo pipefail
cd "$(dirname "$0")"
V=vercel
command -v vercel >/dev/null 2>&1 || V=/Users/grey/.nvm/versions/node/v24.21.0/bin/vercel
SCOPE=shawns-projects-77a58c52
existing="$($V env ls production --scope "$SCOPE" 2>/dev/null | awk 'NR>1 && $1 ~ /^[A-Z_]+$/ {print $1}')"
while IFS= read -r line || [ -n "$line" ]; do
  [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
  k="${line%%=*}"; v="${line#*=}"; v="${v%%[[:space:]]#*}"
  [[ -z "$v" ]] && continue
  case "$k" in VERCEL_*|POSTGRES_*|PG*|NEON_*|VITE_NEON_*|DATABASE_URL|KINDRED_AUTH_BYPASS) continue;; esac
  if ! grep -qx "$k" <<<"$existing"; then
    printf '%s' "$v" | $V env add "$k" production --scope "$SCOPE" >/dev/null && echo "env: added $k"
  fi
done < .env.local
$V --prod --yes --scope "$SCOPE"
