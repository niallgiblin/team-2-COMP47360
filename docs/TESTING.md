# Testing Strategy & Documentation

## Overview

Urban Gala uses a multi-layer testing strategy covering all four services: Spring Boot backend, React frontend, LLM Flask service, and Busyness Flask service. The v0.1 milestone delivered 25 Java test classes (100% controller, 80% service coverage), 11 frontend Vitest test files, 14 Python ML test files, and 4 Cypress E2E suites, plus a production-like Docker Compose smoke script.

## Quick Start

### All Backend Tests (Java)
```bash
cd BackEnd && ./mvnw test
```

### All Frontend Unit Tests (Vitest)
```bash
cd frontend && npm test -- --run
```

### All Python ML Tests
```bash
cd BackEnd/llm-service && PYTHONPATH=. python3 -m pytest tests/ -q
cd BackEnd/busyness-service && PYTHONPATH=. python3 -m pytest tests/ -q
```

### Cypress E2E Tests (requires running app)
```bash
cd frontend && npx cypress run --spec "cypress/e2e/*.cy.js"
```

### Production Smoke Check (requires Docker daemon)
```bash
bash scripts/compose-smoke.sh --teardown
```

### Combined Test Runner
```bash
bash scripts/run-tests.sh
```

---

## Test Inventory

### Backend (Java / Spring Boot) — 25 test files

**Controller Tests (8 files, 100% coverage):**

| File | Test cases | Coverage |
|------|-----------|----------|
| `AuthControllerTest.java` | 15 | Login, signup, JWT validation, error payloads |
| `LocationControllerTest.java` | 12 | CRUD, CSV import integration |
| `PlanControllerTest.java` | 18 | Create, update, share, delete, auth principal injection |
| `UserControllerTest.java` | 6 | Profile fetch/update, avatar paths |
| `VibeControllerTest.java` | 8 | Search, map-data, busyness proxy, rate limiting |
| `FavouriteControllerTest.java` | 9 | Add/remove favorites, list, friend favorites |
| `FriendControllerTest.java` | 12 | Friend requests, accept, list, shared plans |
| (8 controllers total) | — | MockMvc + JWT authentication |

**Service Tests (12 files, 80% coverage):**

| File | Focus |
|------|-------|
| `AuthServiceTest.java` | Password encoding, JWT generation, user lookup |
| `FavouriteServiceTest.java` | Favorite CRUD, duplicate detection |
| `FriendServiceTest.java` | Friend request lifecycle, acceptance |
| `HistoryServiceTest.java` | Search history persistence |
| `LocationServiceTest.java` | Location queries, zone filtering |
| `LocationCsvImporterTest.java` | CSV parsing edge cases (quoted fields, upserts) |
| `MlServiceClientTest.java` | Flask service contract deserialization |
| `PlanServiceTest.java` | Plan CRUD, sharing, auth enforcement |
| `SharedServiceTest.java` | Shared plan access, token validation |
| `VibeServiceTest.java` | Bbox filtering, cache behavior, ML client coordination |

**Repository & Integration Tests (5 files):**
- Data access, transaction boundary, and Flyway migration verification.

### Frontend (Vitest) — 11 test files

| File | Focus |
|------|-------|
| `MapView.test.jsx` | Map rendering, bbox fetch, route display, Google Routes integration |
| `AIChatWidget.test.jsx` | Chat send/receive, message history, error states |
| `ForecastSlider.test.jsx` | Forecast hour selection, timezone alignment |
| `AuthContext.test.jsx` | Login/logout state, token persistence, 401 invalidation |
| `PlanContext.test.jsx` | Plan CRUD context operations |
| `apiService.test.js` | Relative URL resolution, auth header attachment |
| `routeClient.test.js` | Route segment generation, field mask, polyline fallback |
| `boundedCache.test.js` | TTL enforcement, max-size eviction, concurrent dedup |
| `boundedCache.test.jsx` | React hook integration for cache modules |
| `cacheRegistry.test.js` | Client cache registration and invalidation hooks |
| `vibeAPI.test.js` | API URL construction, bbox parameter encoding |

### Python ML Services — 14 test files

**LLM Service (10 test files):**

| File | Focus |
|------|-------|
| `test_health.py` | `/health` endpoint, location count, model readiness |
| `test_search.py` | `/search` endpoint, ranking, filter behavior |
| `test_chat.py` | `/api/chat` endpoint, JWT auth, history handling |
| `test_similar.py` | `/similar` endpoint, source tagging (`ml` / `category`) |
| `test_cache.py` | Bounded TTL cache eviction and max-size enforcement |
| `test_loader.py` | Model loading, embeddings, DataFrame verification |
| `test_config.py` | Env var defaults, path resolution |
| `test_dto.py` | Response DTO serialization |
| `test_retrieval_relevance.py` | 17 retrieval relevance examples + harness (FAISS ranking accuracy) |
| `test_faiss_index.py` | Index build, normalization, stable tie-breaking |

**Busyness Service (4 test files):**

