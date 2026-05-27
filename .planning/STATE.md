---
gsd_state_version: 1.0
milestone: v0.1
milestone_name: Address Codebase Concerns
status: executing
stopped_at: Completed 08-03-PLAN.md
last_updated: "2026-05-27T20:14:00.000Z"
last_activity: 2026-05-27
progress:
  total_phases: 10
  completed_phases: 6
  total_plans: 40
  completed_plans: 32
  percent: 80
---

# GSD State

## Current Position

Phase: 08 (map-forecast-routing-and-external-api-correctness) — EXECUTING
Plan: 4 of 5
Status: Ready to execute
Last activity: 2026-05-27

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-25)

**Core value:** Users can reliably discover, compare, route to, and plan venue visits using trustworthy busyness and location intelligence.
**Current focus:** Phase 08 — map-forecast-routing-and-external-api-correctness

## Milestone Summary

Milestone v0.1 converts the 2026-05-25 concern audit into executable requirements and phases. Research was skipped because the milestone remediates existing audited risks rather than introducing new product features.

## Pending Decisions

- Decide whether map-data scaling should use pagination, viewport bounds, tiles, or staged filtering during Phase 10.

## Decisions

- Git LFS remains current runtime delivery; release/object storage documented as future migration only (plan 01-02).
- SHA-256 checksums cover 70 runtime binaries; metadata and CSV excluded from mandatory checksums (plan 01-02).
- Manual `scripts/verify-artifacts.sh` only; no startup checksum enforcement in Phase 1 (plan 01-02).
- Required Phase 1 gate limited to metadata checks; application failures stay in known-gap tier (plan 01-03).
- SUMMARY.md must record requirement IDs, commands run, known gaps, and changed files (plan 01-03).
- Phase 3 plan structure: Wave 1 parallel (01, 03, 04); Wave 2 sequential (02 after 01, 05 after 01+04).
- ML URLs default to localhost:5001/5002 via LLM_SERVICE_URL/BUSYNESS_SERVICE_URL placeholders (plan 03-01, D-16).
- Avatar dir defaults to ./avatars via APP_AVATARS_DIR; static-locations interpolates app.avatars.dir (plan 03-01, D-15).
- VibeService @Value fallbacks removed; application.properties owns URL defaults (plan 03-01).
- Busyness MODEL_PATH/LSTM_MODEL_PATH defaults anchor to predictor module via _BUSYNESS_SERVICE_DIR (plan 03-04, D-05/D-10).
- verify_file_paths missing list uses var names only — no filesystem paths in /health (plan 03-04, D-08).
- LLM Python defaults use _LLM_SERVICE_DIR; Compose llm-service env block unchanged (plan 03-04, D-12).
- StartupConfigValidator ApplicationRunner at LOWEST_PRECEDENCE fail-fast on blank JWT/datasource env vars (plan 03-03, D-13).
- Empty-default @Value syntax (${prop:}) passes blank strings to validator; logs canonical names only (plan 03-03, D-14).
- AuthController and AvatarController inject app.avatars.dir via @Value; no /app/avatars/ literals (plan 03-02, D-15).
- Two-arg File(parent, child) for avatar paths handles trailing-slash variants (plan 03-02).
- [Phase 03]: Secret rotation runbook consolidated in docs/SECURITY.md (plan 03-05, D-04)
- [Phase 03]: Compose sets explicit busyness model paths; llm-service block unchanged (plan 03-05, Pitfall 3)
- [Phase 05]: Implement Flask POST /similar; similar fallback exposes `source` ml|category (05-CONTEXT D-01–D-04)
- [Phase 05]: Chat canonical field `previous_questions`; full widget thread with server-side truncation (D-05–D-08)
- [Phase 05]: PyJWT must be declared in requirements.in because Docker regenerates llm-service requirements.txt during image build.
- [Phase 07]: FAISS IndexFlatIP over normalized float32 vectors with explicit row-id map and stable tie-breaking for cosine parity (plan 07-02).
- [Phase 07]: Loader/search startup errors and missing-file lists use env var names only — no resolved paths (plan 07-02).
- [Phase 07]: faiss-cpu pinned in requirements.in; host pip-compile blocked on Python 3.13 vs torch==2.2.2 — Docker pip-tools flow regenerates requirements.txt (plan 07-02).
- [Phase 07]: VibeService search cache uses direct Caffeine Cache with executor(Runnable::run) for synchronous max-size enforcement (plan 07-04, PERF-06).
- [Phase 07]: app.vibe.search-cache defaults 300s TTL and 512 max entries via APP_VIBE_SEARCH_CACHE_* env placeholders (plan 07-04, D-06/D-07/D-18).
- [Phase 07]: Python search cache defaults SEARCH_CACHE_TTL_SECONDS=300 and SEARCH_CACHE_MAX_ENTRIES=512 via config.py (plan 07-03).
- [Phase 07]: Flask app.py delegates search/chat/cache to extracted modules; JWT stays route-owned (plan 07-03).
- [Phase 07]: Python 3.11 adopted for llm-service Docker; build and smoke pass (plan 07-05, D-13/D-14).
- [Phase 07]: Gunicorn command duplicated in Dockerfile and Compose: workers 2, preload, timeout 120 (plan 07-05, D-15/D-16).
- [Phase 07]: FAISS index built at startup; generated vector artifacts not committed (plan 07-05, D-20).
- [Phase 08]: Wave 0 red tests lock map/forecast/route contracts before MapView extraction (plan 08-01).
- [Phase 08]: MapView integration tests import pages/MapView and assert UI-SPEC route copy (plan 08-01).
- [Phase 08]: Vitest config uses @vitejs/plugin-react for page component JSX tests (plan 08-01).
- [Phase 08]: Default forecast fallback returns exactly 12 hourly America/New_York ISO strings starting next hour (plan 08-02).
- [Phase 08]: Backend zoneId is string-normalized and skips Turf polygon lookup when present (plan 08-02).
- [Phase 08]: Route cache keys round coordinates to four decimals for stable 08-01 test parity (plan 08-03).
- [Phase 08]: Google Routes field mask uses explicit leg/step/transit/polyline fields without wildcard (plan 08-03).

## Blockers

(None recorded.)

## Session Continuity

Last session: 2026-05-27T20:14:00.000Z
Stopped at: Completed 08-03-PLAN.md
Resume file: None

## Notes

- Phase 3 plans 01–05 cover DEP-04, DEP-05, SEC-01, SEC-02.
- Uncommitted planning artifacts: 03-01–05 PLAN, 03-PATTERNS, 03-VALIDATION (plus unrelated `.vscode/settings.json`, `BackEnd/llm-service/requirements.in`).
