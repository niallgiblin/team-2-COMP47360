---
phase: 09-persistence-import-and-auth-flow-safety
plan: 04
subsystem: database
tags: [jpa, location, csv, ml-mapper, data-integrity]

# Dependency graph
requires:
  - phase: 09-persistence-import-and-auth-flow-safety/09-01
    provides: LocationFieldPreservationTest locking setter behavior (D-13)
  - phase: 09-persistence-import-and-auth-flow-safety/09-03
    provides: LocationCsvImporter no-arg + setter construction
provides:
  - D-11 broken parameterized Location constructor removed
  - DATA-03 fully addressed via setter-only construction enforcement
affects:
  - future Location entity changes must use no-arg + setters only

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Location entity: no-arg constructor + setters only — no multi-arg ctors"
    - "MlResponseMapper and LocationCsvImporter canonical construction paths verified"

key-files:
  created: []
  modified:
    - BackEnd/src/main/java/com/manhattan/busyness_predictor/model/Location.java

key-decisions:
  - "Removed parameterized ctor without replacement — zero prod call sites confirmed"
  - "MlResponseMapper and ML DTOs unchanged per D-12"

patterns-established:
  - "Entity construction for Location must use new Location() + setters; buggy ctor eliminated"

requirements-completed: [DATA-03]

# Metrics
duration: 3min
completed: 2026-05-28
---

# Phase 09 Plan 04: Remove Broken Location Constructor Summary

**Parameterized Location constructor removed; setter-only construction enforced with preservation and CSV importer tests green**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-28T13:21:00Z
- **Completed:** 2026-05-28T13:22:38Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Deleted broken `Location(lat, lng, ...)` constructor that assigned `information`/`summary`/`tags` from undefined parameters (always null)
- Confirmed zero multi-arg `new Location(` call sites in production sources
- Verified `MlResponseMapper` and `LocationCsvImporter` use `new Location()` + setters
- All 9 preservation and CSV importer tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove broken parameterized Location constructor (D-11)** - `1c4ee358` (fix)
2. **Task 2: Verify preservation tests and setter construction paths (D-12, D-13)** - `87385ea1` (test)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified

- `BackEnd/src/main/java/com/manhattan/busyness_predictor/model/Location.java` - Removed 21-line parameterized constructor; no-arg ctor and all getters/setters retained

## Decisions Made

- No replacement constructor added — setter-based paths are the sole construction pattern
- MlResponseMapper left unchanged per D-12 (verification only)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Task 1 commit inadvertently included pre-staged `.planning/` metadata files (REQUIREMENTS.md, ROADMAP.md, STATE.md) from prior session; Location.java change is correct and isolated in diff.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- DATA-03 complete; Location field mapping cannot silently null via parameterized ctor
- Phase 09 plan 04 complete; all phase 09 plans now have SUMMARY coverage

## Self-Check: PASSED

- Location.java exists with no-arg constructor
- 09-04-SUMMARY.md created
- Commits 1c4ee358 and 87385ea1 verified in git log

---
*Phase: 09-persistence-import-and-auth-flow-safety*
*Completed: 2026-05-28*
