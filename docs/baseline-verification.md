# Baseline Verification Matrix

Tiered verification record for Phase 1 and downstream remediation. Required-pass checks are limited to metadata and artifact policy gates expected to pass after plans 01-01 and 01-02. Application tests, Docker runtime smoke, and Python service smoke are documented as known gaps, manual tiers, or missing placeholders — not Phase 1 required gates.

Related policy: [artifacts.md](artifacts.md). GSD planning artifacts under `.planning/` are local-only and must not be committed.

## Required Metadata Gate

Checks expected to pass for the Phase 1 gate. These validate repository metadata, Git LFS attributes, generated-output ignore policy, and runtime binary checksums without running application test suites.

| Command | Expected outcome | Owner file | Requirement IDs | Phase 1 gate |
|---------|------------------|------------|-----------------|--------------|
| `rtk git status --short` | Clean working tree for Phase 1 deliverables; local editor config (`.vscode/`) and GSD planning (`.planning/`) must not appear as tracked changes | `.gitignore`, `.gitattributes` | ART-01, TEST-01 | **Required** |
| `rtk git diff --check` | No whitespace or conflict-marker errors in staged/unstaged diffs | Repository-wide | ART-01, TEST-01 | **Required** |
| `rtk git lfs ls-files --long` | Lists runtime `.keras`, `.npy`, `.safetensors`, and model metadata under `BackEnd/...` with LFS pointer metadata | `.gitattributes` | ART-01, ART-02, ART-04 | **Required** |
| `rtk git check-attr filter diff merge -- BackEnd/llm-service/data/location_embeddings.npy` | `filter: lfs`, `diff: lfs`, `merge: lfs` (or equivalent LFS attributes) | `.gitattributes` | ART-01, ART-02 | **Required** |
| `rtk git check-attr filter diff merge -- BackEnd/llm-service/models/sentence-transformers/model.safetensors` | `filter: lfs`, `diff: lfs`, `merge: lfs` | `.gitattributes` | ART-01, ART-02 | **Required** |
| `rtk git check-attr filter diff merge -- "BackEnd/busyness-service/models/DNNs/100 NET.keras"` | `filter: lfs`, `diff: lfs`, `merge: lfs` | `.gitattributes` | ART-01, ART-02 | **Required** |
| `rtk git check-ignore -v --no-index BackEnd/target` | Path ignored by `BackEnd/.gitignore` (Maven build output not tracked as source) | `BackEnd/.gitignore` | ART-01 | **Required** |
| `rtk git check-ignore -v --no-index test-reports/example.txt` | Path ignored by root `.gitignore` generated-output group | `.gitignore` | ART-01 | **Required** |
| `rtk git check-ignore -v --no-index docs/controller-coverage.txt` | Path ignored (generated metric, not authored documentation) | `.gitignore` | ART-01 | **Required** |
| `rtk git check-ignore -v --no-index docs/service-coverage.txt` | Path ignored (generated metric, not authored documentation) | `.gitignore` | ART-01 | **Required** |
| `rtk git check-ignore -v --no-index docs/frontend-tests.txt` | Path ignored (generated metric, not authored documentation) | `.gitignore` | ART-01 | **Required** |
| `rtk git check-ignore -v --no-index .planning/PROJECT.md` | GSD planning directory ignored (local-only) | `.gitignore` | ART-01 | **Required** |
| `rtk git check-ignore -v --no-index .vscode/settings.json` | Editor settings ignored (local-only) | `.gitignore` | ART-01 | **Required** |
| `rtk bash scripts/verify-artifacts.sh` | All 70 runtime binary SHA-256 checksums match `docs/artifacts.md` | `scripts/verify-artifacts.sh`, `docs/artifacts.md` | ART-04, TEST-01 | **Required** |

**Not required-pass in Phase 1:** Maven (`./mvnw test`), Vitest, ESLint, Cypress, Docker Compose runtime smoke, and Python ML smoke commands belong in the tiers below.

## Known Application Gaps

Executable application checks that are baseline candidates but **not** Phase 1 required gates. Current outcomes recorded from the 2026-05-25 research audit (D-13, D-14, D-16).

| Command | Current outcome | Owner file | Requirement IDs | Phase 1 gate |
|---------|-----------------|------------|-----------------|--------------|
| `rtk proxy sh -lc 'cd BackEnd && ./mvnw test'` | Compiles then fails **211/211** tests — Mockito mock maker initialization fails under the active JVM (inline mock maker / agent attachment) | `BackEnd/pom.xml`, `BackEnd/src/test/**` | TEST-01 | **Not required** (known gap) |
| `rtk proxy sh -lc 'cd frontend && npm test -- --run'` | Fails **14/27** Vitest tests — includes missing `../MapView` import, `localStorage.clear` mock issue, and missing `scrollIntoView` in JSDOM | `frontend/package.json`, `frontend/vitest.config.js` | TEST-01 | **Not required** (known gap) |
| `rtk proxy sh -lc 'cd frontend && npm run lint'` | Fails with **234 errors and 21 warnings** — Cypress/Vitest globals, unused variables, and legacy lint debt | `frontend/package.json`, ESLint config | TEST-01 | **Not required** (known gap) |

