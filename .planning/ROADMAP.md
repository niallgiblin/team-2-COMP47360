# Roadmap: v0.1 Address Codebase Concerns

**Created:** 2026-05-25
**Source:** `.planning/codebase/CONCERNS.md`
**Goal:** Address every audited concern through sequenced, testable remediation phases.

## Overview

| Phase | Name | Goal | Requirements |
|-------|------|------|--------------|
| 1 | 3/3 | Complete    | 2026-05-25 |
| 2 | Frontend Production Runtime and API Client | Replace the frontend dev-server container path and centralize browser API routing/contracts. | DEP-01, DEP-02, DEP-03, API-04, TEST-03 |
| 3 | Secret and Runtime Configuration Hygiene | Remove committed secret-bearing config assumptions and make service paths environment-driven. | DEP-04, DEP-05, SEC-01, SEC-02 |
| 4 | Security Boundary and Abuse Controls | Harden public routes, CORS, uploads, exception payloads, and expensive endpoint access. | SEC-03, SEC-04, SEC-06, SEC-07, TEST-02 |
| 5 | API Contract Alignment and LLM Smoke Tests | Align chat/search/similar contracts and add typed Spring-to-Flask verification. | API-01, API-02, API-03, API-05, ML-01, MAINT-02, MAINT-03, TEST-04 |
| 6 | 4/4 | Complete    | 2026-05-26 |
| 7 | LLM Search Scaling and Python Service Maintainability | Reduce semantic-search scaling risk and document worker/runtime dependency boundaries. | ML-04, ML-05, PERF-03, PERF-06, MAINT-04 |
| 8 | Map, Forecast, Routing, and External API Correctness | Fix known frontend map bugs and reduce duplicated geospatial/route work. | SEC-08, MAP-01, MAP-02, MAP-03, MAP-04, MAP-05, PERF-04, MAINT-01 |
| 9 | 5/5 | Complete    | 2026-05-28 |
| 10 | 1/5 | In Progress|  |

## Phase Details

### Phase 1: Planning Baseline and Artifact Policy

**Goal:** Establish a remediation baseline before changing behavior.

**Concern coverage:**
- Large generated and model artifacts in the working tree.
- Missing full concern-to-phase traceability.
- Need a baseline test matrix before remediation begins.

**Requirements:** ART-01, ART-02, ART-03, ART-04, TEST-01, TEST-06

**Plans:** 3/3 plans complete

Plans:
**Wave 1**
- [x] 01-01-PLAN.md - Repository metadata ownership
- [x] 01-02-PLAN.md - Artifact manifest and checksum policy

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 01-03-PLAN.md - Baseline verification and traceability

**Work outline:**
- Audit tracked generated outputs and large ML/data artifacts.
- Decide which artifacts remain in git as metadata and which move to release/object storage or Git LFS-managed runtime delivery.
- Update ignore rules and documentation without deleting required runtime inputs blindly.
- Define baseline commands for backend, frontend, Python service, and Docker smoke verification.
- Confirm every concern in `.planning/codebase/CONCERNS.md` is represented by at least one requirement and phase.

**Success criteria:**
1. `git status` and repository documentation make generated-output ownership explicit.
2. Model and embedding artifacts have documented storage, checksum, and runtime path expectations.
3. A baseline verification matrix names commands, expected outcomes, and known gaps.
4. Requirement traceability shows 100 percent coverage for v0.1.

### Phase 2: Frontend Production Runtime and API Client

**Goal:** Make frontend deployment and browser API behavior consistent across local, Docker, and Nginx paths.

**Concern coverage:**
- Frontend production image runs the dev server.
- API URL configuration is duplicated and inconsistent.
- Frontend contract tests cover only a subset of API clients.

**Requirements:** DEP-01, DEP-02, DEP-03, API-04, TEST-03

**Plans:** 3 plans

Plans:
**Wave 1** *(parallel — no shared files)*
- [x] 02-01-PLAN.md — Production Docker/Nginx deployment (DEP-01, DEP-02)
- [x] 02-02-PLAN.md — API URL resolver and client foundation (DEP-02, DEP-03, API-04 partial)

**Wave 2** *(depends on Wave 1)*
- [x] 02-03-PLAN.md — Contract tests, auth expiry, remaining callers (API-04, TEST-03)