| File | Focus |
|------|-------|
| `test_health.py` | `/health` endpoint, checksum verification |
| `test_busyness.py` | Live prediction, forecast, weather fallback, normalization |
| `test_artifact.py` | Real-artifact model loading (opt-in `-m artifact`) |
| `test_cache.py` | Process-local TTL cache behavior |

### Cypress E2E — 4 suites (19 tests)

| Suite | Tests | Coverage |
|-------|-------|----------|
| `basic.cy.js` | 5 | Home page, navigation links |
| `auth.cy.js` | 4 | Login/signup forms, validation |
| `forms.cy.js` | 4 | Form interaction, error clearing |
| `navigation.cy.js` | 6 | All route transitions |

### Docker Smoke — 1 script (5 checks)

`scripts/compose-smoke.sh` verifies the full production-like stack:
1. Spring Boot Actuator health
2. LLM service `/health` (via `docker compose exec`)
3. Busyness service `/health` (via `docker compose exec`)
4. Nginx static frontend (no Vite/Express dev headers)
5. Proxied public API (`GET /api/locations` → 200)

### Artifact Verification — 1 script

`scripts/verify-artifacts.sh` validates SHA-256 checksums for all 70 runtime binary artifacts (Keras models, SafeTensors, NumPy embeddings) against the documented checksum table in [artifacts.md](artifacts.md).

---

## Backend Testing

### Controller Layer (100% Coverage)

All 8 REST controllers have dedicated test suites using MockMvc with JWT-authenticated requests. Tests cover:

- **Happy path:** Successful CRUD operations with valid auth
- **Auth failures:** Missing/expired/invalid JWT → 401
- **Authorization:** User-scoped data access (own plans, own favorites)
- **Validation:** Request body constraints, path variable types
- **Error payloads:** Stable client-safe error messages (SEC-07)

Key patterns:
```java
mockMvc.perform(get("/api/vibe/search")
    .with(authentication(authenticationToken))
    .param("query", "quiet coffee"))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.results").isArray());
```

### Service Layer (80% Coverage)

Business logic tests with mocked repositories and external clients. Each service test isolates:

- **Core behavior:** Business rules independent of HTTP layer
- **External calls:** ML service client mocked via WireMock or Mockito
- **Cache behavior:** Caffeine cache hit/miss/eviction scenarios
- **Error propagation:** Exception translation from ML services to Spring

### Rate Limiting

`VibeControllerTest` includes rate-limit boundary tests verifying expensive endpoints (search, map-data) enforce configured bucket capacity and refill rates.

---

## Frontend Testing

### Component Tests (Vitest + React Testing Library)

Component tests render React components in JSDOM and assert:

- **Rendering:** Correct DOM output for given props and context
- **User interaction:** Button clicks, form input, autocomplete selection
- **Async state:** Loading spinners, error banners, empty states
- **Context integration:** AuthContext, PlanContext, BusynessContext providers

### Service Tests

API client and utility modules tested in isolation:

- **`apiService.test.js`:** Verifies `resolveApiBaseUrl()` returns `/api` for relative paths, auth interceptors attach Bearer tokens, and 401 responses trigger cache invalidation.
- **`routeClient.test.js`:** Asserts Google Routes field masks, polyline fallback on API errors, and multi-stop segment caching.
- **`boundedCache.test.js`:** TTL expiration, max-size LRU eviction, concurrent `getOrSet` deduplication.

### Cache Invalidation

Client cache modules and the `invalidateClientCaches()` orchestrator are tested via:
- Logout clears all browser caches (map-data, search, busyness sessionStorage, route segments).
- 401 responses from `authFetch` paths clear caches.
- `BusynessContext` payload size guard skips oversized entries.

---

## Python ML Testing

### Test Environment

Both Python services use `pytest` with a dedicated `.venv-test` virtual environment. Tests run locally without Docker:

```bash
cd BackEnd/llm-service
python3 -m venv .venv-test && source .venv-test/bin/activate
pip install -r requirements.txt
PYTHONPATH=. python3 -m pytest tests/ -q
```

Tests do not require live Hugging Face calls or production model paths. Mock fixtures provide:
- Sentence-transformer model stubs with fixed-dimension embeddings
- FAISS index fixtures with known ranking outcomes
- Location DataFrames with controlled venue records

### Retrieval Relevance Tests

`test_retrieval_relevance.py` contains 17 retrieval relevance examples that validate FAISS ranking accuracy:

- **Direct matches:** "Central Park Boathouse" → top result is Boathouse
- **Category queries:** "quiet coffee shop in Greenwich Village" → returns expected venue
- **Zone filtering:** Zone-restricted queries exclude out-of-zone venues
- **Price tier:** Price-filtered results respect tier constraints
- **Fallback:** Queries with no strong matches still return structured results

### Busyness Artifact Tests

Opt-in real-artifact tests (`-m artifact`) load actual Keras models and verify:
- Model weights deserialize without errors
- Checksum manifest validation passes
- `/health` reports healthy when all artifacts are present
- Startup fails cleanly on missing or corrupted artifacts

