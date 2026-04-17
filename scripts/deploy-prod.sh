#!/usr/bin/env bash
# Production deploy wrapper. Loads VERCEL_TOKEN from .env.deploy (gitignored)
# and triggers a Vercel production deployment.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env.deploy ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.deploy
  set +a
fi

if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo "[deploy-prod] VERCEL_TOKEN 이 설정되지 않았습니다. .env.deploy 에 VERCEL_TOKEN=... 을 추가하세요." >&2
  exit 1
fi

exec npx vercel deploy --prod --yes --token "$VERCEL_TOKEN" "$@"