**Work outline:**
- Convert `frontend/Dockerfile` to build static assets and serve `dist/` from Nginx.
- Align `frontend/nginx.conf`, root `nginx/nginx.conf`, and Vite proxy behavior around relative `/api/*` paths.
- Create one frontend API client module that reads `VITE_API_BASE_URL`, supports relative production routing, and attaches auth headers consistently.
- Move Auth, Plan, Like, Vibe, and chat callers toward that boundary.
- Add frontend service tests for relative paths, auth headers, chat URL behavior, favourites, plan sharing, and auth expiry.

**Success criteria:**
1. Production frontend container starts without `npm run dev`.
2. API base URL resolution is tested in local and production-style modes.
3. Existing frontend tests pass with the consolidated API boundary.
4. No page or context retains an untested hard-coded localhost API default.

### Phase 3: Secret and Runtime Configuration Hygiene

**Goal:** Remove high-risk configuration assumptions before exposing or expanding service access.

**Concern coverage:**
- Checked-in configuration declares secret-bearing properties.
- ML service paths assume Docker filesystem layout.
- Runtime model/data paths need explicit configuration.

**Requirements:** DEP-04, DEP-05, SEC-01, SEC-02

**Plans:** 5 plans

Plans:
**Wave 1** *(parallel — no shared runtime files between 01/03/04)*
- [x] 03-01-PLAN.md — Spring properties + VibeService ML URLs (SEC-01, DEP-05)
- [x] 03-03-PLAN.md — StartupConfigValidator + test (SEC-01, TDD)
- [x] 03-04-PLAN.md — Python path wiring busyness + LLM (DEP-04)

**Wave 2** *(depends on Wave 1)*
- [x] 03-02-PLAN.md — AuthController + AvatarController avatar paths (DEP-05, depends 01)
- [x] 03-05-PLAN.md — Rotation runbook, env.example, Compose, docs (SEC-02, DEP-05, depends 01+04)

**Work outline:**
- Replace committed Spring secret values with environment placeholders and safe defaults only where non-sensitive.
- Update `env.example` and docs with required variable names and no real values.
- Add a rotation checklist for any credentials/JWT material that may have been committed.
- Make LLM and busyness service paths configurable with repo-relative development defaults.
- Add configuration validation errors that are clear without leaking secret values.

**Success criteria:**
1. Committed config no longer contains real database credentials or JWT signing material.
2. Local Python service startup can resolve development paths without `/app` mirroring.
3. Deployment docs distinguish required secrets from safe examples.
4. Rotation guidance exists for previously committed secrets.

### Phase 4: Security Boundary and Abuse Controls

**Goal:** Harden exposed routes and error boundaries for safer public deployment.

**Concern coverage:**
- Public expensive endpoints lack auth and rate limiting.
- CORS is permissive across Java and Flask services.
- Avatar upload trusts client content type and public file names.
- Exceptions expose server messages to clients.
- Security boundary tests are incomplete.

**Requirements:** SEC-03, SEC-04, SEC-06, SEC-07, TEST-02

**Plans:** 8 plans (6 complete + 2 gap closure)

Plans:
**Wave 1** *(parallel — no shared files between 01/02/03/04/05/06)*
- [x] 04-01-PLAN.md — Expensive route auth, rate limits, parameter bounds (SEC-03, SEC-07)
- [x] 04-02-PLAN.md — Client-safe exception payloads (SEC-04)
- [x] 04-03-PLAN.md — Avatar upload magic-byte validation (SEC-06)
- [x] 04-04-PLAN.md — Security boundary integration tests (TEST-02)
- [x] 04-05-PLAN.md — Spring CORS and security config hardening (SEC-03)
- [x] 04-06-PLAN.md — Flask CORS allowlists, private exposure, JWT chat (SEC-03, SEC-04)

**Wave 1 — gap closure** *(parallel — UAT failures Tests 6 & 8)*
- [x] 04-07-PLAN.md — Vite dev /avatars proxy for avatar display (SEC-06, TEST-02)
- [x] 04-08-PLAN.md — Chat loc_type fix + supported HF model (SEC-03, TEST-02)

