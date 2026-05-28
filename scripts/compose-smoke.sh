#!/usr/bin/env bash
# Production-like Docker Compose smoke checks (TEST-05, D-11–D-13).
#
# Brings up the prod profile stack, waits for health, then verifies actuator,
# ML service health (via docker exec — ports 5001/5002 are not published),
# static Nginx frontend, and proxied public API.
#
# Usage:
#   bash scripts/compose-smoke.sh           # leave stack running
#   bash scripts/compose-smoke.sh --teardown  # docker compose down after checks
#
# Prerequisites: Docker daemon, populated .env (APP_JWT_SECRET, MYSQL_*,
# HF_TOKEN, VITE_GOOGLE_API_KEY, etc.). Never cat or echo .env values.
#
# Project docs may use `rtk bash scripts/compose-smoke.sh`; this script uses
# plain docker/curl for portability outside RTK wrappers.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TEARDOWN=false
for arg in "$@"; do
  case "$arg" in
    --teardown) TEARDOWN=true ;;
    -h|--help)
      echo "Usage: bash scripts/compose-smoke.sh [--teardown]" >&2
      exit 0
      ;;
    *)
      echo "compose-smoke: unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

COMPOSE=(docker compose --profile prod)

if ! docker info >/dev/null 2>&1; then
  echo "compose-smoke: Docker daemon required — start Docker and retry" >&2
  exit 1
fi

run_check() {
  local label="$1"
  shift
  echo "compose-smoke: check — $label"
  if ! "$@"; then
    echo "compose-smoke: FAILED — $label" >&2
    exit 1
  fi
}

service_health() {
  local svc="$1"
  "${COMPOSE[@]}" ps "$svc" --format '{{.Health}}' 2>/dev/null | head -1
}

wait_for_healthy() {
  echo "compose-smoke: waiting for services (max 300s)..."
  local start=$SECONDS
  while (( SECONDS - start < 300 )); do
    local ready=true
    for svc in backend db llm-service busyness-service; do
      local health
      health="$(service_health "$svc")"
      if [[ "$health" != "healthy" ]]; then
        ready=false
        break
      fi
    done
    if [[ "$ready" == "true" ]] \
      && curl -sf http://localhost:8080/actuator/health >/dev/null 2>&1 \
      && curl -sfI http://localhost:80 >/dev/null 2>&1; then
      echo "compose-smoke: services ready"
      return 0
    fi
    sleep 5
  done
  echo "compose-smoke: FAILED — timed out waiting for healthy stack" >&2
  "${COMPOSE[@]}" ps >&2 || true
  exit 1
}

check_backend_actuator() {
  curl -sf http://localhost:8080/actuator/health >/dev/null
}

check_llm_health() {
  "${COMPOSE[@]}" exec -T llm-service curl -sf http://localhost:5000/health >/dev/null
}

check_busyness_health() {
  "${COMPOSE[@]}" exec -T busyness-service curl -sf http://localhost:5000/health >/dev/null
}

check_prod_frontend_static() {
  local headers
  headers="$(curl -sfI http://localhost:80)"
  echo "$headers" | grep -qi '^HTTP/.* 200' || return 1
  if echo "$headers" | grep -qi 'x-powered-by:.*express'; then
    echo "compose-smoke: dev Express signature detected on :80" >&2
    return 1
  fi
  if echo "$headers" | grep -qi 'vite'; then
    echo "compose-smoke: Vite dev signature detected on :80" >&2
    return 1
  fi
  return 0
}

check_proxied_locations_api() {
  curl -sf http://localhost:80/api/locations >/dev/null
}

cleanup() {
  if [[ "$TEARDOWN" == "true" ]]; then
    echo "compose-smoke: tearing down prod stack"
    "${COMPOSE[@]}" down
  fi
}

trap cleanup EXIT

echo "compose-smoke: starting prod profile stack"
"${COMPOSE[@]}" up -d --build

wait_for_healthy

run_check "Spring Actuator /actuator/health" check_backend_actuator
run_check "LLM service /health (docker exec)" check_llm_health
run_check "Busyness service /health (docker exec)" check_busyness_health
run_check "Prod Nginx static frontend (no Vite/Express dev headers)" check_prod_frontend_static
run_check "Proxied GET /api/locations via Nginx" check_proxied_locations_api

echo "compose-smoke: all checks passed"
