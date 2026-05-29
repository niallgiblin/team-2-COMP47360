---
phase: 11-rag-architecture-and-corpus-design
plan: 02
subsystem: rag
tags: [corpus, manifest, sha256, schema, venues.csv, spring-sync]

requires:
  - phase: 11-01
    provides: venue_corpus package with document/manifest/validate modules and fixture tests
provides:
  - Versioned corpus/v1/ with venues.csv, manifest.json, SCHEMA.md, index placeholder
  - Production manifest SHA-256 checksum validated against 2262-row catalog
  - Spring locations.csv byte-identical to corpus venues.csv
  - Hardened validate_corpus_dir with schema, checksum, and row_count checks
affects: [11-03, phase-12-embedding-pipeline, phase-14-citations, phase-15-eval]

tech-stack:
  added: []
  patterns:
    - "corpus/v1/ versioned data root separate from venue_corpus Python package"
    - "manifest.json carries schema_version only — no embedding_model_id (D-15)"
    - "index/ gitignored placeholder for Phase 12 FAISS artifacts"
    - "Dual CSV sync: corpus/v1/venues.csv and Spring resources same commit"

key-files:
  created:
    - BackEnd/llm-service/corpus/v1/venues.csv
    - BackEnd/llm-service/corpus/v1/manifest.json
    - BackEnd/llm-service/corpus/v1/SCHEMA.md
    - BackEnd/llm-service/corpus/v1/index/.gitkeep
    - BackEnd/llm-service/corpus/v1/index/.gitignore
  modified:
    - BackEnd/llm-service/venue_corpus/manifest.py
    - BackEnd/llm-service/venue_corpus/document.py
    - BackEnd/llm-service/venue_corpus/validate.py
    - BackEnd/llm-service/tests/test_corpus_validate.py

key-decisions:
  - "manifest row_count set to 2262 to match pandas row count and embeddings.npy shape (2262, 768)"
  - "EMBED_FIELDS reordered to match manifest embed_fields: name, description, zone, price, loc_type, tags, summary, Info"
  - "verify_manifest_checksum returns path-free 'Checksum mismatch: venues.csv' message"

patterns-established:
  - "validate_corpus_dir aggregates layout, manifest load, checksum, schema, and row_count errors"
  - "build_manifest_from_csv maintainer helper for SHA-256 and row_count regeneration"

requirements-completed: [RAG-01]

duration: 12min
completed: 2026-05-29
---

# Phase 11 Plan 02: Versioned Corpus Migration Summary

**Production venue catalog migrated to corpus/v1/ with SHA-256 manifest, SCHEMA.md field contracts, and Spring CSV dual-sync**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-29T14:00:00Z
- **Completed:** 2026-05-29T14:12:00Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Migrated `data/locations.csv` to `corpus/v1/venues.csv` via git mv with row order preserved
- Authored `manifest.json` with production SHA-256 `9ad28a62…`, schema_version 1.0.0, and labeled-line document model
- Wrote comprehensive `SCHEMA.md` covering embed/metadata fields, D-10 retrieval key, maintainer checklist, and v1→v2 bump policy
- Hardened `validate_corpus_dir` to verify layout, checksum, schema, and row_count in one call

## Task Commits

1. **Task 1: Versioned corpus directory migration** - `95310de5` (feat)
2. **Task 2: Author manifest.json** - `1b4a945b` (feat)
3. **Task 3: SCHEMA.md and document composition finalization** - `802e6e78` (feat)

## Files Created/Modified

- `BackEnd/llm-service/corpus/v1/venues.csv` - Canonical 2262-row RAG venue catalog (git mv from data/locations.csv)
- `BackEnd/llm-service/corpus/v1/manifest.json` - Checksum, schema_version, embed_fields, spring_sync policy
- `BackEnd/llm-service/corpus/v1/SCHEMA.md` - Human field mapping, labeled-line format, maintainer checklist
- `BackEnd/llm-service/corpus/v1/index/` - Gitignored placeholder for Phase 12 index artifacts
- `BackEnd/llm-service/venue_corpus/manifest.py` - Required-key validation, build_manifest_from_csv helper
- `BackEnd/llm-service/venue_corpus/document.py` - EMBED_FIELDS order aligned with manifest
- `BackEnd/llm-service/venue_corpus/validate.py` - Full corpus directory validation pipeline
- `BackEnd/llm-service/tests/test_corpus_validate.py` - test_production_manifest_matches for corpus/v1/

## Decisions Made

- Corrected manifest `row_count` to 2262 (actual data rows, ids 0–2261) matching `location_embeddings.npy` shape
- Spring `BackEnd/src/main/resources/data/locations.csv` was already byte-identical at migration time — no diff in commit

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected manifest row_count from 2261 to 2262**
- **Found during:** Task 3 (validate_corpus_dir production test)
- **Issue:** Plan stated row_count 2261 but CSV has 2262 data rows (ids 0–2261); embeddings.npy shape is (2262, 768)
- **Fix:** Updated manifest.json row_count to 2262; validate_corpus_dir row_count check passes
- **Files modified:** BackEnd/llm-service/corpus/v1/manifest.json
- **Verification:** test_production_manifest_matches passes; pandas len(df)==2262
- **Committed in:** 802e6e78 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Correctness fix only; SHA-256 unchanged, no row reordering.

## Issues Encountered

None beyond row_count correction documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 can wire loader.py DATA_PATH/MANIFEST_PATH to corpus/v1/ and un-xfail loader contract tests
- Phase 12 can write FAISS index artifacts to corpus/v1/index/ (gitignored)
- Production corpus validates clean via validate_corpus_dir(Path("corpus/v1"))

## Verification

```bash
diff -q BackEnd/llm-service/corpus/v1/venues.csv BackEnd/src/main/resources/data/locations.csv
shasum -a 256 BackEnd/llm-service/corpus/v1/venues.csv
# 9ad28a62ce87924ca99ba77d84023b7d3728aa5f4a07552b183e1ead8c95cbcf

cd BackEnd/llm-service && python3 -m pytest tests/test_corpus_*.py -q
# 13 passed
```

## Self-Check: PASSED

- FOUND: BackEnd/llm-service/corpus/v1/venues.csv
- FOUND: BackEnd/llm-service/corpus/v1/manifest.json
- FOUND: BackEnd/llm-service/corpus/v1/SCHEMA.md
- FOUND: 95310de5
- FOUND: 1b4a945b
- FOUND: 802e6e78

---
*Phase: 11-rag-architecture-and-corpus-design*
*Completed: 2026-05-29*
