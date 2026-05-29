---
phase: 11-rag-architecture-and-corpus-design
plan: 03
subsystem: rag
tags: [corpus, manifest, docker-compose, config, startup-validation, artifacts]

requires:
  - phase: 11-02
    provides: production corpus/v1/ with manifest, SCHEMA.md, and validate_corpus_dir
provides:
  - Runtime defaults anchored to corpus/v1/venues.csv and manifest.json
  - Startup corpus validation with checksum warn-only policy
  - Docker Compose corpus volume mount and env vars
  - Corpus tier in docs/artifacts.md and verify-artifacts.sh
  - Green full llm-service pytest suite (83 passed)
affects: [phase-12-embedding-pipeline, phase-13-unified-retrieval]

tech-stack:
  added: []
  patterns:
    - "config.py CORPUS_VERSION resolves _CORPUS_ROOT under _LLM_SERVICE_DIR/corpus/"
    - "validate_corpus_at_startup fails hard on layout/schema; checksum mismatch warns only"
    - "verify_file_paths includes MANIFEST_PATH with env-name-only missing list"
    - "verify-artifacts.sh reads venues_csv.sha256 from manifest.json"

key-files:
  created: []
  modified:
    - BackEnd/llm-service/config.py
    - BackEnd/llm-service/loader.py
    - BackEnd/llm-service/app.py
    - docker-compose.yml
    - docs/artifacts.md
    - docs/README.md
    - docs/llm-runtime.md
    - scripts/verify-artifacts.sh
    - BackEnd/llm-service/tests/test_loader.py
    - BackEnd/llm-service/tests/test_corpus_validate.py
    - BackEnd/llm-service/tests/conftest.py

key-decisions:
  - "Checksum mismatch at startup logs warning and does not block init (per RESEARCH Pattern 3–4)"
  - "Corpus validation errors surface env var names only (MANIFEST_PATH, DATA_PATH, CORPUS_VERSION)"
  - "FAISS-first and one-doc-per-venue direction carried in SCHEMA/manifest; Phase 12 owns index pipeline"

patterns-established:
  - "reload-safe config import in loader.verify_file_paths and validate_corpus_at_startup"
  - "Compose mounts corpus/ read-only separately from data/ for embeddings.npy only"

requirements-completed: [RAG-01]

duration: 18min
completed: 2026-05-29
---

# Phase 11 Plan 03: Corpus Runtime Integration Summary

**Versioned corpus paths wired into config, startup validation, Docker Compose, and artifact docs; loader xfail tests green; 83-test suite passes**

## Performance

- **Duration:** 18 min
- **Started:** 2026-05-29T14:30:00Z
- **Completed:** 2026-05-29T14:48:00Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Default `DATA_PATH` and `MANIFEST_PATH` resolve to `corpus/v1/` under `_LLM_SERVICE_DIR`
- `validate_corpus_at_startup()` integrates `validate_corpus_dir` with checksum warn-only policy
- Docker Compose mounts `/app/corpus` and sets corpus env vars; docs and verify script extended per D-16
- Removed Plan 01 xfail markers; full `pytest tests/` exits 0 (83 passed)

## Task Commits

1. **Task 1: config.py and loader.py corpus integration (D-02)** - `8362d5ef` (feat)
2. **Task 2: Docker Compose and artifact documentation (D-16)** - `8f74889e` (docs)
3. **Task 3: Green full suite and embedding row-count gate** - `54abf5f0` (test)

## Files Created/Modified

- `BackEnd/llm-service/config.py` - CORPUS_VERSION, _CORPUS_ROOT, DATA_PATH/MANIFEST_PATH defaults
- `BackEnd/llm-service/loader.py` - MANIFEST_PATH in verify_file_paths; validate_corpus_at_startup
- `BackEnd/llm-service/app.py` - Corpus validation after file path check; warning logs for checksum drift
- `docker-compose.yml` - `./corpus:/app/corpus:ro` mount; DATA_PATH/MANIFEST_PATH/CORPUS_VERSION env
- `docs/artifacts.md` - Corpus tier section, updated path table, index/ gitignore note, D-03 bump policy
- `scripts/verify-artifacts.sh` - Corpus checksum verification from manifest.json
- `BackEnd/llm-service/tests/test_loader.py` - Un-xfailed contracts; row-count and production layout tests
- `BackEnd/llm-service/tests/conftest.py` - Stub validate_corpus_at_startup for app import with numpy stub

## Decisions Made

- Checksum mismatch at startup is non-blocking (warning logged); missing manifest/schema fails init
- conftest stubs `validate_corpus_at_startup` when loading app with mocked numpy/pandas to avoid real CSV read during chat tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stub validate_corpus_at_startup in conftest load_app**
- **Found during:** Task 3 (full pytest run)
- **Issue:** app.py import triggered real corpus validation with stubbed numpy, breaking chat_context tests
- **Fix:** monkeypatch `loader.validate_corpus_at_startup` to return `(True, [])` before app import in conftest
- **Files modified:** BackEnd/llm-service/tests/conftest.py
- **Verification:** 83 tests pass including test_chat_context.py
- **Committed in:** 54abf5f0 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Test isolation fix only; production startup behavior unchanged.

## Issues Encountered

None beyond conftest isolation fix documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 12 can build FAISS index artifacts into `corpus/v1/index/` (gitignored)
- Maintainers run `./scripts/verify-artifacts.sh` for binary + corpus checksum gates
- RAG-01 operable end-to-end: service loads from `corpus/v1/`, manifest validated at startup

## Verification

```bash
cd BackEnd/llm-service && python3 -m pytest tests/ -q
# 83 passed

bash scripts/verify-artifacts.sh 2>&1 | grep -E "corpus|PASS.*venues"
# PASS  BackEnd/llm-service/corpus/v1/venues.csv

grep -q '/app/corpus' docker-compose.yml && echo ok
```

## Self-Check: PASSED

- FOUND: BackEnd/llm-service/config.py
- FOUND: docker-compose.yml (/app/corpus mount)
- FOUND: .planning/phases/11-rag-architecture-and-corpus-design/11-03-SUMMARY.md
- FOUND: 8362d5ef
- FOUND: 8f74889e
- FOUND: 54abf5f0

---
*Phase: 11-rag-architecture-and-corpus-design*
*Completed: 2026-05-29*