**Work outline:**
- Classify expensive endpoints by public, authenticated, internal-only, or rate-limited access.
- Add per-IP and/or per-user limits where product flow allows, and bound request parameters such as `maxResults`.
- Restrict Flask CORS to configured frontend origins.
- Validate avatar upload magic bytes and allowed extensions, and document storage assumptions.
- Replace generic exception message exposure with stable client-safe error responses.
- Add backend/security tests for route authorization, CORS, upload rejection, JWT failures, and error payloads.

**Success criteria:**
1. Expensive ML and map endpoints have explicit access and quota behavior.
2. Flask services no longer use broad CORS defaults in deployable configuration.
3. Invalid avatar uploads are rejected by content validation tests.
4. Client error payloads do not include raw exception details.

### Phase 5: API Contract Alignment and LLM Smoke Tests

**Goal:** Make frontend, Spring, and LLM Flask service contracts agree and stay tested.

**Concern coverage:**
- AI similar-location endpoint calls a Flask endpoint that is not implemented.
- Chat widget request contract does not match the Flask chat endpoint.
- Java service parses untyped ML responses manually.
- LLM service lacks smoke tests.
- `FindMyVibe.jsx`, `VibeService.java`, and LLM integration are high-risk mixed-responsibility areas.

**Requirements:** API-01, API-02, API-03, API-05, ML-01, MAINT-02, MAINT-03, TEST-04

**Plans:** 7 plans

Plans:
**Wave 0** *(Nyquist pre-work — fixtures + failing stubs)*
- [x] 05-01-PLAN.md — Contract fixtures, DTO stubs, pytest/Vitest failing stubs (API-02 partial, API-03, API-05 partial, ML-01 partial, TEST-04)

**Wave 1** *(depends on Wave 0)*
- [x] 05-02-PLAN.md — Flask POST /similar + route smoke tests (API-01 partial, ML-01, TEST-04)

**Wave 2** *(depends on Wave 0 + 1)*
- [x] 05-03-PLAN.md — Spring venue payload, DTO mapping, source indicator (API-01, API-03)

**Wave 3** *(depends on Wave 0; parallel with 2 after 01)*
- [x] 05-04-PLAN.md — Frontend chatAPI adapter + Vitest (API-02, MAINT-02)

**Wave 4** *(depends on Wave 0 + 2)*
- [x] 05-05-PLAN.md — Java contract tests with shared fixtures (API-05)

**Wave 5** *(depends on Wave 2 + 4)*
- [x] 05-06-PLAN.md — MlServiceClient extraction (MAINT-03, API-03)

**Gap Closure** *(from Phase 5 UAT)*
- [x] 05-07-PLAN.md — LLM Docker cold-start PyJWT dependency fix (ML-01, TEST-04)

**Work outline:**
- Decide whether to implement `/similar` in Flask or retarget Spring to a supported endpoint.
- Align chat request history naming and routing between `AIChatWidget.jsx`, proxy config, and Flask `/api/chat`.
- Define typed Java DTOs for ML search, similar results, busyness, forecasts, and chat where Spring owns the contract.
- Add Spring-to-Flask contract tests using mocked Flask responses.
- Add LLM service smoke tests for startup, `/health`, `/search`, `/api/chat`, error paths, and dependency fallbacks.
- Extract focused client/mapping/cache modules from `FindMyVibe.jsx` and `VibeService.java` only as needed to make contracts testable.

**Success criteria:**
1. Similar-location requests no longer rely on an unimplemented endpoint.
2. Chat history is preserved across frontend and Flask contract tests.
3. ML response shape changes fail typed tests instead of runtime casts.
4. LLM smoke tests can run locally without live Hugging Face calls.

### Phase 6: Busyness Service Reliability and Model Safety

**Goal:** Make busyness prediction startup, caching, forecast behavior, and model loading safer.

**Concern coverage:**
- Python ML services are untested.
- Busyness prediction performs many model calls per cache miss.
- Model loading enables unsafe Keras deserialization.
- Keras model compatibility relies on fallback loading.
- Prediction service capacity is limited by TensorFlow model count.

**Requirements:** SEC-05, ML-02, ML-03, ML-06, PERF-01, PERF-02

**Plans:** 4/4 plans complete

Plans:
**Wave 0** *(Nyquist pre-work — artifact-free tests and failing stubs)*
- [x] 06-01-PLAN.md — Busyness pytest harness and red smoke/model-safety tests (SEC-05, ML-02, ML-03, ML-06, PERF-01, PERF-02)

