---
phase: 06-busyness-service-reliability-and-model-safety
plan: 02
subsystem: ml-security
tags: [keras, sha256, model-loading, trusted-artifacts]
requires:
  - phase: 06-busyness-service-reliability-and-model-safety
    provides: Plan 01 red tests and harness
provides:
  - Checksum-gated busyness startup
  - Trusted legacy Keras fallback after verification
affects: [busyness-service, artifacts, docker-compose]
tech-stack:
  added: []
  patterns: [sha256 manifest verification, sanitized startup errors]
key-files:
  created: [BackEnd/busyness-service/models/checksums.sha256]
  modified: [BackEnd/busyness-service/predictor/busyness.py, env.example, docs/artifacts.md]
key-decisions:
  - "Keras unsafe deserialization is no longer enabled unconditionally."
  - "Any trusted legacy loading path is gated by successful checksum verification."
patterns-established:
  - "verify_file_paths owns both path existence and checksum trust checks before model loading."
requirements-completed: [SEC-05, ML-06]
duration: 12 min
completed: 2026-05-26
---

# Phase 06 Plan 02: Model Safety Summary

**SHA-256 manifest verification now blocks busyness model startup before Keras deserializes untrusted artifacts**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-26T20:59:33Z
- **Completed:** 2026-05-26T21:11:46Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added `MODEL_CHECKSUMS_PATH` and `verify_model_checksums()` with sha256sum-style parsing.
- Startup now rejects missing manifests, malformed entries, missing files, missing entries, traversal entries, and digest mismatches.
- Removed unconditional unsafe Keras deserialization; trusted legacy fallback can only run after checksums pass.
- Added a committed checksum manifest for current busyness DNN and LSTM artifacts.

## Task Commits

Inline execution was committed as one implementation commit:

1. **Task 1-3: Checksum verification, unsafe-loading policy, docs** - `b95894e0` (`feat(06): harden busyness service reliability`)

## Files Created/Modified

- `BackEnd/busyness-service/predictor/busyness.py` - Checksum verifier and gated loading policy.
- `BackEnd/busyness-service/models/checksums.sha256` - Required model artifact digest manifest.
- `env.example` - Local checksum path examples.
- `docs/artifacts.md` - Checksum refresh and trusted artifact guidance.

## Decisions Made

Checksum errors return sanitized relative artifact labels or environment labels, not resolved filesystem paths.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for split live/forecast cache behavior and final integration validation.

---
*Phase: 06-busyness-service-reliability-and-model-safety*
*Completed: 2026-05-26*
