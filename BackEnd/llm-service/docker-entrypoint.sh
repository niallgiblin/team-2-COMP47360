#!/bin/bash
# ── Phase 19 Docker entrypoint ──────────────────────────────────
# Clears and recreates PROMETHEUS_MULTIPROC_DIR before Gunicorn
# imports the app, preventing stale multiprocess metric files from
# corrupting counters across container runs.

set -euo pipefail

METRICS_DIR="${PROMETHEUS_MULTIPROC_DIR:-/tmp/prometheus}"

if [ -d "$METRICS_DIR" ]; then
    rm -rf "$METRICS_DIR"
fi
mkdir -p "$METRICS_DIR"

exec "$@"