**Wave 1** *(depends on Wave 0; plans 02 and 03 can run in parallel)*
- [x] 06-02-PLAN.md — Checksum-gated model loading and Keras safety (SEC-05, ML-06)
- [x] 06-03-PLAN.md — Bounded live/forecast caches and split compute paths (ML-02, ML-03, PERF-01, PERF-02)

**Wave 2** *(depends on Wave 1)*
- [x] 06-04-PLAN.md — Optional artifact tier, docs, config alignment, and final verification (SEC-05, ML-02, ML-03, ML-06, PERF-01, PERF-02)

**Work outline:**
- Add busyness smoke tests for startup, `/health`, `/busyness`, live predictions, forecast response shape, weather fallback, and normalization.
- Split or cache live and forecast computation so one request does not repeat all model paths unnecessarily.
- Add bounded cache behavior with TTL and clear invalidation semantics.
- Add checksum validation and startup tests for required model files.
- Remove unsafe deserialization if re-exported models allow it; otherwise isolate and document trusted artifact assumptions.
- Evaluate scheduled forecast precompute or batching as the preferred implementation path.

**Success criteria:**
1. Busyness service tests catch missing model paths, broken health, and malformed forecast output.
2. `/busyness` does not redundantly recompute avoidable live and forecast model work on every cache miss.
3. Unsafe Keras loading is removed or guarded by documented trusted checks.
4. Cache behavior is bounded and test-covered.

### Phase 7: LLM Search Scaling and Python Service Maintainability

**Goal:** Reduce semantic-search scaling risk and make LLM service internals easier to evolve.

**Concern coverage:**
- LLM search computes full-corpus similarity per request.
- LLM service memory scales with Gunicorn worker count.
- Java search cache has no maximum size.
- Python LLM runtime differs from busyness runtime.
- `BackEnd/llm-service/app.py` mixes endpoint, model, search, cache, and chat logic.

**Requirements:** ML-04, ML-05, PERF-03, PERF-06, MAINT-04

**Plans:** 5 plans

Plans:
**Wave 0** *(Nyquist validation foundation)*
- [x] 07-01-PLAN.md — FAISS/module/cache red tests and Java cache policy tests

**Wave 1** *(depends on Wave 0; Python search and Java cache can run in parallel)*
- [x] 07-02-PLAN.md — FAISS search foundation and loader/DTO modules
- [x] 07-04-PLAN.md — Caffeine bounded Java vibe search cache

**Wave 2** *(depends on Python search foundation)*
- [x] 07-03-PLAN.md — Flask route integration and chat/cache/config extraction

**Wave 3** *(depends on Python route integration and Java cache)*
- [x] 07-05-PLAN.md — Python runtime, Gunicorn memory docs, Docker smoke gates

**Work outline:**
- Measure or document resident memory behavior under current Gunicorn `--preload` and worker settings.
- Add a bounded Java search cache using a standard cache implementation such as Caffeine.
- Reduce LLM search copying and sorting work; consider a vector index such as FAISS if it fits deployment constraints.
- Split LLM app responsibilities into model loading, search service, chat service, cache policy, and endpoint handlers.
- Align Python version lines where compatible, or document why they must differ and cover both with smoke tests.

**Success criteria:**
1. Search cache has both TTL and maximum size.
2. LLM search avoids unnecessary DataFrame copies and has a documented path to ANN/vector indexing.
3. Worker count and preload tradeoffs are documented with memory implications.
4. LLM service modules can be tested without importing the entire Flask app side effects.

### Phase 8: Map, Forecast, Routing, and External API Correctness

**Goal:** Fix known frontend map/routing bugs and reduce direct external API fragility.

**Concern coverage:**
- Forecast timestamp generator returns 11 hours for a 12-hour forecast.
- Directions step distance is populated with duration text.
- Directions flow duplicates external route calls.
- Frontend polygon enrichment repeats expensive point-in-polygon work.
- Browser-exposed Google API key must be tightly restricted.
- Map and directions behavior is under-covered relative to complexity.
- `MapView.jsx` is a large mixed-responsibility file.

**Requirements:** SEC-08, MAP-01, MAP-02, MAP-03, MAP-04, MAP-05, PERF-04, MAINT-01