Remediation for these failures is assigned to later phases; Phase 1 documents the honest baseline only.

## Manual and Slow Checks

Checks that require a running Docker daemon, browser automation, or full stack startup. Document command names and prerequisites only — do not paste expanded Compose config or `.env` values (T-01-11).

| Command | Prerequisites | Expected outcome (when prerequisites met) | Owner file | Requirement IDs | Phase 1 gate |
|---------|---------------|-------------------------------------------|------------|-----------------|--------------|
| `rtk proxy sh -lc 'cd frontend && npm run cypress:run'` | Frontend dev server or Docker frontend reachable; Cypress 14.x installed | E2E specs under `frontend/cypress/e2e/` execute in headless browser | `frontend/package.json`, `frontend/cypress.config.js` | TEST-01 | **Not required** (manual/slow) |
| `rtk proxy sh -lc 'cd frontend && npm run test:e2e'` | Same as Cypress run (alias) | Same as `cypress:run` | `frontend/package.json` | TEST-01 | **Not required** (manual/slow) |
| `rtk docker info` | **Docker daemon running** and accessible to the Docker CLI | Server section reports running daemon | Docker Desktop / engine | TEST-01, TEST-05 | **Not required** (prerequisite check) |
| `rtk docker compose -f docker-compose.yml up -d --build` | Docker daemon available; `.env` populated with required secrets (names only in docs) | Services start with healthcheck-gated dependencies | `docker-compose.yml` | TEST-01, TEST-05 | **Not required** (manual/slow) |
| `rtk proxy sh -lc 'curl -sf http://localhost:8080/actuator/health'` | Compose stack up; backend healthy | HTTP 200 from Spring Actuator | `docker-compose.yml` (backend healthcheck) | TEST-05 | **Not required** (manual/slow) |
| `rtk proxy sh -lc 'curl -sf http://localhost:5001/health'` | Compose stack up; LLM service healthy | HTTP 200 from Flask LLM `/health` | `BackEnd/llm-service/app.py` | TEST-05, ML-01 | **Not required** (manual/slow) |
| `rtk proxy sh -lc 'curl -sf http://localhost:5002/health'` | Compose stack up; busyness service healthy | HTTP 200 from Flask busyness `/health` | `BackEnd/busyness-service/app.py` | TEST-05, ML-02 | **Not required** (manual/slow) |

**Current environment gap:** `docker info` fails when the Docker daemon is not running. Record this as a known prerequisite gap; smoke commands above are intended for daemon-enabled machines.

## Missing Test Placeholders

Python ML service smoke tests are **not implemented** in the repository today. Phase 1 does not add them.

| Placeholder | Assigned phase | Requirement IDs | Notes |
|-------------|----------------|-----------------|-------|
| LLM service smoke tests (startup, `/health`, `/search`, `/api/chat`) | Phase 5 (ML-01) | ML-01, TEST-04 | No Python tests detected under `BackEnd/llm-service/` |
| Busyness service smoke tests (startup, `/health`, `/busyness`, forecast, normalization) | Phase 6 (ML-02) | ML-02, TEST-04 | No Python tests detected under `BackEnd/busyness-service/` |

These placeholders are baseline evidence, not Phase 1 fixes.

## Requirement Traceability

### v0.1 coverage summary

Based on the v0.1 requirement set captured during Phase 1 planning (2026-05-25):

| Metric | Count |
|--------|-------|
| **54 total** v0.1 requirements | 54 |
| **54 mapped** to roadmap phases | 54 |
| **0 unmapped** | 0 |

Every concern identified during the Phase 1 codebase audit maps to at least one requirement and phase in the v0.1 traceability record.

### Phase 1 plan-to-requirement mapping

| Plan | Deliverable | Requirement IDs |
|------|-------------|-----------------|
| `01-01` | Repository metadata ownership (`.gitattributes`, `.gitignore`, `.dockerignore`, `scripts/run-tests.sh` redirect) | ART-01, TEST-01 |
| `01-02` | Artifact manifest (`docs/artifacts.md`), checksum verifier (`scripts/verify-artifacts.sh`), setup links | ART-02, ART-03, ART-04 |
| `01-03` | Baseline verification matrix (`docs/baseline-verification.md`) and traceability policy | ART-01, ART-02, ART-03, ART-04, TEST-01, TEST-06 |

