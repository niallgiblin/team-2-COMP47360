---
phase: 06-busyness-service-reliability-and-model-safety
plan: 01
subsystem: testing
tags: [pytest, flask, busyness, model-safety]
requires:
  - phase: 05-api-contract-alignment-and-llm-smoke-tests
    provides: Python service smoke-test patterns
provides:
  - Artifact-free busyness pytest harness
  - Route and predictor smoke coverage
affects: [busyness-service, phase-06]
tech-stack:
  added: [pytest]
  patterns: [fake TensorFlow import harness, artifact-marked integration tier]
key-files:
  created: [BackEnd/busyness-service/tests/conftest.py, BackEnd/busyness-service/tests/test_routes.py, BackEnd/busyness-service/tests/test_predictor.py]
  modified: [BackEnd/busyness-service/tests/test_cors.py, BackEnd/busyness-service/requirements.in, BackEnd/busyness-service/requirements.txt]
key-decisions:
  - "Default busyness tests stub TensorFlow, pandas, NumPy, requests, and holidays so they do not require Git LFS artifacts or live network access."
patterns-established:
  - "Busyness tests import the Flask app fresh after clearing app and predictor modules."
requirements-completed: [SEC-05, ML-02, ML-03, ML-06, PERF-01, PERF-02]
duration: 12 min
completed: 2026-05-26
---

# Phase 06 Plan 01: Busyness Pytest Harness Summary

**Artifact-free pytest harness covering busyness startup, health, routes, checksum expectations, cache policy, weather fallback, and normalization**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-26T20:59:33Z
- **Completed:** 2026-05-26T21:11:46Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added reusable busyness Flask import helpers with fake model and fake TensorFlow support.
- Added route smoke tests for `/health`, `/busyness`, cache hits, safe uninitialized errors, and response shape.
- Added predictor tests for checksums, unsafe loading policy, weather fallbacks, normalization, cache keys, cache eviction, and optional artifacts.

## Task Commits

Inline execution was committed as one implementation commit:

1. **Task 1-3: Harness, route tests, predictor tests** - `b95894e0` (`feat(06): harden busyness service reliability`)

## Files Created/Modified

- `BackEnd/busyness-service/tests/conftest.py` - Shared fake import harness and model artifact fixtures.
- `BackEnd/busyness-service/tests/test_routes.py` - Route and cache smoke tests.
- `BackEnd/busyness-service/tests/test_predictor.py` - Predictor, checksum, weather, cache, and artifact tests.
- `BackEnd/busyness-service/pytest.ini` - Artifact marker registration.
- `BackEnd/busyness-service/requirements.in` - Adds pytest.
- `BackEnd/busyness-service/requirements.txt` - Records pytest dependency set.

## Decisions Made

Default tests use fake modules to avoid real TensorFlow model files and Open-Meteo calls. Optional real-artifact coverage is isolated behind `pytest.mark.artifact`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The service test virtualenv did not contain runtime ML dependencies such as NumPy, requests, holidays, or pytz. The harness stubs those imports for default tests, which preserves the plan requirement that default pytest is artifact-free.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for checksum-gated model loading and split cache implementation.

---
*Phase: 06-busyness-service-reliability-and-model-safety*
*Completed: 2026-05-26*