**Plans:** 5 plans

Plans:
**Wave 0** *(Nyquist validation foundation)*
- [x] 08-01-PLAN.md — Frontend route, forecast, cache, zone, and MapView red tests

**Wave 1** *(depends on Wave 0; parallel — no shared implementation files)*
- [x] 08-02-PLAN.md — Forecast fallback and zone enrichment utilities
- [x] 08-03-PLAN.md — Google Routes client, normalizer, and route segment cache
- [x] 08-05-PLAN.md — Backend zoneId DTO support and Google key restriction docs

**Wave 2** *(depends on Wave 1)*
- [x] 08-04-PLAN.md — MapView and direction drawer wiring

**Work outline:**
- Fix timestamp generation to produce 12 hourly forecast labels.
- Correct route step distance and duration mapping.
- Refactor multi-stop directions to reuse route legs/polyline data and cache route segments by origin, destination, and mode.
- Move route fetching, route processing, polygon enrichment, and directions helpers out of `MapView.jsx` into tested modules.
- Add canonical backend `zoneId` to map/vibe responses where feasible and use client polygon lookup only as fallback.
- Document Google API key referrer/API restrictions or create a backend proxy plan with user-level limits.
- Add tests for Google Routes failures, fallback polylines, multi-stop routes, forecast alignment, and polygon edge cases.

**Success criteria:**
1. Forecast UI and backend forecast data agree on 12 hourly points.
2. Route instructions show correct distance and duration fields.
3. Multi-stop route workflows do not duplicate external API calls for the same segment data.
4. Map tests cover the known bug triggers from the concern audit.

### Phase 9: Persistence, Import, and Auth Flow Safety

**Goal:** Replace fragile persistence/import/auth behaviors with explicit tested patterns.

**Concern coverage:**
- No database migration workflow detected.
- CSV import uses regex splitting and one-time seeding.
- Default `Location` constructor omits fields from its parameter list.
- Plan controller mixes stateless JWT with session fallback.

**Requirements:** DATA-01, DATA-02, DATA-03, DATA-04

**Plans:** 5/5 plans complete

Plans:
**Wave 0** *(Nyquist validation foundation)*
- [x] 09-01-PLAN.md — CSV fixtures, LocationCsvImporter red tests, LocationFieldPreservationTest (DATA-02, DATA-03)

**Wave 1** *(depends on Wave 0)*
- [x] 09-02-PLAN.md — Flyway V1 baseline, validate mode, migration smoke (DATA-01)

**Wave 2** *(depends on Wave 0–1; parallel — no shared files)*
- [x] 09-03-PLAN.md — OpenCSV LocationCsvImporter + DataInitializer delegation (DATA-02)
- [x] 09-05-PLAN.md — PlanController @AuthenticationPrincipal + test alignment (DATA-04)

**Wave 3** *(depends on 09-03)*
- [x] 09-04-PLAN.md — Remove broken Location constructor (DATA-03)

**Work outline:**
- Introduce an explicit database migration tool and baseline migration for current schema assumptions.
- Replace manual CSV splitting with a parser library and tests for quotes, commas, empty fields, and deterministic upserts.
- Fix `Location` construction or remove unsafe constructor usage so `information`, `summary`, and `tags` are populated predictably.
- Update `PlanController` to use `@AuthenticationPrincipal UserPrincipal` consistently.
- Ensure existing controller/service tests remain green and add targeted tests for the changed behaviors.

**Success criteria:**
1. Schema changes have an explicit migration path.
2. CSV import tests cover quoted edge cases and repeatable upsert behavior.
3. Constructor-created `Location` objects preserve all intended fields.
4. Plan controller tests pass without relying on HTTP session fallback.

### Phase 10: Cache Ownership, Map Scaling, and Docker Smoke Closure

**Goal:** Close cross-cutting cache/scaling risks and verify the hardened stack end to end.

**Concern coverage:**
- Caches are implemented as process globals and browser globals.
- Public map data returns all locations.
- Docker/proxy/service health needs smoke coverage.
- Several scaling limits need clear next steps after immediate remediation.

**Requirements:** PERF-05, MAINT-05, TEST-05

**Plans:** 1/5 plans executed

