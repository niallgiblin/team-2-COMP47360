# Testing

Current inventory and observed results for committed `urban-gala-v2`
(`0fce7dba`), verified on 2026-06-09.

This document reports executable outcomes, not inferred “coverage” from the
presence of a test file. The repository does not currently publish a unified
line/branch coverage report.

## Commands

```bash
cd BackEnd && ./mvnw test
cd frontend && npm test -- --run
cd BackEnd/llm-service && PYTHONPATH=. python3 -m pytest tests/ -q
cd BackEnd/busyness-service && PYTHONPATH=. python3 -m pytest tests/ -q
bash scripts/compose-smoke.sh --teardown
```

Python production images use Python 3.11. Results can differ on unsupported
host runtimes; the audit host had Python 3.14 in one environment and Python
3.13 in another.

## Latest observed results

| Suite | Inventory | Result |
|-------|-----------|--------|
| Spring Boot | 25 Java test classes | 285 run, 1 failure, 18 errors |
| Frontend Vitest | 14 test files | 133 passed |
| Frontend production build | Vite build | Passed; large chunk warning around 945 KiB |
| LLM pytest | 20 test modules, 464 collected | 456 passed, 7 failed, 1 skipped with cross-encoder disabled |
| Busyness pytest | 3 test modules, 21 collected | 20 passed, 1 artifact test skipped |
| Cypress | 4 specs | Not rerun in this audit |
| Compose smoke | 1 script | Not run; Docker daemon unavailable |
| Artifact verification | models, embeddings, corpus, index metadata | Current worktree fails only the embedding checksum because of uncommitted model work |

### Known Spring failures

- `VibeControllerTest` and `SecurityBoundaryTest` do not provide every bean
  required by their Spring test contexts, including `GooglePlacesService`.
- `BusynessPredictorApplicationTests` fails to load the complete application
  context in the audit environment.
- `VibeServiceTest.whenGetMapData_withCachedData_thenReturnsCachedResults`
  expects one busyness fetch but observes two.

### Known LLM failures

- Observability integration tests contain generated-code name errors.
- Observability writer tests pass UUID objects where the strict event schema
  expects strings.
- A prompt-loader assertion expects prompt v1.4 while the shipped prompt is
  v1.5.

These failures mean v2 must not be described as “all tests passing.”

## Test inventory

### Spring Boot

There are 25 Java test classes:

- 7 dedicated controller test classes for 8 controllers. `AvatarController`
  does not have a same-named controller test class.
- 10 service test classes.
- Security, startup validation, contract, DTO, model-preservation, application
  context, and global exception-handler tests.

Important coverage areas include JWT boundaries, stable errors, rate limiting,
CSV import, Flask contract mapping, bbox map filtering, caching, plans,
favorites, friends, and location behavior.

### Frontend

The 14 Vitest files are:

```text
frontend/services/tests/apiService.test.js
frontend/services/tests/apiUrls.test.js
frontend/src/components/tests/AIChatWidget.test.jsx
frontend/src/components/tests/ForecastSlider.test.jsx
frontend/src/components/tests/MapView.test.jsx
frontend/src/context/tests/AuthContext.test.jsx
frontend/src/context/tests/PlanContext.test.jsx
frontend/src/utils/tests/boundedCache.test.js
frontend/src/utils/tests/forecastTimes.test.js
frontend/src/utils/tests/routeClient.test.js
frontend/src/utils/tests/routeNormalizer.test.js
frontend/src/utils/tests/routeSegmentCache.test.js
frontend/src/utils/tests/zoneEnrichment.test.js
frontend/vite.config.test.js
```

The four Cypress specifications are `auth.cy.js`, `basic.cy.js`,
`forms.cy.js`, and `navigation.cy.js`.

### LLM service

The 20 committed pytest modules cover:

- BM25 creation and persistence.
- FAISS index building and loading.
- Bounded caches.
- Chat context, prompt construction, citations, and multi-turn behavior.
- Corpus document composition, manifests, and validation.
- CORS and route validation.
- The 41-query evaluation harness and metric functions.
- Query expansion.
- Retrieval relevance and filters.
- Cross-encoder loading, re-ranking, fallback, and hybrid integration.
- Structured observability and route instrumentation.

External Hugging Face calls are mocked in unit/integration tests. The full
generated-chat path still requires `HF_TOKEN` at runtime.

### Busyness service

The three test modules cover CORS, prediction/model behavior, and Flask
routes. The real-artifact test is opt-in and may be skipped in a normal unit
run.

## Smoke and artifact gates

`scripts/compose-smoke.sh` builds the production profile, waits for service
health, checks Spring Actuator, probes both internal Flask services, verifies
Nginx static serving, exercises public API proxying, and includes the v2
observability regression checks.

`scripts/verify-artifacts.sh` validates the committed model binaries, embedding
matrix, corpus checksum, and index metadata. The busyness model manifest covers
70 Keras files; the overall script checks additional LLM/corpus artifacts, so
“70 checksums” and “total files checked” are not interchangeable.

## Coverage language

Do not use the old claims “100% controller coverage” or “80% service coverage”
as code-coverage percentages. They were file-presence ratios from an earlier
milestone. Accurate interview wording is:

> The project has dedicated tests across controller, service, contract,
> frontend, retrieval, and model-serving boundaries, but it does not currently
> publish a trustworthy consolidated line/branch coverage percentage.

## Recommended release gate

Before calling a v2 release candidate green:

1. Run all four unit/integration suites under their production language
   versions.
2. Fix the known Spring and LLM failures.
3. Run Cypress against the built application.
4. Run `scripts/verify-artifacts.sh` from a clean checkout.
5. Run `scripts/compose-smoke.sh --teardown` with Docker.
6. Preserve command output as a dated report rather than copying counts into
   prose that will drift.

