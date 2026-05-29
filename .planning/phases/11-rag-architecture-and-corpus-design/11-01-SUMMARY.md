---
phase: 11-rag-architecture-and-corpus-design
plan: 01
subsystem: testing
tags: [rag, corpus, pytest, sha256, venue_corpus]

requires: []
provides:
  - venue_corpus Python package with document/manifest/validate modules
  - 2-row corpus_v1 test fixture with matching manifest SHA-256
  - Wave 0 pytest modules locking RAG-01 contracts
  - Loader MANIFEST_PATH contract tests (xfail until Plan 03)
affects: [11-02, 11-03, phase-12-embedding-pipeline]

tech-stack:
  added: []
  patterns:
    - "venue_corpus package distinct from corpus/v1/ data directory"
    - "Labeled-line document composition with NaN/blank skip"
    - "Manifest SHA-256 via 1 MiB chunked hashlib reads"
    - "resolve_corpus_root rejects .. path traversal"

key-files:
  created:
    - BackEnd/llm-service/venue_corpus/__init__.py
    - BackEnd/llm-service/venue_corpus/document.py
    - BackEnd/llm-service/venue_corpus/manifest.py
    - BackEnd/llm-service/venue_corpus/validate.py
    - BackEnd/llm-service/tests/fixtures/corpus_v1/venues.csv
    - BackEnd/llm-service/tests/fixtures/corpus_v1/manifest.json
    - BackEnd/llm-service/tests/fixtures/corpus_v1/SCHEMA.md
    - BackEnd/llm-service/tests/test_corpus_manifest.py
    - BackEnd/llm-service/tests/test_corpus_document.py
    - BackEnd/llm-service/tests/test_corpus_validate.py
  modified:
    - BackEnd/llm-service/tests/test_loader.py

key-decisions:
  - "Python package named venue_corpus to avoid import collision with corpus/v1/ data dir"
  - "Loader MANIFEST_PATH and corpus DATA_PATH tests xfail until Plan 03 wiring"

patterns-established:
  - "EMBED_FIELDS ordered tuples drive labeled-line compose_document_text"
  - "verify_manifest_checksum returns (bool, list[str]) matching busyness pattern"
  - "Wave 0 tests use tests/fixtures/corpus_v1/ not production corpus/v1/"

requirements-completed: [RAG-01]

duration: 8min
completed: 2026-05-29
---

# Phase 11 Plan 01: Wave 0 Corpus Scaffolding Summary

**venue_corpus package with labeled-line document composition, manifest checksum helpers, and 12 green fixture-backed pytest modules locking RAG-01 contracts**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-29T13:05:00Z
- **Completed:** 2026-05-29T13:13:00Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Created `venue_corpus` package with `compose_document_text`, manifest SHA-256 helpers, and corpus schema validation
- Shipped 2-row `corpus_v1` fixture with matching manifest checksum and SCHEMA.md stub
- Added 12 passing corpus unit tests plus 2 xfail loader contract tests for Plan 03

## Task Commits

1. **Task 1: venue_corpus package skeleton and public API** - `1013bccc` (feat)
2. **Task 2: Fixture corpus and red pytest modules** - `d8110799` (feat)
3. **Task 3: Extend test_loader for MANIFEST_PATH contract** - `d0a60a2c` (test)

## Files Created/Modified

- `BackEnd/llm-service/venue_corpus/document.py` - EMBED_FIELDS and labeled-line compose_document_text
- `BackEnd/llm-service/venue_corpus/manifest.py` - load_manifest, sha256_file, verify_manifest_checksum
- `BackEnd/llm-service/venue_corpus/validate.py` - REQUIRED_VENUE_COLUMNS, resolve_corpus_root, validate_corpus_dir
- `BackEnd/llm-service/tests/fixtures/corpus_v1/` - 2-row venues.csv, manifest.json, SCHEMA.md
- `BackEnd/llm-service/tests/test_corpus_*.py` - manifest, document, and schema validation tests
- `BackEnd/llm-service/tests/test_loader.py` - MANIFEST_PATH and corpus DATA_PATH contract tests (xfail)

## Decisions Made

- Used `venue_corpus` package name per D-01/RESEARCH A1 to avoid `import corpus` collision with data directory
- Loader tests marked xfail with `unblocks in 11-03` since loader.py and config.py unchanged this plan

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Verification

```bash
cd BackEnd/llm-service && python3 -c "from venue_corpus import compose_document_text, load_manifest, validate_corpus_dir; print('ok')"
cd BackEnd/llm-service && python3 -m pytest tests/test_corpus_manifest.py tests/test_corpus_document.py tests/test_corpus_validate.py -x -q
cd BackEnd/llm-service && python3 -m pytest tests/test_loader.py -x -q -k "manifest or default_data"
cd BackEnd/llm-service && python3 -m pytest tests/test_corpus_*.py tests/test_loader.py -k "manifest or default_data" -x -q
```

Results: 12 corpus tests passed; 3 manifest-related passed; 2 loader tests xfailed as expected.

## Next Phase Readiness

- Plans 02–03 can implement against locked `venue_corpus` contracts and fixture-backed tests
- Plan 03 must wire MANIFEST_PATH into loader.py and update config DATA_PATH default to un-xfail loader tests
- Production `corpus/v1/` migration deferred to Plans 02–03

## Self-Check: PASSED

- FOUND: BackEnd/llm-service/venue_corpus/document.py
- FOUND: BackEnd/llm-service/tests/fixtures/corpus_v1/manifest.json
- FOUND: BackEnd/llm-service/tests/test_corpus_manifest.py
- FOUND: 1013bccc
- FOUND: d8110799
- FOUND: d0a60a2c

---
*Phase: 11-rag-architecture-and-corpus-design*
*Completed: 2026-05-29*
