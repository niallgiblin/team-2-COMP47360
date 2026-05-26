---
phase: 05-api-contract-alignment-and-llm-smoke-tests
plan: 07
subsystem: infra
tags: [llm-service, docker, python, jwt, pip-compile]

requires:
  - phase: 05-api-contract-alignment-and-llm-smoke-tests
    provides: Phase 5 LLM contract smoke tests and UAT cold-start gap report
provides:
  - LLM runtime dependency source includes PyJWT for app.py module import
  - Python 3.9 compiled requirements record PyJWT provenance from requirements.in
  - Docker cold-start verification for urban-gala-llm health
affects:
  - llm-service Docker image builds
  - Phase 5 UAT cold-start blocker

tech-stack:
  added:
    - PyJWT==2.10.1
  patterns:
    - "requirements.in remains the Docker dependency source of truth"
    - "requirements.txt regenerated with Python 3.9 pip-compile to match Dockerfile runtime"

key-files:
  created: []
  modified:
    - BackEnd/llm-service/requirements.in
    - BackEnd/llm-service/requirements.txt

key-decisions:
  - "PyJWT is declared in requirements.in, not only requirements.txt, because Docker runs pip-compile during image build"
  - "requirements.txt was regenerated in a Python 3.9 container to match the llm-service Dockerfile"

patterns-established:
  - "Use the service Docker Python version when regenerating compiled Python requirements"

requirements-completed: [ML-01, TEST-04]

duration: 18min
completed: 2026-05-26
---

# Phase 5 Plan 07: LLM PyJWT Cold-Start Gap Closure Summary

**LLM Docker cold start now installs PyJWT from the source requirements manifest, allowing gunicorn to import app.py and reach healthy service state.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-05-26T20:13:00Z
- **Completed:** 2026-05-26T20:31:16Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Added `PyJWT==2.10.1` to `BackEnd/llm-service/requirements.in`, the dependency source consumed by the Docker build.
- Regenerated `BackEnd/llm-service/requirements.txt` with Python 3.9 `pip-compile`, preserving PyJWT provenance as `# via -r requirements.in`.
- Rebuilt and started `urban-gala-llm`; container reached Docker `healthy` state and `/health` returned initialized model/data/embeddings status.

## Task Commits

Each implementation task was committed atomically:

1. **Task 1: Add PyJWT to LLM runtime input requirements** - `acd7525a` (chore)
2. **Task 2: Regenerate compiled requirements** - `7da4ccc8` (chore)
3. **Task 3: Verify LLM cold start** - no file changes; verification command evidence below

## Verification Commands

```bash
docker run --rm -v /Users/ng/UCD-CS/Summer25/team-2-COMP47360/BackEnd/llm-service:/app -w /app python:3.9-slim sh -c 'pip install --no-cache-dir pip-tools==7.5.1 && pip-compile requirements.in -o requirements.txt'
docker compose build llm-service
docker compose up -d llm-service
docker compose ps llm-service
docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' urban-gala-llm
docker logs --tail 120 urban-gala-llm
docker compose exec -T llm-service curl -f http://localhost:5000/health
```

Results:

- `docker compose build llm-service` exited 0.
- `docker compose ps llm-service` reported `urban-gala-llm` as `Up ... (healthy)`.
- `docker inspect` reported `running healthy`.
- `docker logs` showed gunicorn boot, model/data/embeddings loading, and `Service initialization completed successfully`; no `ModuleNotFoundError: No module named 'jwt'` appeared.
- In-container health request returned `{"data_loaded":true,"embeddings_loaded":true,"initialized":true,"model_loaded":true,"status":"healthy","total_locations":2262}`.

## Files Created/Modified

- `BackEnd/llm-service/requirements.in` - added `PyJWT==2.10.1` to the runtime dependency input manifest.
- `BackEnd/llm-service/requirements.txt` - regenerated compiled Python 3.9 requirements with PyJWT sourced from `requirements.in`; also aligned the compiled `torch` pin with the existing `torch==2.2.2` input requirement.

## Decisions Made

- Used a Python 3.9 Docker container for `pip-compile` because the local `.venv-test` uses Python 3.13, where the pinned `torch==2.2.2` requirement is unavailable.
- Kept PyJWT casing in `requirements.txt` consistent with the plan acceptance criteria while retaining generated dependency provenance.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Local `pip-compile` was unavailable and then failed under Python 3.13 because `torch==2.2.2` has no compatible Python 3.13 distribution. Resolved by running `pip-compile` in the same Python 3.9 major/minor runtime used by the LLM Dockerfile.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 5 UAT can rerun the LLM cold-start path without the missing `jwt` import blocker.
- The `urban-gala-llm` container is currently running healthy from the verification step.

## Self-Check: PASSED

- `BackEnd/llm-service/requirements.in` contains `PyJWT==2.10.1`.
- `BackEnd/llm-service/requirements.txt` contains `PyJWT==2.10.1` with `# via -r requirements.in`.
- `urban-gala-llm` booted without `ModuleNotFoundError: No module named 'jwt'`.
- `curl http://localhost:5000/health` inside the container healthcheck context succeeded.

---
*Phase: 05-api-contract-alignment-and-llm-smoke-tests*
*Completed: 2026-05-26*