Plans:
**Wave 0** *(Nyquist red tests + smoke skeleton)*
- [x] 10-01-PLAN.md — Bbox red tests, boundedCache red tests, compose-smoke stub (PERF-05, MAINT-05, TEST-05 partial)

**Wave 1** *(depends on Wave 0)*
- [ ] 10-02-PLAN.md — Backend bbox filtering + Caffeine busyness/map-data caches (PERF-05, MAINT-05)

**Wave 2** *(depends on Wave 1)*
- [ ] 10-03-PLAN.md — Frontend createBoundedCache + MapView bbox fetch (PERF-05, MAINT-05)

**Wave 3** *(depends on Wave 2)*
- [ ] 10-04-PLAN.md — Auth invalidation + BusynessContext session guard (MAINT-05)

**Wave 4** *(depends on Waves 1 + 3)*
- [ ] 10-05-PLAN.md — compose-smoke.sh + cache inventory + baseline docs (TEST-05, MAINT-05, PERF-05 deferral)

**Work outline:**
- Inventory browser and process-global caches across BusynessContext, MapView, FindMyVibe, VibeService, LLM service, and busyness service.
- Assign explicit owners, TTLs, max sizes, invalidation paths, and refresh behavior for each cache.
- Add map data pagination, tiling, viewport filtering, or a documented staged rollout if backend/API changes are too large for one phase.
- Add Docker Compose smoke checks for frontend static serving, backend health, LLM health, busyness health, and proxy routing.
- Record any remaining scaling work as v0.2 requirements or backlog items with evidence.

**Success criteria:**
1. No cache listed in the concern audit remains ownerless or unbounded without a documented reason.
2. Map data has a concrete scaling path and at least one tested reduction in unnecessary full-load behavior.
3. Compose smoke checks verify the production-like container path.
4. Remaining scale work is explicitly deferred with requirement IDs or backlog references.

## Concern Coverage Matrix

| Concern Area | Covered By |
|--------------|------------|
| Large generated/model artifacts in working tree | Phase 1 |
| Frontend production image runs dev server | Phase 2 |
| API URL duplication/inconsistency | Phase 2 |
| Large modules mixing responsibilities | Phases 5, 7, 8 |
| Browser/process global caches | Phases 6, 7, 10 |
| Missing `/similar` endpoint | Phase 5 |
| Chat widget contract mismatch | Phase 5 |
| 11-hour forecast timestamp bug | Phase 8 |
| Directions distance/duration bug | Phase 8 |
| `Location` constructor omission | Phase 9 |
| Committed secret-bearing config | Phase 3 |
| Public expensive endpoints lack controls | Phase 4 |
| Permissive CORS | Phase 4 |
| Unsafe Keras deserialization | Phase 6 |
| Avatar upload validation | Phase 4 |
| Exception message exposure | Phase 4 |
| Browser Google API key restrictions | Phase 8 |
| Prediction model-call overhead | Phase 6 |
| LLM full-corpus similarity scan | Phase 7 |
| Repeated point-in-polygon enrichment | Phase 8 |
| Duplicate route calls | Phase 8 |
| Docker-only ML paths | Phase 3 |
| Untyped Java ML responses | Phase 5 |
| Plan controller session fallback | Phase 9 |
| Regex CSV import and one-time seed | Phase 9 |
| Java search cache without max size | Phase 7 |
| LLM worker memory scaling | Phase 7 |
| TensorFlow model count scaling | Phase 6 |
| Public map data returns all locations | Phase 10 |
| Keras compatibility fallback risk | Phase 6 |
| Python runtime line mismatch | Phase 7 |
| Direct external route providers | Phase 8 |
| No abuse controls | Phase 4 |
| No database migration workflow | Phase 9 |
| No Python service health smoke tests | Phases 5, 6 |
| Security boundary test gaps | Phase 4 |
| Map/directions test gaps | Phase 8 |
| Frontend service contract test gaps | Phase 2 |

## Execution Notes

- Start with Phase 1 before modifying code so artifact ownership and verification commands are explicit.
- Security and contract phases should land before performance phases where possible; rate limits and typed contracts reduce blast radius while optimizing.
- Phases 5 through 8 may expose additional hidden bugs. Add new requirements only when they are direct descendants of the audited concerns.
- Keep each phase independently shippable and verifiable.

---
*Roadmap created: 2026-05-25*