### Concern coverage (Phase 1)

| Concern area (from Phase 1 codebase audit) | Phase 1 response | Requirement IDs |
|------------------------------------------------------|------------------|-----------------|
| Large generated and model artifacts in the working tree | Git LFS policy, artifact manifest, checksum table, metadata gate checks | ART-01, ART-02, ART-03, ART-04 |
| Missing baseline test matrix before remediation | Tiered matrix in this document (required metadata vs known gaps vs manual vs placeholders) | TEST-01 |
| Missing full concern-to-phase traceability | 54/54 requirement mapping preserved; summary policy below | TEST-06 |

### Plan summary writing policy (D-15)

Every `*-SUMMARY.md` written by GSD plan executors **must** include:

1. **Requirement IDs actually changed** — copy from the plan's `requirements` frontmatter and note which IDs were verified vs merely referenced.
2. **Commands run** — list verification commands executed (prefer `rtk`-prefixed project form) with pass/fail outcome.
3. **Known gaps observed** — document any failing or skipped checks from this baseline matrix without reclassifying them as passing Phase 1 gates.
4. **Links to changed files** — reference generated documentation, metadata files, or scripts created or modified (e.g. `docs/artifacts.md`, `.gitattributes`).

Summaries are the audit trail from planning requirements through execution evidence to downstream phases.

## Phase 2 Verification Gates

Added by Phase 2 Plan 01 (`02-01`). Covers production frontend container and Nginx proxy path correctness.

Related requirements: DEP-01, DEP-02.

### Required source checks (automated)

| Command | Expected outcome | Owner file | Requirement IDs | Phase 2 gate |
|---------|------------------|------------|-----------------|--------------|
| `rtk rg -n "nginx:alpine\|npm ci\|npm run build\|VITE_API_BASE_URL\|VITE_LLM_API_URL" frontend/Dockerfile` | All 5 patterns found | `frontend/Dockerfile` | DEP-01 | **Required** |
| `rtk rg -n "location /api/chat\|proxy_pass http://llm-service:5000" frontend/nginx.conf nginx/nginx.conf` | Both files have non-stripping chat proxy | `frontend/nginx.conf`, `nginx/nginx.conf` | DEP-02 | **Required** |
| `rtk rg -n "profiles:\|prod\|frontend-prod\|VITE_API_BASE_URL\|VITE_LLM_API_URL" docker-compose.yml` | Prod profile service present with build args | `docker-compose.yml` | DEP-01, DEP-02 | **Required** |
| `rtk rg -n "location /avatars/" frontend/nginx.conf nginx/nginx.conf` | Avatar proxy in both nginx configs | `frontend/nginx.conf`, `nginx/nginx.conf` | DEP-02 | **Required** |

### Manual smoke checks (require Docker daemon)

| Command | Prerequisites | Expected outcome | Owner file | Phase 2 gate |
|---------|---------------|------------------|------------|--------------|
| `rtk docker compose --profile prod build frontend-prod` | Docker daemon running | Build succeeds; final stage is `nginx:alpine` | `frontend/Dockerfile`, `docker-compose.yml` | **Not required** (manual/slow) |
| `rtk proxy sh -lc 'docker run --rm -v "$(pwd)/frontend/nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine nginx -t'` | Docker daemon running | `nginx -t` syntax check passes | `frontend/nginx.conf` | **Not required** (manual/slow) |
| `curl -I http://localhost:80` | Prod profile stack up (`docker compose --profile prod up -d`) | HTTP 200 with Nginx headers; no `X-Powered-By: Vite` | `docker-compose.yml` | **Not required** (manual/slow) |

### Required application gate (after Plan 03)

| Command | Expected outcome | Owner file | Requirement IDs | Phase 2 gate |
|---------|------------------|------------|-----------------|--------------|
| `rtk proxy sh -lc 'cd frontend && npm test -- --run services/tests/apiService.test.js'` | apiService unit tests pass with relative `/api` base URL | `frontend/src/services/tests/apiService.test.js` | DEP-02, TEST-01 | **Required after Plan 03** |

### Phase 2 plan-to-requirement mapping

| Plan | Deliverable | Requirement IDs |
|------|-------------|-----------------|
| `02-01` | Multi-stage `frontend/Dockerfile`, nginx proxy configs, Compose `prod` profile, env docs | DEP-01, DEP-02 |
| `02-02` | API client service (relative URLs, axios instance) | DEP-02 |
| `02-03` | Baseline-verification update and integration test gates | DEP-01, DEP-02, TEST-01 |

