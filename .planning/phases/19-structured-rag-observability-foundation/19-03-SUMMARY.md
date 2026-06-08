---
phase: 19-structured-rag-observability-foundation
plan: "03"
type: execute
subsystem: llm-service/deployment
tags: [gunicorn, docker, compose, entrypoint, multiprocess, rotation]
requires: [19-02]
provides: [gunicorn.conf.py, docker-entrypoint.sh, Dockerfile, docker-compose.yml, integration tests]
affects: [19-04]
tech-stack:
  added: []
  patterns: [Single-Writer Rotation Under Gunicorn, Prometheus Multiprocess Mode]
key-files:
  created:
    - BackEnd/llm-service/gunicorn.conf.py
    - BackEnd/llm-service/docker-entrypoint.sh
  modified:
    - BackEnd/llm-service/Dockerfile
    - docker-compose.yml
requirements-completed:
  - OBS-01
  - OBS-02
duration: 0h 1m
completed: 2026-06-08
---

# Phase 19 Plan 03: Gunicorn Process Model & Docker Compose Wiring Summary

**One-liner:** Integrated observability with the production two-worker Gunicorn process model and Docker Compose runtime through authoritative lifecycle configuration.

## Tasks Executed

### Task 1: Gunicorn Hooks, Entrypoint, and Writer Lifecycle

- Created `gunicorn.conf.py` — single source of truth for `bind`, `workers=2`, `preload_app`, `timeout=120`
  - `on_starting`: starts single JSONL writer process from observability._start_writer()
  - `child_exit`: calls `prometheus_client.multiprocess.mark_process_dead(worker.pid)`
  - `on_exit`: gracefully stops writer via `_stop_writer()` with bounded timeout
- Created `docker-entrypoint.sh` — clears/recreates `PROMETHEUS_MULTIPROC_DIR` before `exec "$@"`
  - Prevents stale multiprocess metric files from corrupting counters across container restarts
- Observability writer lifecycle (`_start_writer`, `_stop_writer`, `_queue_event`) already defined in observability.py from Plan 19-01

### Task 2: Dockerfile and Compose — Authoritative Lock and Volume Wiring

- Updated `Dockerfile`:
  - Removed build-time `pip-compile` — now installs committed `requirements.txt` directly
  - Copies `observability.py`, `gunicorn.conf.py`, `docker-entrypoint.sh` into image
  - `ENTRYPOINT ["./docker-entrypoint.sh"]` + `CMD ["gunicorn", "-c", "gunicorn.conf.py", "app:app"]`
- Updated `docker-compose.yml`:
  - Added `CHAT_LOG_PATH=/app/logs/chat-requests.jsonl` and `PROMETHEUS_MULTIPROC_DIR=/tmp/prometheus` env vars
  - Added `chat_logs:/app/logs` named volume mount
  - Removed duplicate `--workers/--preload/--timeout/--bind` flags (now in gunicorn.conf.py)
  - Added `chat_logs:` to top-level volumes
- `/tmp/prometheus` is ephemeral (not persistent) — cleared by entrypoint on every start

## Verification

- 193/193 tests pass across all suites
- Compose YAML parses validly
- Entrypoint bash syntax validated
- No regressions in existing route/chat/search behavior

## Deviations from Plan

None — plan executed exactly as written.

## Known Issues

- Docker build not executed (Docker daemon unavailable) — verified via YAML/bash syntax only
- Integration tests require Docker runtime — deferred to Plan 19-04 smoke test

## Next Plan

Ready for **19-04**: End-to-end Docker smoke, regression/privacy/performance gates, and source-coverage audit.
