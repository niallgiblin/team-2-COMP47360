---
phase: 08-map-forecast-routing-and-external-api-correctness
plan: 05
subsystem: api
tags: [spring-boot, dto, zoneId, google-maps, security, junit]

requires:
  - phase: 08-01
    provides: Map contract tests and frontend zone enrichment patterns
provides:
  - Audit-gated LocationDto zoneId field (null for human-readable zones)
  - LocationDtoTest with manhattanZones.geojson LocationID audit evidence
  - VibeControllerTest map-data zone/zoneId JSON assertions
  - SEC-08 Google API key restriction runbook in docs/SECURITY.md
affects:
  - 08-04
  - frontend polygon fallback (MAP-04)

tech-stack:
  added: []
  patterns:
    - "Audit-gated DTO fields: zoneId only when repository data proves canonical mapping"
    - "Browser Google keys documented as public-but-restricted with manual Cloud Console verification"

key-files:
  created:
    - BackEnd/src/test/java/com/manhattan/busyness_predictor/dto/LocationDtoTest.java
  modified:
    - BackEnd/src/main/java/com/manhattan/busyness_predictor/dto/LocationDto.java
    - BackEnd/src/test/java/com/manhattan/busyness_predictor/controller/VibeControllerTest.java
    - docs/SECURITY.md

key-decisions:
  - "Repository Location.zone stores human-readable Manhattan zone names, not GeoJSON LocationID numeric strings — backend zoneId stays null"
  - "Frontend Turf polygon fallback remains required MAP-04 path; no backend GeoJSON parsing in Phase 8"
  - "SEC-08 satisfied via documented HTTP referrer and API restrictions, not backend route proxy"

patterns-established:
  - "LocationDto.deriveZoneId() returns null until repository data uses canonical LocationID strings"
  - "Google VITE_GOOGLE_API_KEY treated as browser-visible with operator-run restriction checklist"

requirements-completed: [SEC-08, MAP-04, MAP-05]

duration: 12min
completed: 2026-05-27
---

# Phase 08 Plan 05: ZoneId Audit and Google Key Restrictions Summary

**Audit-proven null backend zoneId for human-readable zones plus SEC-08 Google key restriction runbook**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-27T19:13:00Z
- **Completed:** 2026-05-27T19:25:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Audited representative `Location.zone` CSV values against `manhattanZones.geojson` — all 63 unique zones are human-readable names matching GeoJSON `properties.zone`, not numeric `LocationID` values
- Added `zoneId` field to `LocationDto` with `deriveZoneId()` returning null; `zone` preserved unchanged
- Extended `VibeControllerTest` map-data assertions for `zone` presence and absent/null `zoneId`
- Expanded `docs/SECURITY.md` with HTTP referrer restrictions, API restrictions (Routes API, conditional Maps JavaScript API), manual verification, and backend proxy escalation criteria

## Task Commits

1. **Task 1: Audit zone values and add LocationDto tests** - `ba34705d` (test)
2. **Task 2: Implement audit-gated LocationDto zoneId** - `c7c18b9c` (feat)
3. **Task 3: Document SEC-08 Google API key restrictions** - `e3e62b33` (docs)

## Files Created/Modified

- `BackEnd/src/test/java/com/manhattan/busyness_predictor/dto/LocationDtoTest.java` - GeoJSON audit fixture and zoneId null assertions
- `BackEnd/src/main/java/com/manhattan/busyness_predictor/dto/LocationDto.java` - zoneId field with audit-gated deriveZoneId
- `BackEnd/src/test/java/com/manhattan/busyness_predictor/controller/VibeControllerTest.java` - map-data zone/zoneId JSON checks
- `docs/SECURITY.md` - SEC-08 browser key restriction runbook

## Decisions Made

- Repository audit found zero numeric-only `Location.zone` values matching GeoJSON `LocationID`; backend `zoneId` remains null for all current records
- No backend GeoJSON parsing added — name-to-ID mapping would require out-of-scope GeoJSON lookup
- SEC-08 met through operator documentation; backend route proxy deferred per plan threat model T-08-21

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed audit fixture zone name**
- **Found during:** Task 2 (test execution)
- **Issue:** Representative zone `Greenwich Village` does not exist in GeoJSON; CSV uses `Greenwich Village North`/`South`
- **Fix:** Updated audit fixture to `Greenwich Village North`
- **Files modified:** `BackEnd/src/test/java/com/manhattan/busyness_predictor/dto/LocationDtoTest.java`
- **Verification:** `./mvnw test -Dtest=LocationDtoTest,VibeControllerTest,VibeServiceTest` passes
- **Committed in:** `c7c18b9c`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor fixture correction; audit conclusion unchanged.

## Issues Encountered

None beyond the Greenwich Village fixture name mismatch.

## User Setup Required

Google Cloud Console configuration is **documentation only** for this plan — operators must manually apply HTTP referrer and API restrictions per `docs/SECURITY.md`. No live Console changes are required in the repository.

## Next Phase Readiness

- Plan 08-04 frontend polygon fallback remains the required MAP-04 path for zone enrichment
- Backend exposes `zoneId` field for future canonical data; clients should prefer backend `zoneId` when non-null

## Self-Check: PASSED

- FOUND: BackEnd/src/test/java/com/manhattan/busyness_predictor/dto/LocationDtoTest.java
- FOUND: BackEnd/src/main/java/com/manhattan/busyness_predictor/dto/LocationDto.java
- FOUND: docs/SECURITY.md
- FOUND: ba34705d
- FOUND: c7c18b9c
- FOUND: e3e62b33

---
*Phase: 08-map-forecast-routing-and-external-api-correctness*
*Completed: 2026-05-27*