---

## Production Smoke Verification

`scripts/compose-smoke.sh` is the authoritative end-to-end verification:

```bash
bash scripts/compose-smoke.sh --teardown
```

**What it checks:**
1. Docker Build — `docker compose --profile prod up -d --build`
2. Health Wait — polls all 4 services up to 300s
3. Spring Actuator — `curl http://localhost:8080/actuator/health`
4. LLM Service — `docker compose exec llm-service curl http://localhost:5000/health`
5. Busyness Service — `docker compose exec busyness-service curl http://localhost:5000/health`
6. Nginx Static — `curl -I http://localhost:80` (must not show Vite/Express headers)
7. Proxied API — `curl http://localhost:80/api/locations` (JSON 200, no JWT)

**Note:** ML service ports (5001/5002) are not published to the host. Use `docker compose exec` for internal health probes.

---

## Running Individual Test Suites

### Backend
```bash
# All tests
cd BackEnd && ./mvnw test

# Single test class
cd BackEnd && ./mvnw test -Dtest=VibeServiceTest

# Single test method
cd BackEnd && ./mvnw test -Dtest=VibeServiceTest#whenSearchWithValidQuery_returnsResults
```

### Frontend (Vitest)
```bash
# All tests (CI mode)
cd frontend && npm test -- --run

# Single file
cd frontend && npx vitest run src/pages/tests/MapView.test.jsx

# Watch mode (dev)
cd frontend && npm test
```

### Python ML
```bash
# LLM service — all tests
cd BackEnd/llm-service && PYTHONPATH=. python3 -m pytest tests/ -q

# Retrieval relevance only
cd BackEnd/llm-service && PYTHONPATH=. python3 -m pytest tests/test_retrieval_relevance.py -q

# Busyness — real artifact tests (slow, requires models)
cd BackEnd/busyness-service && PYTHONPATH=. python3 -m pytest tests/ -m artifact -q
```

### Cypress E2E
```bash
# All specs (headless)
cd frontend && npx cypress run --spec "cypress/e2e/*.cy.js"

# Single spec
cd frontend && npx cypress run --spec "cypress/e2e/basic.cy.js"

# Interactive mode (headed browser)
cd frontend && npx cypress open
```

---

## Test Design Principles

- **AAA Pattern:** Arrange, Act, Assert — every test follows clear setup → action → verification.
- **Isolation:** Tests do not depend on execution order or shared mutable state.
- **Mock External Boundaries:** ML services, Google Routes API, Hugging Face API are mocked at the service boundary. Real calls only in smoke/artifact tiers.
- **`data-testid` Selectors:** Cypress and Vitest component tests use `data-testid` attributes, not CSS class names or XPath, for reliable element selection.
- **Env Var Names Only:** Tests reference environment variable names (`APP_JWT_SECRET`) without hardcoding values. Secrets are never committed.

---

## Test Coverage Summary

| Layer | Files | Coverage | v0.1 Status |
|-------|-------|----------|-------------|
| Backend controllers | 8 test files | 100% (8/8 controllers) | ✅ Verified (TEST-02) |
| Backend services | 12 test files | 80% (10/12 services) | ✅ Verified |
| Backend repositories | 5 test files | Full data-access coverage | ✅ Verified |
| Frontend components/services | 11 test files | Core flows + cache + auth | ✅ Verified |
| Python LLM service | 10 test files | Health, search, chat, retrieval, FAISS | ✅ Verified (TEST-04) |
| Python Busyness service | 4 test files | Health, prediction, forecast, cache | ✅ Verified (TEST-04) |
| Cypress E2E | 4 suites (19 tests) | Core user journeys | ✅ Passed |
| Docker smoke | 1 script (5 checks) | Production-like stack | ✅ Implemented (TEST-05) |
| Artifact verification | 1 script (70 checksums) | All runtime binaries | ✅ Implemented (ART-04) |

---

## Troubleshooting

### Backend Tests Fail with Mockito Errors
Ensure the test JVM supports inline mock maker. Use the Maven wrapper:
```bash
cd BackEnd && ./mvnw test
```

### Frontend Tests Fail with Import Errors
Ensure `@vitejs/plugin-react` is configured in `vitest.config.js` for JSX transform:
```bash
cd frontend && npm install && npm test -- --run
```

### Python Tests Fail with Import Errors
Set `PYTHONPATH` to the service root:
```bash
cd BackEnd/llm-service && PYTHONPATH=. python3 -m pytest tests/ -q
```

### Cypress Times Out
Ensure the application is running (dev server or Docker):
```bash
# Option A: Docker
docker compose up -d

# Option B: Dev server
cd frontend && npm run dev
```

### compose-smoke.sh Fails
- Ensure Docker daemon is running (`docker info`)
- `.env` file must exist with all required variables (see [Security](SECURITY.md))
- At least 3 GiB memory available for LLM service container
- Use `--teardown` flag to clean up after the run
