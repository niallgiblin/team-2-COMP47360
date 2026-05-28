#!/usr/bin/env bash
# Production-like Docker Compose smoke checks (TEST-05).
# Completed in plan 10-05 — do not echo .env secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! docker info >/dev/null 2>&1; then
  echo "compose-smoke: Docker daemon not available" >&2
  exit 1
fi

# Outline for plan 10-05 (no secrets echoed):
# docker compose --profile prod up -d --build
# wait for healthchecks (spring, llm-service, busyness-service, frontend-prod, nginx)
# curl Spring Actuator /actuator/health
# curl llm-service /health and busyness-service /health
# curl prod frontend Nginx root (no Vite dev headers)
# curl proxied API path via Nginx (e.g. /api/vibe/trending)

echo "compose-smoke: not implemented — complete plan 10-05" >&2
exit 1
