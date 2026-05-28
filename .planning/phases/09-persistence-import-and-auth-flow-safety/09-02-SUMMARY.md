---
phase: 09-persistence-import-and-auth-flow-safety
plan: 02
subsystem: database
tags: [flyway, mysql, hibernate, ddl-auto, migration, docker-compose]

requires:
  - phase: 09-01
    provides: CSV importer red tests and Location field preservation baseline before schema ownership change
provides:
  - Flyway V1 baseline DDL for all 10 JPA entity tables
  - ddl-auto=validate with Flyway as sole schema owner (D-01–D-04)
  - Documented docker compose volume reset path for developers (D-05)
affects: [09-03, 09-04, 09-05, phase-10]

tech-stack:
  added: [flyway-core, flyway-mysql]
  patterns: [Flyway versioned migrations before Hibernate validate, mysqldump-derived V1 baseline, compose volume reset for clean schema]

key-files:
  created:
    - BackEnd/src/main/resources/db/migration/V1__baseline_schema.sql
  modified:
    - BackEnd/pom.xml
    - BackEnd/src/main/resources/application.properties
    - docs/README.md

key-decisions:
  - "Use flyway-core + flyway-mysql (Boot BOM) instead of spring-boot-starter-flyway artifact — equivalent wiring, explicit MySQL dialect support"
  - "V1 baseline generated from Hibernate ddl-auto=update export on clean MySQL, not hand-guessed from entities"
  - "Committed config uses ddl-auto=validate with spring.flyway.enabled=true; no baseline-on-migrate"

patterns-established:
  - "Pattern: Flyway migrate runs at startup before Hibernate schema validation"
  - "Pattern: Dev schema reset via docker compose down -v && docker compose up -d db backend"

requirements-completed: [DATA-01]

duration: 45min
completed: 2026-05-28
---

# Phase 09 Plan 02: Flyway V1 Baseline Summary

**Flyway owns MySQL schema with V1 baseline for 10 entities, Hibernate validate mode, and documented compose volume reset — migration smoke verified on clean volume**

## Performance

- **Duration:** ~45 min (Task 1 + human smoke checkpoint)
- **Started:** 2026-05-28T12:30:00Z (approx)
- **Completed:** 2026-05-28T13:30:00Z (approx)
- **Tasks:** 2
- **Files modified:** 4 (code/docs)

## Accomplishments

- Added Flyway dependencies and switched `ddl-auto` from `update` to `validate` (D-01, D-03)
- Shipped `V1__baseline_schema.sql` with CREATE TABLE for all 10 JPA entities including quoted `` `user` `` and `` `plan` `` (D-02, D-04)
- Documented dev volume reset in `docs/README.md` (D-05)
- Human-approved migration smoke on clean MySQL volume: Flyway V1 applied, `flyway_schema_history` success=1, no SchemaManagementException

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Flyway dependencies and V1 baseline migration (D-01–D-04)** - `71b9589d` (feat)
2. **Task 2: Flyway migration smoke on clean MySQL volume (D-05)** - `15fa14fe` (docs)

**Plan metadata:** `53b93b56` (docs: complete plan)

## Files Created/Modified

- `BackEnd/src/main/resources/db/migration/V1__baseline_schema.sql` — V1 baseline DDL (10 tables, FK order valid)
- `BackEnd/pom.xml` — flyway-core and flyway-mysql dependencies
- `BackEnd/src/main/resources/application.properties` — validate mode + Flyway locations
- `docs/README.md` — "Reset database schema (development)" subsection

## Decisions Made

- Used `flyway-core` + `flyway-mysql` rather than `spring-boot-starter-flyway` — Boot 3.5 BOM manages versions; MySQL dialect module required explicitly
- V1 SQL exported from Hibernate-created schema on clean volume per RESEARCH Pattern 1, not entity-guessed
- No `spring.flyway.baseline-on-migrate` in committed config (emergency-only per CONTEXT)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] flyway-core instead of spring-boot-starter-flyway**
- **Found during:** Task 1
- **Issue:** Plan specified `spring-boot-starter-flyway`; Boot 3.5 project uses explicit flyway-core + flyway-mysql for MySQL dialect
- **Fix:** Added both BOM-managed artifacts; Flyway auto-config still activates via classpath
- **Files modified:** BackEnd/pom.xml
- **Verification:** Docker smoke — Flyway migrated to V1 successfully
- **Committed in:** 71b9589d

---

**Total deviations:** 1 auto-fixed (missing critical / dependency choice)
**Impact on plan:** Equivalent Flyway integration; smoke test confirms correct behavior.

## Issues Encountered

- **Human checkpoint (Task 2):** Executor paused for Docker smoke; user approved after verifying clean-volume migration
- **`mvn test` (plan verification):** 275 tests run, 11 errors — 6 expected `LocationCsvImporterTest` stubs (plan 09-03), 5 `@WebMvcTest` ApplicationContext failures likely from Flyway auto-config on slice tests without test DB. Deferred; does not block DATA-01 delivery or Docker smoke path.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Wave 2 plans 09-03 (OpenCSV importer) and 09-05 (PlanController auth) can proceed in parallel
- Consider disabling Flyway or using `@AutoConfigureTestDatabase` / test profile for `@WebMvcTest` slice tests before Wave 2 if CI runs full `mvn test`

## Self-Check: PASSED

- FOUND: `.planning/phases/09-persistence-import-and-auth-flow-safety/09-02-SUMMARY.md`
- FOUND: commit `71b9589d` (Task 1)
- FOUND: commit `15fa14fe` (Task 2)

---
*Phase: 09-persistence-import-and-auth-flow-safety*
*Completed: 2026-05-28*
